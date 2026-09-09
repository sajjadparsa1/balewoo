<?php
/**
 * Webhook receiver for Bale / Telegram updates.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Webhook' ) ) {

	/**
	 * Registers and handles bot webhooks.
	 */
	class BaleWoo_Webhook {

		/**
		 * Register routes and the query-var fallback.
		 *
		 * @return void
		 */
		public static function init() {
			add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
			add_action( 'init', array( __CLASS__, 'maybe_handle_query_var' ) );
		}

		/**
		 * REST routes.
		 *
		 * @return void
		 */
		public static function register_routes() {
			register_rest_route(
				'balewoo/v1',
				'/webhook/(?P<platform>bale|telegram)/(?P<secret>[a-zA-Z0-9\-_]+)',
				array(
					'methods'             => WP_REST_Server::ALLMETHODS,
					'callback'            => array( __CLASS__, 'handle' ),
					'permission_callback' => '__return_true',
				)
			);

			register_rest_route(
				'balewoo/v1',
				'/pay/(?P<order_id>\d+)',
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'pay_status' ),
					'permission_callback' => '__return_true',
				)
			);
		}

		/**
		 * Fallback endpoint: https://site.com/?balewoo_webhook=bale&secret=xxxx
		 *
		 * @return void
		 */
		public static function maybe_handle_query_var() {
			$platform = isset( $_GET['balewoo_webhook'] ) ? sanitize_key( wp_unslash( $_GET['balewoo_webhook'] ) ) : '';
			if ( ! in_array( $platform, array( 'bale', 'telegram' ), true ) ) {
				return;
			}

			$secret = isset( $_GET['secret'] ) ? sanitize_text_field( wp_unslash( $_GET['secret'] ) ) : '';
			$update = self::read_update();

			self::process( $platform, $secret, $update );
		}

		/**
		 * REST handler.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle( $request ) {
			$platform = $request->get_param( 'platform' );
			$secret   = $request->get_param( 'secret' );
			$update   = $request->get_json_params();

			if ( empty( $update ) || ! is_array( $update ) ) {
				$update = $request->get_params();
				unset( $update['platform'], $update['secret'], $update['rest_route'], $update['_locale'], $update['_wpnonce'] );
			}

			return self::process( $platform, $secret, $update );
		}

		/**
		 * Polling endpoint used by the pay page.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function pay_status( $request ) {
			$order_id = absint( $request->get_param( 'order_id' ) );
			$key      = sanitize_text_field( (string) $request->get_param( 'key' ) );
			$order    = wc_get_order( $order_id );

			if ( ! $order || ! hash_equals( $order->get_order_key(), $key ) ) {
				return new WP_REST_Response( array( 'ok' => false, 'error' => 'order_not_found' ), 404 );
			}

			$paid = in_array( $order->get_status(), array( 'processing', 'completed' ), true );

			return new WP_REST_Response(
				array(
					'ok'       => true,
					'paid'     => $paid,
					'status'   => $order->get_status(),
					'failed'   => in_array( $order->get_status(), array( 'failed', 'cancelled' ), true ),
					'redirect' => $paid ? $order->get_checkout_order_received_url() : '',
				),
				200
			);
		}

		/**
		 * Read raw update from php://input.
		 *
		 * @return array
		 */
		public static function read_update() {
			$raw   = file_get_contents( 'php://input' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$update = json_decode( $raw, true );
			if ( ! is_array( $update ) ) {
				$update = array();
			}
			return $update;
		}

		/**
		 * Validate secret and dispatch the update.
		 *
		 * @param string $platform bale|telegram.
		 * @param string $secret   Secret from URL.
		 * @param array  $update   Update payload.
		 * @return WP_REST_Response
		 */
		public static function process( $platform, $secret, $update ) {
			if ( ! hash_equals( (string) BaleWoo_Settings::webhook_secret(), (string) $secret ) ) {
				BaleWoo_Logger::warning( 'Webhook rejected — invalid secret.' );
				return new WP_REST_Response( array( 'ok' => false, 'error' => 'invalid_secret' ), 403 );
			}

			if ( empty( $update ) ) {
				return new WP_REST_Response( array( 'ok' => true, 'result' => 'empty' ), 200 );
			}

			BaleWoo_Logger::add(
				sprintf( 'Webhook received (%s): %s', $platform, self::describe( $update ) ),
				'info',
				$update
			);

			if ( isset( $update['pre_checkout_query'] ) ) {
				self::handle_pre_checkout( $platform, $update['pre_checkout_query'] );
			} elseif ( isset( $update['callback_query'] ) ) {
				self::handle_callback( $platform, $update['callback_query'] );
			} elseif ( isset( $update['message'] ) ) {
				self::handle_message( $platform, $update['message'] );
			} elseif ( isset( $update['edited_message'] ) ) {
				self::handle_message( $platform, $update['edited_message'] );
			}

			return new WP_REST_Response( array( 'ok' => true, 'result' => 'processed' ), 200 );
		}

		/**
		 * Short human description of an update (for logs).
		 *
		 * @param array $update Update.
		 * @return string
		 */
		public static function describe( $update ) {
			if ( isset( $update['callback_query'] ) ) {
				return 'callback ' . ( isset( $update['callback_query']['data'] ) ? $update['callback_query']['data'] : '' );
			}
			if ( isset( $update['pre_checkout_query'] ) ) {
				return 'pre_checkout ' . ( isset( $update['pre_checkout_query']['invoice_payload'] ) ? $update['pre_checkout_query']['invoice_payload'] : '' );
			}
			if ( isset( $update['message'] ) ) {
				$message = $update['message'];
				if ( isset( $message['successful_payment'] ) ) {
					return 'successful_payment ' . ( isset( $message['successful_payment']['invoice_payload'] ) ? $message['successful_payment']['invoice_payload'] : '' );
				}
				if ( isset( $message['photo'] ) ) {
					return 'photo (receipt)';
				}
				if ( isset( $message['contact'] ) ) {
					return 'contact';
				}
				if ( isset( $message['text'] ) ) {
					return 'message: ' . mb_substr( $message['text'], 0, 80 );
				}
			}
			return 'unknown update';
		}

		/**
		 * Build the API client for a platform.
		 *
		 * @param string $platform bale|telegram.
		 * @return BaleWoo_API_Bale|BaleWoo_API_Telegram
		 */
		public static function client( $platform ) {
			return 'telegram' === $platform ? new BaleWoo_API_Telegram() : new BaleWoo_API_Bale();
		}

		/**
		 * Admin chat id for a platform.
		 *
		 * @param string $platform bale|telegram.
		 * @return string
		 */
		public static function admin_chat_id( $platform ) {
			return 'telegram' === $platform ? BaleWoo_Settings::get( 'telegram_admin_chat_id' ) : BaleWoo_Settings::get( 'bale_admin_chat_id' );
		}

		/**
		 * Whether the sender is a shop admin.
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $from     The "from" object of the update.
		 * @return bool
		 */
		public static function is_admin( $platform, $from ) {
			$admin = self::admin_chat_id( $platform );
			if ( ! $admin ) {
				// اگر هنوز تنظیم نشده، اولین کاربر تعامل‌کننده به عنوان مدیر ذخیره می‌شود.
				$chat_id = isset( $from['id'] ) ? (string) $from['id'] : '';
				if ( $chat_id ) {
					self::set_admin_chat_id( $platform, $chat_id );
					BaleWoo_Logger::warning( sprintf( 'Admin chat id for %s auto-set to %s', $platform, $chat_id ) );
					return true;
				}
				return false;
			}
			return (string) $from['id'] === (string) $admin;
		}

		/**
		 * Persist admin chat id.
		 *
		 * @param string $platform bale|telegram.
		 * @param string $chat_id  Chat id.
		 * @return void
		 */
		public static function set_admin_chat_id( $platform, $chat_id ) {
			$settings = get_option( BALEWOO_OPTION, array() );
			$settings = is_array( $settings ) ? $settings : array();
			$key      = 'telegram' === $platform ? 'telegram_admin_chat_id' : 'bale_admin_chat_id';
			$settings[ $key ] = sanitize_text_field( $chat_id );
			update_option( BALEWOO_OPTION, $settings );
		}

		/* ------------------------------------------------------------------ */
		/* Handlers                                                            */
		/* ------------------------------------------------------------------ */

		/**
		 * Handle an incoming message.
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $message  Message object.
		 * @return void
		 */
		public static function handle_message( $platform, $message ) {
			$client  = self::client( $platform );
			$chat_id = isset( $message['chat']['id'] ) ? $message['chat']['id'] : '';
			$from    = isset( $message['from'] ) ? $message['from'] : array();
			$user_id = isset( $from['id'] ) ? (string) $from['id'] : '';

			// 1) پرداخت موفق کیف پول بله.
			if ( isset( $message['successful_payment'] ) ) {
				self::handle_successful_payment( $platform, $message );
				return;
			}

			// 2) ارسال عکس = رسید پرداخت.
			if ( isset( $message['photo'] ) && is_array( $message['photo'] ) ) {
				self::handle_receipt_photo( $platform, $message );
				return;
			}

			// 3) اشتراک شماره تلفن.
			if ( isset( $message['contact'] ) ) {
				$phone = isset( $message['contact']['phone_number'] ) ? $message['contact']['phone_number'] : '';
				if ( $user_id ) {
					update_user_meta( self::user_id_by_chat( $platform, $user_id ), '_balewoo_phone', sanitize_text_field( $phone ) );
				}
				if ( $client->is_configured() && $chat_id ) {
					$client->send_message( $chat_id, "✅ " . __( 'شماره شما ثبت شد. حالا می‌توانید تصویر رسید را ارسال کنید.', 'balewoo' ) );
				}
				return;
			}

			$text = isset( $message['text'] ) ? trim( $message['text'] ) : '';
			if ( '' === $text ) {
				return;
			}

			// 4) دستور /start با پارامتر (اتصال حساب به سفارش).
			if ( 0 === strpos( $text, '/start' ) ) {
				$param = trim( substr( $text, 6 ) );
				self::handle_start( $platform, $message, $param );
				return;
			}

			// 5) دستورات مدیر.
			if ( self::is_admin( $platform, $from ) ) {
				$lower = mb_strtolower( $text );
				if ( in_array( $lower, array( '/report', 'گزارش' ), true ) ) {
					$client->send_message( $chat_id, BaleWoo_Notifier::report_text( 1 ) );
					return;
				}
				if ( in_array( $lower, array( '/pending', 'در انتظار' ), true ) ) {
					$result = BaleWoo_Transactions::query( array( 'status' => 'pending', 'per_page' => 10 ) );
					if ( empty( $result['items'] ) ) {
						$client->send_message( $chat_id, '✅ ' . __( 'هیچ سفارش در انتظاری وجود ندارد.', 'balewoo' ) );
						return;
					}
					foreach ( $result['items'] as $row ) {
						$order = wc_get_order( $row->order_id );
						if ( $order ) {
							$client->send_message( $chat_id, self::order_summary( $order ), BaleWoo_Notifier::admin_keyboard( $order ) );
						}
					}
					return;
				}
			}

			// 6) بقیه پیام‌ها.
			if ( $client->is_configured() && $chat_id ) {
				$client->send_message(
					$chat_id,
					"👋 " . sprintf( __( 'سلام! من ربات فروشگاه %s هستم.', 'balewoo' ), get_bloginfo( 'name' ) ) . "\n\n"
					. __( 'برای پیگیری سفارش، روی دکمه «پیگیری سفارش» در سایت بزنید تا به اینجا متصل شوید.', 'balewoo' )
				);
			}
		}

		/**
		 * Handle /start with optional deep-link parameter.
		 *
		 * Supported params:
		 *  - order_{id}_{key} : link chat to an order
		 *  - user_{id}_{hash} : link chat to a WP user
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $message  Message.
		 * @param string $param    Deep-link param.
		 * @return void
		 */
		public static function handle_start( $platform, $message, $param ) {
			$client   = self::client( $platform );
			$chat_id  = isset( $message['chat']['id'] ) ? $message['chat']['id'] : '';
			$from     = isset( $message['from'] ) ? $message['from'] : array();
			$username = isset( $from['first_name'] ) ? $from['first_name'] : '';

			$welcome = sprintf( __( 'سلام %s عزیز 👋', 'balewoo' ), $username ) . "\n";

			if ( preg_match( '/^order_(\d+)_(\w+)$/', $param, $matches ) ) {
				$order = wc_get_order( (int) $matches[1] );
				if ( $order && hash_equals( $order->get_order_key(), $matches[2] ) ) {
					$order->update_meta_data( '_balewoo_chat_id', $chat_id );
					$order->update_meta_data( '_balewoo_platform', $platform );
					$order->add_order_note( sprintf( __( 'مشتری از طریق ربات %s متصل شد.', 'balewoo' ), 'telegram' === $platform ? 'تلگرام' : 'بله' ) );
					$order->save();

					if ( $order->get_user_id() ) {
						BaleWoo_Orders::set_user_chat_id( $order->get_user_id(), $chat_id, $platform );
					}

					BaleWoo_Transactions::upsert( $order->get_id(), array( 'chat_id' => $chat_id, 'platform' => $platform ) );

					$welcome .= sprintf( __( 'سفارش شماره #%d به حساب شما متصل شد ✅', 'balewoo' ), $order->get_id() ) . "\n";

					if ( ! $order->is_paid() ) {
						$welcome .= "\n" . __( 'اگر مبلغ را واریز کرده‌اید، تصویر رسید را همین‌جا ارسال کنید.', 'balewoo' );
					}

					BaleWoo_Logger::success( sprintf( 'Chat %s linked to order #%d (%s)', $chat_id, $order->get_id(), $platform ) );
				}
			} elseif ( preg_match( '/^user_(\d+)_(\w+)$/', $param, $matches ) ) {
				$user_id = (int) $matches[1];
				$hash    = substr( hash_hmac( 'sha256', $user_id . '|' . wp_salt( 'auth' ), wp_salt( 'auth' ) ), 0, 16 );
				if ( hash_equals( $hash, $matches[2] ) ) {
					BaleWoo_Orders::set_user_chat_id( $user_id, $chat_id, $platform );
					$welcome .= __( 'حساب کاربری شما به ربات متصل شد ✅', 'balewoo' ) . "\n";
				}
			} else {
				$welcome .= __( 'ربات فروشگاه آماده دریافت پیام‌های شماست.', 'balewoo' );
			}

			if ( self::is_admin( $platform, $from ) ) {
				$welcome .= "\n\n" . __( 'شما به عنوان مدیر شناخته شدید و اعلان سفارش‌های جدید برای شما ارسال می‌شود.', 'balewoo' );
			}

			if ( $client->is_configured() && $chat_id ) {
				$client->send_message( $chat_id, $welcome );
			}
		}

		/**
		 * Handle a receipt photo.
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $message  Message.
		 * @return void
		 */
		public static function handle_receipt_photo( $platform, $message ) {
			$client  = self::client( $platform );
			$chat_id = isset( $message['chat']['id'] ) ? $message['chat']['id'] : '';
			$from    = isset( $message['from'] ) ? $message['from'] : array();
			$user_id = isset( $from['id'] ) ? (string) $from['id'] : '';

			$order = self::find_pending_order_for_chat( $platform, $user_id, $chat_id );

			if ( ! $order ) {
				if ( $client->is_configured() && $chat_id ) {
					$client->send_message( $chat_id, __( 'سفارش در انتظار پرداختی برای شما پیدا نشد. لطفاً از طریق دکمه «پیگیری سفارش» در سایت وارد شوید.', 'balewoo' ) );
				}
				BaleWoo_Logger::warning( sprintf( 'Receipt photo without pending order (chat %s)', $chat_id ) );
				return;
			}

			$photos = $message['photo'];
			$largest = end( $photos );
			$file_id = isset( $largest['file_id'] ) ? $largest['file_id'] : '';

			$url = $file_id ? $client->get_file_url( $file_id ) : '';
			if ( is_wp_error( $url ) ) {
				$url = '';
			}

			if ( ! $url ) {
				BaleWoo_Logger::error( sprintf( 'Could not resolve file url for receipt of order #%d', $order->get_id() ) );
				if ( $client->is_configured() ) {
					$client->send_message( $chat_id, __( 'دریافت تصویر رسید ناموفق بود. لطفاً دوباره تلاش کنید.', 'balewoo' ) );
				}
				return;
			}

			// فایل را در رسانه‌های وردپرس ذخیره کن تا لینک دائمی داشته باشیم.
			$saved = self::sideload( $url, 'balewoo-receipt-' . $order->get_id() );
			if ( $saved && ! is_wp_error( $saved ) ) {
				$url = $saved;
			}

			BaleWoo_Orders::save_receipt( $order->get_id(), $url, $platform );

			if ( $client->is_configured() && $chat_id ) {
				$client->send_message( $chat_id, '✅ ' . __( 'رسید شما دریافت شد و برای مدیر ارسال گردید. پس از تأیید، به شما اطلاع داده می‌شود.', 'balewoo' ) );
			}
		}

		/**
		 * Download a remote file into the media library.
		 *
		 * @param string $url      Remote URL.
		 * @param string $filename Base filename.
		 * @return string|WP_Error
		 */
		public static function sideload( $url, $filename ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';

			$tmp = download_url( $url, 30 );
			if ( is_wp_error( $tmp ) ) {
				return $tmp;
			}

			$file_array = array(
				'name'     => sanitize_file_name( $filename . '-' . wp_generate_password( 5, false, false ) . '.jpg' ),
				'tmp_name' => $tmp,
			);

			$id = media_handle_sideload( $file_array, 0 );

			if ( is_wp_error( $id ) ) {
				@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
				return $id;
			}

			return wp_get_attachment_url( $id );
		}

		/**
		 * Handle successful payment (Bale wallet).
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $message  Message.
		 * @return void
		 */
		public static function handle_successful_payment( $platform, $message ) {
			$payment = $message['successful_payment'];
			$payload = isset( $payment['invoice_payload'] ) ? $payment['invoice_payload'] : '';
			$chat_id = isset( $message['chat']['id'] ) ? $message['chat']['id'] : '';
			$client  = self::client( $platform );

			$order_id = self::verify_payload( $payload );

			if ( ! $order_id ) {
				BaleWoo_Logger::error( 'Successful payment with invalid payload: ' . $payload );
				return;
			}

			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				BaleWoo_Logger::error( sprintf( 'Successful payment for missing order #%d', $order_id ) );
				return;
			}

			$charge = isset( $payment['provider_payment_charge_id'] ) ? $payment['provider_payment_charge_id'] : '';

			$order->update_meta_data( '_balewoo_chat_id', $chat_id );
			$order->update_meta_data( '_balewoo_platform', $platform );
			$order->save();

			BaleWoo_Orders::mark_paid_by_bale( $order_id, $charge );

			if ( $client->is_configured() && $chat_id ) {
				$client->send_message(
					$chat_id,
					'🎉 ' . sprintf( __( 'پرداخت سفارش #%d با موفقیت انجام شد.', 'balewoo' ), $order_id ) . "\n"
					. sprintf( __( 'کد پیگیری: %s', 'balewoo' ), $order->get_meta( '_balewoo_tracking', true ) )
				);
			}

			BaleWoo_Logger::success( sprintf( 'Successful payment — order #%d, charge %s', $order_id, $charge ) );
		}

		/**
		 * Handle pre-checkout queries.
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $query    Pre-checkout query.
		 * @return void
		 */
		public static function handle_pre_checkout( $platform, $query ) {
			$client  = self::client( $platform );
			$payload = isset( $query['invoice_payload'] ) ? $query['invoice_payload'] : '';
			$order_id = self::verify_payload( $payload );
			$order    = $order_id ? wc_get_order( $order_id ) : null;

			if ( ! $order || $order->is_paid() ) {
				$error = __( 'این سفارش دیگر قابل پرداخت نیست.', 'balewoo' );
				$client->answer_pre_checkout_query( $query['id'], false, $error );
				BaleWoo_Logger::warning( sprintf( 'Pre-checkout rejected for payload %s', $payload ) );
				return;
			}

			// بررسی مبلغ.
			$expected = BaleWoo_Orders::amount_for_bale( $order );
			$total    = isset( $query['total_amount'] ) ? (int) $query['total_amount'] : $expected;
			if ( $total !== $expected ) {
				$error = __( 'مبلغ سفارش تغییر کرده است. لطفاً دوباره تلاش کنید.', 'balewoo' );
				$client->answer_pre_checkout_query( $query['id'], false, $error );
				BaleWoo_Logger::warning( sprintf( 'Pre-checkout amount mismatch: expected %d got %d', $expected, $total ) );
				return;
			}

			$client->answer_pre_checkout_query( $query['id'], true );

			BaleWoo_Logger::success( sprintf( 'Pre-checkout confirmed — order #%d', $order_id ) );
		}

		/**
		 * Handle inline keyboard callbacks: bpv:{order}:{action}
		 *
		 * @param string $platform bale|telegram.
		 * @param array  $query    Callback query.
		 * @return void
		 */
		public static function handle_callback( $platform, $query ) {
			$client = self::client( $platform );
			$data   = isset( $query['data'] ) ? $query['data'] : '';
			$from   = isset( $query['from'] ) ? $query['from'] : array();
			$id     = isset( $query['id'] ) ? $query['id'] : '';
			$chat_id = isset( $query['message']['chat']['id'] ) ? $query['message']['chat']['id'] : ( isset( $from['id'] ) ? $from['id'] : '' );
			$message_id = isset( $query['message']['message_id'] ) ? $query['message']['message_id'] : 0;

			if ( 0 !== strpos( $data, 'bpv:' ) ) {
				if ( $id && $client->is_configured() ) {
					$client->answer_callback_query( $id );
				}
				return;
			}

			if ( ! self::is_admin( $platform, $from ) ) {
				if ( $id && $client->is_configured() ) {
					$client->answer_callback_query( $id, __( 'شما دسترسی مدیریت این سفارش را ندارید.', 'balewoo' ), true );
				}
				BaleWoo_Logger::warning( sprintf( 'Unauthorized callback from %s', isset( $from['id'] ) ? $from['id'] : '?' ) );
				return;
			}

			$parts = explode( ':', $data );
			$order_id = isset( $parts[1] ) ? absint( $parts[1] ) : 0;
			$action   = isset( $parts[2] ) ? $parts[2] : '';
			$order    = wc_get_order( $order_id );

			if ( ! $order ) {
				if ( $id && $client->is_configured() ) {
					$client->answer_callback_query( $id, __( 'سفارش یافت نشد.', 'balewoo' ), true );
				}
				return;
			}

			switch ( $action ) {
				case 'approve':
					BaleWoo_Orders::approve( $order_id, 'bot' );
					$client->answer_callback_query( $id, '✅ ' . __( 'پرداخت تأیید شد.', 'balewoo' ) );
					$client->edit_message_text( $chat_id, $message_id, self::order_summary( $order ) . "\n\n✅ " . __( 'تأیید شد', 'balewoo' ) . ' — ' . sprintf( __( 'کد پیگیری: %s', 'balewoo' ), $order->get_meta( '_balewoo_tracking', true ) ), BaleWoo_Notifier::admin_keyboard( $order ) );
					break;

				case 'reject':
					BaleWoo_Orders::reject( $order_id, __( 'توسط مدیر از طریق ربات رد شد.', 'balewoo' ), 'bot' );
					$client->answer_callback_query( $id, '❌ ' . __( 'پرداخت رد شد.', 'balewoo' ) );
					$client->edit_message_text( $chat_id, $message_id, self::order_summary( $order ) . "\n\n❌ " . __( 'رد شد', 'balewoo' ), BaleWoo_Notifier::admin_keyboard( $order ) );
					break;

				case 'undo':
					if ( BaleWoo_Orders::undo( $order_id ) ) {
						$client->answer_callback_query( $id, '↩️ ' . __( 'عملیات برگشت داده شد.', 'balewoo' ) );
						$order = wc_get_order( $order_id );
						$client->edit_message_text( $chat_id, $message_id, self::order_summary( $order ) . "\n\n↩️ " . __( 'به حالت قبل بازگشت', 'balewoo' ), BaleWoo_Notifier::admin_keyboard( $order ) );
					} else {
						$client->answer_callback_query( $id, __( 'مهلت بازگشت تمام شده است.', 'balewoo' ), true );
					}
					break;

				case 'receipt':
					$receipt = $order->get_meta( '_balewoo_receipt', true );
					if ( $receipt ) {
						$client->send_photo( $chat_id, $receipt, sprintf( __( 'رسید سفارش #%d', 'balewoo' ), $order_id ) );
						$client->answer_callback_query( $id, __( 'رسید ارسال شد.', 'balewoo' ) );
					} else {
						$client->answer_callback_query( $id, __( 'رسیدی ثبت نشده است.', 'balewoo' ), true );
					}
					break;

				default:
					$client->answer_callback_query( $id );
					break;
			}
		}

		/* ------------------------------------------------------------------ */
		/* Helpers                                                             */
		/* ------------------------------------------------------------------ */

		/**
		 * Build a signed invoice payload for an order.
		 *
		 * @param WC_Order $order Order.
		 * @return string
		 */
		public static function build_payload( $order ) {
			$hash = self::payload_hash( $order->get_id(), BaleWoo_Orders::amount_for_bale( $order ) );
			return 'balewoo:' . $order->get_id() . ':' . $hash;
		}

		/**
		 * Hash used inside the invoice payload.
		 *
		 * @param int   $order_id Order id.
		 * @param int   $amount   Amount.
		 * @param mixed $unused   Unused.
		 * @return string
		 */
		public static function payload_hash( $order_id, $amount = 0 ) {
			return substr( hash_hmac( 'sha256', $order_id . '|' . $amount . '|' . wp_salt( 'auth' ), wp_salt( 'auth' ) ), 0, 16 );
		}

		/**
		 * Validate a payload and return the order id.
		 *
		 * @param string $payload Payload string.
		 * @return int 0 on failure.
		 */
		public static function verify_payload( $payload ) {
			if ( ! preg_match( '/^balewoo:(\d+):([a-f0-9]{16})$/', (string) $payload, $matches ) ) {
				return 0;
			}
			$order_id = (int) $matches[1];
			$order    = wc_get_order( $order_id );
			if ( ! $order ) {
				return 0;
			}
			$expected = self::payload_hash( $order_id, BaleWoo_Orders::amount_for_bale( $order ) );
			return hash_equals( $expected, $matches[2] ) ? $order_id : 0;
		}

		/**
		 * Find the newest unpaid order belonging to a chat/user.
		 *
		 * @param string $platform bale|telegram.
		 * @param string $user_id  Messenger user id.
		 * @param string $chat_id  Chat id.
		 * @return WC_Order|null
		 */
		public static function find_pending_order_for_chat( $platform, $user_id, $chat_id ) {
			global $wpdb;

			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT order_id FROM {$wpdb->prefix}balewoo_transactions WHERE chat_id = %s AND status = %s ORDER BY id DESC LIMIT 5",
					(string) $chat_id,
					'pending'
				)
			); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

			if ( ! $rows ) {
				return null;
			}

			foreach ( $rows as $row ) {
				$order = wc_get_order( $row->order_id );
				if ( $order && ! $order->is_paid() && in_array( $order->get_status(), array( 'pending', 'on-hold', 'failed' ), true ) ) {
					return $order;
				}
			}

			return null;
		}

		/**
		 * Find a WP user by messenger id.
		 *
		 * @param string $platform bale|telegram.
		 * @param string $user_id Messenger user id.
		 * @return int
		 */
		public static function user_id_by_chat( $platform, $user_id ) {
			$users = get_users(
				array(
					'meta_key'   => '_balewoo_' . $platform . '_chat_id', // phpcs:ignore WordPress.DB.SlowDBQuery
					'meta_value' => $user_id, // phpcs:ignore WordPress.DB.SlowDBQuery
					'number'     => 1,
					'fields'     => array( 'ID' ),
				)
			);
			return $users ? (int) $users[0]->ID : 0;
		}

		/**
		 * Short order summary used in bot messages.
		 *
		 * @param WC_Order $order Order.
		 * @return string
		 */
		public static function order_summary( $order ) {
			$items = array();
			foreach ( $order->get_items() as $item ) {
				$items[] = '• ' . $item->get_name() . ' × ' . (int) $item->get_quantity();
			}

			$text  = "🆕 " . sprintf( __( 'سفارش #%d', 'balewoo' ), $order->get_id() ) . "\n";
			$text .= "👤 " . trim( $order->get_formatted_billing_full_name() ) . "\n";
			$text .= "📞 " . $order->get_billing_phone() . "\n";
			$text .= "💰 " . BaleWoo_Templates::money( $order->get_total() ) . "\n";
			$text .= "🛍 " . implode( ' | ', array_slice( $items, 0, 6 ) ) . "\n";
			$text .= "📅 " . BaleWoo_Templates::jdate( time(), 'Y/m/d H:i' ) . "\n";
			$text .= "🔸 " . wc_get_order_status_name( $order->get_status() );

			return $text;
		}
	}
}
