<?php
/**
 * Order helpers: statuses, receipts, approvals and admin UI bits.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Orders' ) ) {

	/**
	 * Bridges WooCommerce orders with BaleWoo payments.
	 */
	class BaleWoo_Orders {

		/**
		 * Register hooks.
		 *
		 * @return void
		 */
		public static function init() {
			add_action( 'woocommerce_new_order', array( __CLASS__, 'on_new_order' ), 10, 2 );
			add_action( 'woocommerce_order_status_changed', array( __CLASS__, 'sync_status' ), 10, 4 );

			add_action( 'woocommerce_thankyou', array( __CLASS__, 'thankyou_block' ), 5 );
			add_action( 'woocommerce_view_order', array( __CLASS__, 'view_order_block' ), 5 );

			add_action( 'add_meta_boxes', array( __CLASS__, 'add_meta_box' ) );
			add_action( 'woocommerce_admin_order_data_after_billing_address', array( __CLASS__, 'admin_order_details' ) );

			add_action( 'wp_ajax_balewoo_upload_receipt', array( __CLASS__, 'ajax_upload_receipt' ) );
			add_action( 'wp_ajax_nopriv_balewoo_upload_receipt', array( __CLASS__, 'ajax_upload_receipt' ) );
			add_action( 'wp_ajax_balewoo_check_order', array( __CLASS__, 'ajax_check_order' ) );
			add_action( 'wp_ajax_nopriv_balewoo_check_order', array( __CLASS__, 'ajax_check_order' ) );

			add_filter( 'woocommerce_valid_order_statuses_for_payment', array( __CLASS__, 'allow_pay_later' ), 10, 2 );
			add_filter( 'woocommerce_my_account_my_orders_actions', array( __CLASS__, 'my_orders_actions' ), 10, 2 );
		}

		/* ------------------------------------------------------------------ */
		/* Amount helpers                                                      */
		/* ------------------------------------------------------------------ */

		/**
		 * Convert an order total to the unit sent to Bale (ریال/تومان).
		 *
		 * @param WC_Order $order Order.
		 * @return int
		 */
		public static function amount_for_bale( $order ) {
			$total = (float) $order->get_total();
			$unit  = BaleWoo_Settings::get( 'amount_unit', 'toman' );

			// ووکامرس معمولاً مبالغ را بر اساس واحد فروشگاه (IRR/IRT/…) ذخیره می‌کند.
			$currency = $order->get_currency();
			$amount   = $total;

			if ( 'toman' === $unit ) {
				if ( in_array( $currency, array( 'IRR', 'RIAL' ), true ) ) {
					$amount = $total / 10;
				}
			} else {
				if ( in_array( $currency, array( 'IRT', 'TOMAN' ), true ) ) {
					$amount = $total * 10;
				}
			}

			$amount = (int) round( $amount );

			return max( 0, (int) apply_filters( 'balewoo_payment_amount', $amount, $order ) );
		}

		/**
		 * Human readable amount sent to Bale.
		 *
		 * @param WC_Order $order Order.
		 * @return string
		 */
		public static function amount_label( $order ) {
			$unit = BaleWoo_Settings::get( 'amount_unit', 'toman' );
			return number_format( self::amount_for_bale( $order ) ) . ( 'toman' === $unit ? ' تومان' : ' ریال' );
		}

		/* ------------------------------------------------------------------ */
		/* Lifecycle                                                           */
		/* ------------------------------------------------------------------ */

		/**
		 * Create a transaction row when an order is placed.
		 *
		 * @param int      $order_id Order id.
		 * @param WC_Order $order    Order object.
		 * @return void
		 */
		public static function on_new_order( $order_id, $order = null ) {
			$order = $order ? $order : wc_get_order( $order_id );
			if ( ! $order ) {
				return;
			}
			if ( ! in_array( $order->get_payment_method(), array( 'balewoo_bale', 'balewoo_card' ), true ) ) {
				return;
			}

			$platform = 'balewoo_bale' === $order->get_payment_method() ? 'bale' : 'card';
			$order->update_meta_data( '_balewoo_method', $order->get_payment_method() );

			// اگر کاربر قبلاً ربات را استارت زده بود، chat_id را از پروفایل بخوان.
			$chat_id = self::get_user_chat_id( $order->get_user_id(), 'bale' );
			if ( $chat_id ) {
				$order->update_meta_data( '_balewoo_chat_id', $chat_id );
				$order->update_meta_data( '_balewoo_platform', 'bale' );
				$platform = 'bale';
			}

			$order->save();

			BaleWoo_Transactions::upsert(
				$order_id,
				array(
					'status'   => 'pending',
					'platform' => $platform,
					'method'   => $order->get_payment_method(),
					'amount'   => (int) round( (float) $order->get_total() ),
					'currency' => $order->get_currency(),
				)
			);

			$order->add_order_note( __( 'سفارش با درگاه بله‌وو ثبت شد و در انتظار پرداخت است.', 'balewoo' ) );

			BaleWoo_Notifier::new_order( $order_id );
		}

		/**
		 * Keep transaction status in sync with the order status.
		 *
		 * @param int      $order_id   Order id.
		 * @param string   $old_status Old status.
		 * @param string   $new_status New status.
		 * @param WC_Order $order      Order.
		 * @return void
		 */
		public static function sync_status( $order_id, $old_status, $new_status, $order ) {
			if ( ! $order ) {
				return;
			}
			if ( ! in_array( $order->get_payment_method(), array( 'balewoo_bale', 'balewoo_card' ), true ) ) {
				return;
			}

			$map = array(
				'pending'    => 'pending',
				'on-hold'    => 'pending',
				'processing' => 'approved',
				'completed'  => 'approved',
				'cancelled'  => 'rejected',
				'failed'     => 'rejected',
				'refunded'   => 'refunded',
			);

			$status = isset( $map[ $new_status ] ) ? $map[ $new_status ] : 'pending';
			BaleWoo_Transactions::set_status( $order_id, $status );
		}

		/**
		 * Allow paying later for pending card-to-card orders.
		 *
		 * @param array    $statuses Valid statuses.
		 * @param WC_Order $order    Order.
		 * @return array
		 */
		public static function allow_pay_later( $statuses, $order = null ) {
			if ( $order && in_array( $order->get_payment_method(), array( 'balewoo_bale', 'balewoo_card' ), true ) ) {
				$statuses = array_merge( $statuses, array( 'pending', 'on-hold' ) );
			}
			return $statuses;
		}

		/**
		 * Add a "پرداخت" action for pending orders in My Account.
		 *
		 * @param array    $actions Actions.
		 * @param WC_Order $order   Order.
		 * @return array
		 */
		public static function my_orders_actions( $actions, $order ) {
			if ( ! $order->needs_payment() || ! in_array( $order->get_payment_method(), array( 'balewoo_bale', 'balewoo_card' ), true ) ) {
				return $actions;
			}
			$actions['balewoo_pay'] = array(
				'url'  => $order->get_checkout_payment_url(),
				'name' => __( 'پرداخت', 'balewoo' ),
			);
			return $actions;
		}

		/* ------------------------------------------------------------------ */
		/* Approval / rejection                                                */
		/* ------------------------------------------------------------------ */

		/**
		 * Approve (mark as paid) an order.
		 *
		 * @param int    $order_id Order id.
		 * @param string $actor    Who approved (admin|bot|system).
		 * @param string $tracking Tracking code.
		 * @return bool
		 */
		public static function approve( $order_id, $actor = 'admin', $tracking = '' ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return false;
			}

			$previous_status = $order->get_status();
			self::remember_undo( $order_id, $previous_status );

			if ( ! $tracking ) {
				$tracking = self::generate_tracking( $order_id );
			}

			$target = BaleWoo_Settings::get( 'status_after_approval', 'processing' );
			if ( ! in_array( $target, array( 'processing', 'completed' ), true ) ) {
				$target = 'processing';
			}

			$order->update_meta_data( '_balewoo_tracking', $tracking );
			$order->update_meta_data( '_balewoo_paid_at', current_time( 'mysql', 1 ) );
			$order->update_meta_data( '_balewoo_approved_by', $actor );
			$order->save();

			$order->payment_complete( $tracking );
			$order->set_status( $target );
			/* translators: %s: tracking code */
			$order->add_order_note( sprintf( __( 'پرداخت از طریق بله‌وو تأیید شد. کد پیگیری: %s', 'balewoo' ), $tracking ) );
			$order->save();

			BaleWoo_Transactions::set_status(
				$order_id,
				'approved',
				array(
					'tracking_code' => $tracking,
					'note'          => sprintf( 'approved by %s', $actor ),
				)
			);

			BaleWoo_Logger::success( sprintf( 'Order #%d approved by %s — status: %s → %s', $order_id, $actor, $previous_status, $target ) );

			BaleWoo_Notifier::approved( $order );

			return true;
		}

		/**
		 * Reject an order payment.
		 *
		 * @param int    $order_id Order id.
		 * @param string $reason   Reason.
		 * @param string $actor    Who rejected.
		 * @return bool
		 */
		public static function reject( $order_id, $reason = '', $actor = 'admin' ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return false;
			}

			$previous_status = $order->get_status();
			self::remember_undo( $order_id, $previous_status );

			$order->update_status( 'failed', $reason ? $reason : __( 'پرداخت توسط مدیر رد شد.', 'balewoo' ) );
			$order->update_meta_data( '_balewoo_reject_reason', $reason );
			$order->save();

			BaleWoo_Transactions::set_status( $order_id, 'rejected', array( 'note' => $reason ) );

			BaleWoo_Logger::warning( sprintf( 'Order #%d rejected by %s (%s)', $order_id, $actor, $reason ) );

			BaleWoo_Notifier::rejected( $order, $reason );

			return true;
		}

		/**
		 * Undo the last approve/reject action (30 seconds window).
		 *
		 * @param int $order_id Order id.
		 * @return bool
		 */
		public static function undo( $order_id ) {
			$state = get_transient( 'balewoo_undo_' . $order_id );
			$order = wc_get_order( $order_id );

			if ( ! $order ) {
				return false;
			}

			if ( empty( $state['status'] ) ) {
				$order->add_order_note( __( 'زمان بازگشت (Undo) به پایان رسیده است.', 'balewoo' ) );
				return false;
			}

			$order->set_status( $state['status'] );
			$order->add_order_note( sprintf( __( 'عملیات قبلی بله‌وو برگشت داده شد. وضعیت به «%s» بازگشت.', 'balewoo' ), wc_get_order_status_name( $state['status'] ) ) );
			$order->save();

			delete_transient( 'balewoo_undo_' . $order_id );

			BaleWoo_Transactions::set_status( $order_id, in_array( $state['status'], array( 'processing', 'completed' ), true ) ? 'approved' : 'pending' );
			BaleWoo_Logger::warning( sprintf( 'Undo performed on order #%d → %s', $order_id, $state['status'] ) );

			return true;
		}

		/**
		 * Store the order status for the undo window.
		 *
		 * @param int    $order_id Order id.
		 * @param string $status   Status before the change.
		 * @return void
		 */
		public static function remember_undo( $order_id, $status ) {
			set_transient(
				'balewoo_undo_' . $order_id,
				array(
					'status' => $status,
					'time'   => time(),
				),
				(int) apply_filters( 'balewoo_undo_window', 30 )
			);
		}

		/**
		 * Generate a tracking code.
		 *
		 * @param int $order_id Order id.
		 * @return string
		 */
		public static function generate_tracking( $order_id ) {
			return 'BW-' . $order_id . '-' . strtoupper( wp_generate_password( 6, false, false ) );
		}

		/**
		 * Mark an order as paid after a Bale successful payment.
		 *
		 * @param int    $order_id  Order id.
		 * @param string $charge_id Provider charge id.
		 * @return bool
		 */
		public static function mark_paid_by_bale( $order_id, $charge_id = '' ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return false;
			}
			$order->update_meta_data( '_balewoo_charge_id', $charge_id );
			$order->save();
			return self::approve( $order_id, 'bale', $charge_id ? $charge_id : '' );
		}

		/* ------------------------------------------------------------------ */
		/* Receipts                                                            */
		/* ------------------------------------------------------------------ */

		/**
		 * Save a receipt for an order.
		 *
		 * @param int    $order_id Order id.
		 * @param string $url      Receipt URL.
		 * @param string $platform bale|telegram|web.
		 * @return bool
		 */
		public static function save_receipt( $order_id, $url, $platform = 'web' ) {
			$order = wc_get_order( $order_id );
			if ( ! $order || ! $url ) {
				return false;
			}

			$order->update_meta_data( '_balewoo_receipt', esc_url_raw( $url ) );
			$order->update_meta_data( '_balewoo_receipt_at', current_time( 'mysql', 1 ) );

			if ( 'pending' === $order->get_status() ) {
				$order->update_status( 'on-hold', __( 'رسید پرداخت توسط مشتری ارسال شد و در انتظار تأیید مدیر است.', 'balewoo' ) );
			} else {
				$order->add_order_note( __( 'رسید پرداخت توسط مشتری ارسال شد.', 'balewoo' ) );
			}

			$order->save();

			BaleWoo_Transactions::set_status(
				$order_id,
				'pending',
				array(
					'receipt_url' => esc_url_raw( $url ),
					'platform'    => $platform,
				)
			);

			BaleWoo_Logger::success( sprintf( 'Receipt uploaded for order #%d (%s)', $order_id, $platform ) );

			BaleWoo_Notifier::receipt_received( $order, $url );

			return true;
		}

		/**
		 * Handle receipt upload from the site (AJAX).
		 *
		 * @return void
		 */
		public static function ajax_upload_receipt() {
			check_ajax_referer( 'balewoo_front', 'nonce' );

			$order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
			$order    = wc_get_order( $order_id );

			if ( ! $order ) {
				wp_send_json_error( array( 'message' => __( 'سفارش یافت نشد.', 'balewoo' ) ) );
			}

			if ( ! self::customer_can_view( $order ) ) {
				wp_send_json_error( array( 'message' => __( 'دسترسی غیرمجاز.', 'balewoo' ) ) );
			}

			if ( empty( $_FILES['receipt'] ) ) {
				wp_send_json_error( array( 'message' => __( 'فایلی انتخاب نشده است.', 'balewoo' ) ) );
			}

			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';

			$uploaded = wp_handle_upload(
				$_FILES['receipt'], // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
				array(
					'test_form' => false,
					'mimes'     => array(
						'jpg|jpeg|jpe' => 'image/jpeg',
						'png'          => 'image/png',
						'gif'          => 'image/gif',
						'webp'         => 'image/webp',
						'pdf'          => 'application/pdf',
					),
				)
			);

			if ( isset( $uploaded['error'] ) ) {
				wp_send_json_error( array( 'message' => $uploaded['error'] ) );
			}

			self::save_receipt( $order_id, $uploaded['url'], 'web' );

			wp_send_json_success( array( 'message' => __( 'رسید شما ارسال شد و پس از تأیید مدیر، سفارش پردازش می‌شود.', 'balewoo' ) ) );
		}

		/**
		 * AJAX: poll payment status (used by the Bale pay page).
		 *
		 * @return void
		 */
		public static function ajax_check_order() {
			$order_id = isset( $_REQUEST['order_id'] ) ? absint( $_REQUEST['order_id'] ) : 0;
			$key      = isset( $_REQUEST['key'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['key'] ) ) : '';
			$order    = wc_get_order( $order_id );

			if ( ! $order || ! hash_equals( $order->get_order_key(), $key ) ) {
				wp_send_json_error( array( 'message' => __( 'سفارش یافت نشد.', 'balewoo' ) ) );
			}

			$paid = ! $order->needs_payment() && in_array( $order->get_status(), array( 'processing', 'completed' ), true );

			wp_send_json_success(
				array(
					'paid'    => $paid,
					'status'  => $order->get_status(),
					'failed'  => in_array( $order->get_status(), array( 'failed', 'cancelled' ), true ),
					'redirect' => $paid ? $order->get_checkout_order_received_url() : '',
				)
			);
		}

		/**
		 * Whether current visitor may act on this order.
		 *
		 * @param WC_Order $order Order.
		 * @return bool
		 */
		public static function customer_can_view( $order ) {
			if ( current_user_can( 'edit_shop_orders' ) ) {
				return true;
			}
			$key = isset( $_REQUEST['key'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['key'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
			if ( $key && hash_equals( $order->get_order_key(), $key ) ) {
				return true;
			}
			return (int) $order->get_user_id() > 0 && (int) $order->get_user_id() === get_current_user_id();
		}

		/* ------------------------------------------------------------------ */
		/* Chat id helpers                                                     */
		/* ------------------------------------------------------------------ */

		/**
		 * Get the stored chat id of a user.
		 *
		 * @param int    $user_id  WP user id.
		 * @param string $platform bale|telegram.
		 * @return string
		 */
		public static function get_user_chat_id( $user_id, $platform = 'bale' ) {
			if ( ! $user_id ) {
				return '';
			}
			return (string) get_user_meta( $user_id, '_balewoo_' . $platform . '_chat_id', true );
		}

		/**
		 * Store chat id on a user.
		 *
		 * @param int    $user_id  WP user id.
		 * @param string $chat_id  Chat id.
		 * @param string $platform bale|telegram.
		 * @return void
		 */
		public static function set_user_chat_id( $user_id, $chat_id, $platform = 'bale' ) {
			if ( ! $user_id || ! $chat_id ) {
				return;
			}
			update_user_meta( $user_id, '_balewoo_' . $platform . '_chat_id', $chat_id );
		}

		/**
		 * Find an order by its id (used by the bot webhook).
		 *
		 * @param int $order_id Order id.
		 * @return WC_Order|null
		 */
		public static function find( $order_id ) {
			return wc_get_order( absint( $order_id ) );
		}

		/* ------------------------------------------------------------------ */
		/* Front-end blocks                                                    */
		/* ------------------------------------------------------------------ */

		/**
		 * Show payment instructions / receipt upload on the thank-you page.
		 *
		 * @param int $order_id Order id.
		 * @return void
		 */
		public static function thankyou_block( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order || 'balewoo_card' !== $order->get_payment_method() ) {
				return;
			}
			if ( $order->is_paid() ) {
				return;
			}
			self::render_card_block( $order );
		}

		/**
		 * Show the same block in My Account → order view.
		 *
		 * @param int $order_id Order id.
		 * @return void
		 */
		public static function view_order_block( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order || 'balewoo_card' !== $order->get_payment_method() ) {
				return;
			}
			if ( $order->is_paid() ) {
				return;
			}
			self::render_card_block( $order );
		}

		/**
		 * Render the card-to-card block.
		 *
		 * @param WC_Order $order Order.
		 * @return void
		 */
		public static function render_card_block( $order ) {
			$cards  = BaleWoo_Settings::cards();
			$receipt = $order->get_meta( '_balewoo_receipt', true );

			wp_enqueue_style( 'balewoo-front' );
			wp_enqueue_script( 'balewoo-front' );

			include BALEWOO_DIR . 'public/views/card-block.php';
		}

		/* ------------------------------------------------------------------ */
		/* Admin order UI                                                      */
		/* ------------------------------------------------------------------ */

		/**
		 * Register the meta box.
		 *
		 * @return void
		 */
		public static function add_meta_box() {
			$screen = class_exists( 'Automattic\WooCommerce\Internal\DataStores\Orders\CustomOrdersTableController' ) && wc_get_container()
				? wc_get_container()->get( 'Automattic\WooCommerce\Internal\DataStores\Orders\CustomOrdersTableController' )->custom_orders_table_usage_is_enabled()
				: false;

			if ( $screen ) {
				add_meta_box( 'balewoo-order', __( 'بله‌وو', 'balewoo' ), array( __CLASS__, 'render_meta_box' ), 'woocommerce_page_wc-orders', 'side', 'high' );
			}

			add_meta_box( 'balewoo-order', __( 'بله‌وو', 'balewoo' ), array( __CLASS__, 'render_meta_box' ), 'shop_order', 'side', 'high' );
		}

		/**
		 * Render the meta box (approve / reject / receipt).
		 *
		 * @param WP_Post|WC_Order $post_or_order Post or order object.
		 * @return void
		 */
		public static function render_meta_box( $post_or_order ) {
			$order_id = 0;
			if ( $post_or_order instanceof WP_Post ) {
				$order_id = $post_or_order->ID;
			} elseif ( is_object( $post_or_order ) && method_exists( $post_or_order, 'get_id' ) ) {
				$order_id = $post_or_order->get_id();
			}

			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return;
			}

			$receipt = $order->get_meta( '_balewoo_receipt', true );
			$tracking = $order->get_meta( '_balewoo_tracking', true );
			$chat_id  = $order->get_meta( '_balewoo_chat_id', true );
			$charge   = $order->get_meta( '_balewoo_charge_id', true );

			echo '<div class="balewoo-metabox">';
			echo '<p><strong>' . esc_html__( 'روش پرداخت:', 'balewoo' ) . '</strong> ' . esc_html( 'balewoo_bale' === $order->get_payment_method() ? __( 'کیف پول بله', 'balewoo' ) : __( 'کارت به کارت', 'balewoo' ) ) . '</p>';

			if ( $tracking ) {
				echo '<p><strong>' . esc_html__( 'کد پیگیری:', 'balewoo' ) . '</strong> <code>' . esc_html( $tracking ) . '</code></p>';
			}
			if ( $chat_id ) {
				echo '<p><strong>' . esc_html__( 'چت‌آیدی:', 'balewoo' ) . '</strong> <code>' . esc_html( $chat_id ) . '</code></p>';
			}
			if ( $charge ) {
				echo '<p><strong>Charge ID:</strong> <code>' . esc_html( $charge ) . '</code></p>';
			}
			if ( $receipt ) {
				echo '<p><a class="button" target="_blank" href="' . esc_url( $receipt ) . '">' . esc_html__( 'مشاهده رسید', 'balewoo' ) . '</a></p>';
			}

			if ( ! $order->is_paid() ) {
				echo '<p>
					<button type="button" class="button button-primary balewoo-order-action" data-action="approve" data-order="' . esc_attr( $order_id ) . '">' . esc_html__( 'تأیید پرداخت', 'balewoo' ) . '</button>
					<button type="button" class="button balewoo-order-action" data-action="reject" data-order="' . esc_attr( $order_id ) . '">' . esc_html__( 'رد پرداخت', 'balewoo' ) . '</button>
				</p>';
			} else {
				echo '<p><span class="balewoo-badge balewoo-badge-approved">' . esc_html__( 'پرداخت تأیید شده', 'balewoo' ) . '</span></p>';
			}

			echo '<p class="description">' . esc_html__( 'تغییرات از طریق ربات بله نیز همگام‌سازی می‌شود.', 'balewoo' ) . '</p>';
			echo '</div>';
		}

		/**
		 * Show Bale info in the admin order details panel.
		 *
		 * @param WC_Order $order Order.
		 * @return void
		 */
		public static function admin_order_details( $order ) {
			$chat_id  = $order->get_meta( '_balewoo_chat_id', true );
			$platform = $order->get_meta( '_balewoo_platform', true );
			$phone    = $order->get_billing_phone();
			$link     = $chat_id ? 'https://bale.ai/' . $chat_id : '';

			if ( ! $chat_id && ! $phone ) {
				return;
			}

			echo '<p class="balewoo-order-meta"><strong>' . esc_html__( 'بله‌وو:', 'balewoo' ) . '</strong> ';
			if ( $chat_id ) {
				printf(
					'%s <code>%s</code>%s',
					esc_html( 'telegram' === $platform ? __( 'تلگرام', 'balewoo' ) : __( 'بله', 'balewoo' ) ),
					esc_html( $chat_id ),
					$link ? ' <a href="' . esc_url( 'https://bale.ai/' . rawurlencode( $chat_id ) ) . '" target="_blank">' . esc_html__( 'گفتگو', 'balewoo' ) . '</a>' : ''
				);
			} else {
				esc_html_e( 'کاربر به ربات متصل نیست.', 'balewoo' );
			}
			echo '</p>';
		}
	}
}
