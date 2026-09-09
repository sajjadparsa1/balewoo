<?php
/**
 * Notifications (customer + admin) over Bale, Telegram, Safir and SMS.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Notifier' ) ) {

	/**
	 * Sends templated notifications through the available channels.
	 */
	class BaleWoo_Notifier {

		/**
		 * A new order was placed.
		 *
		 * @param int $order_id Order id.
		 * @return void
		 */
		public static function new_order( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return;
			}

			// پیام به مشتری.
			$text = BaleWoo_Templates::render( 'tpl_customer_new', $order );
			self::to_customer( $order, $text );

			// پیام به مدیر.
			$admin_text = BaleWoo_Templates::render( 'tpl_admin_new', $order );
			self::to_admin( $order, $admin_text, self::admin_keyboard( $order ) );

			BaleWoo_Logger::success( sprintf( 'Order #%d placed — total: %s', $order_id, BaleWoo_Templates::money( $order->get_total() ) ) );
		}

		/**
		 * Admin notified about an uploaded receipt (with photo when possible).
		 *
		 * @param WC_Order $order Order.
		 * @param string   $url   Receipt URL.
		 * @return void
		 */
		public static function receipt_received( $order, $url ) {
			$text = sprintf(
				"🧾 %s #%d\n\n👤 %s\n💰 %s\n📎 رسید پرداخت ارسال شد. لطفاً بررسی و تأیید کنید.",
				__( 'رسید جدید برای سفارش', 'balewoo' ),
				$order->get_id(),
				trim( $order->get_formatted_billing_full_name() ),
				BaleWoo_Templates::money( $order->get_total() )
			);

			$keyboard = self::admin_keyboard( $order );

			if ( BaleWoo_Settings::is_on( 'notify_admin_bale' ) ) {
				$bale     = new BaleWoo_API_Bale();
				$chat_id  = BaleWoo_Settings::get( 'bale_admin_chat_id' );
				if ( $bale->is_configured() && $chat_id ) {
					$bale->send_photo( $chat_id, $url, wp_strip_all_tags( $text ), $keyboard );
				}
			} else {
				self::to_admin( $order, $text, $keyboard );
			}

			if ( BaleWoo_Settings::is_on( 'notify_admin_telegram' ) ) {
				$tg      = new BaleWoo_API_Telegram();
				$chat_id = BaleWoo_Settings::get( 'telegram_admin_chat_id' );
				if ( $tg->is_configured() && $chat_id ) {
					$tg->send_photo( $chat_id, $url, wp_strip_all_tags( $text ), $keyboard );
				}
			}
		}

		/**
		 * Payment approved.
		 *
		 * @param WC_Order $order Order.
		 * @return void
		 */
		public static function approved( $order ) {
			$order_id = $order->get_id();
			$text     = BaleWoo_Templates::render( 'tpl_customer_paid', $order, array( 'tracking' => $order->get_meta( '_balewoo_tracking', true ) ) );

			self::to_customer( $order, $text );
			self::to_admin( $order, sprintf( "✅ سفارش #%d تأیید شد — %s", $order_id, BaleWoo_Templates::money( $order->get_total() ) ) );
		}

		/**
		 * Payment rejected.
		 *
		 * @param WC_Order $order Order.
		 * @param string   $reason Reason.
		 * @return void
		 */
		public static function rejected( $order, $reason = '' ) {
			$text = BaleWoo_Templates::render( 'tpl_customer_reject', $order, array( 'tracking' => $reason ) );
			self::to_customer( $order, $text );
			self::to_admin( $order, sprintf( "❌ سفارش #%d رد شد. %s", $order->get_id(), $reason ) );
		}

		/* ------------------------------------------------------------------ */
		/* Sending                                                             */
		/* ------------------------------------------------------------------ */

		/**
		 * Send a message to the customer using the configured channel priority.
		 *
		 * @param WC_Order $order    Order.
		 * @param string   $text     Message text.
		 * @param array    $keyboard Inline keyboard (bale/telegram only).
		 * @return string Channel used (bale|telegram|safir|sms|none).
		 */
		public static function to_customer( $order, $text, $keyboard = null ) {
			$order_id = $order->get_id();
			$phone    = $order->get_billing_phone();
			$channels = BaleWoo_Settings::get( 'channel_priority', array( 'bale_bot', 'safir', 'sms' ) );
			if ( ! is_array( $channels ) || empty( $channels ) ) {
				$channels = array( 'bale_bot', 'safir', 'sms' );
			}

			foreach ( $channels as $channel ) {
				switch ( $channel ) {
					case 'bale_bot':
						if ( BaleWoo_Settings::is_on( 'notify_customer_bale' ) ) {
							$chat_id = $order->get_meta( '_balewoo_chat_id', true );
							if ( ! $chat_id ) {
								$chat_id = BaleWoo_Orders::get_user_chat_id( $order->get_user_id(), 'bale' );
							}
							$bale = new BaleWoo_API_Bale();
							if ( $chat_id && $bale->is_configured() ) {
								$result = $bale->send_message( $chat_id, $text, $keyboard );
								if ( ! is_wp_error( $result ) ) {
									BaleWoo_Logger::success( sprintf( 'Customer notified via Bale — order #%d, chat_id=%s', $order_id, $chat_id ) );
									return 'bale';
								}
								BaleWoo_Logger::warning( 'Bale send failed: ' . $bale->last_error );
							}
						}
						break;

					case 'telegram':
						if ( BaleWoo_Settings::is_on( 'notify_customer_telegram' ) ) {
							$chat_id = BaleWoo_Orders::get_user_chat_id( $order->get_user_id(), 'telegram' );
							$tg      = new BaleWoo_API_Telegram();
							if ( $chat_id && $tg->is_configured() ) {
								$result = $tg->send_message( $chat_id, $text, $keyboard );
								if ( ! is_wp_error( $result ) ) {
									BaleWoo_Logger::success( sprintf( 'Customer notified via Telegram — order #%d', $order_id ) );
									return 'telegram';
								}
							}
						}
						break;

					case 'safir':
						if ( BaleWoo_Settings::is_on( 'safir_enabled' ) && BaleWoo_Settings::is_on( 'safir_to_customer' ) && $phone ) {
							$safir  = new BaleWoo_API_Safir();
							$result = $safir->send( $phone, $text );
							if ( ! is_wp_error( $result ) ) {
								BaleWoo_Logger::success( sprintf( 'Customer notified via Safir — order #%d', $order_id ) );
								return 'safir';
							}
							BaleWoo_Logger::warning( 'Safir failed: ' . $safir->last_error );
						}
						break;

					case 'sms':
						if ( BaleWoo_Settings::is_on( 'sms_enabled' ) && BaleWoo_Settings::is_on( 'sms_to_customer' ) && $phone ) {
							$sms    = new BaleWoo_API_SMS();
							$result = $sms->send( $phone, wp_strip_all_tags( $text ) );
							if ( ! is_wp_error( $result ) ) {
								BaleWoo_Logger::success( sprintf( 'Customer notified via SMS — order #%d', $order_id ) );
								return 'sms';
							}
							BaleWoo_Logger::warning( 'SMS failed: ' . $sms->last_error );
						}
						break;
				}
			}

			BaleWoo_Logger::warning( sprintf( 'No notification channel delivered the message for order #%d', $order_id ) );
			return 'none';
		}

		/**
		 * Send a message to the shop admin(s).
		 *
		 * @param WC_Order $order    Order (optional).
		 * @param string   $text     Message text.
		 * @param array    $keyboard Inline keyboard.
		 * @param bool     $force    Send even if admin notifications are disabled.
		 * @return bool
		 */
		public static function to_admin( $order = null, $text = '', $keyboard = null, $force = false ) {
			$sent = false;

			if ( ( $force || BaleWoo_Settings::is_on( 'notify_admin_bale' ) ) && BaleWoo_Settings::get( 'bale_admin_chat_id' ) ) {
				$bale = new BaleWoo_API_Bale();
				if ( $bale->is_configured() ) {
					$result = $bale->send_message( BaleWoo_Settings::get( 'bale_admin_chat_id' ), $text, $keyboard );
					$sent   = $sent || ! is_wp_error( $result );
					if ( is_wp_error( $result ) ) {
						BaleWoo_Logger::error( 'Admin Bale notification failed: ' . $result->get_error_message() );
					}
				}
			}

			if ( ( $force || BaleWoo_Settings::is_on( 'notify_admin_telegram' ) ) && BaleWoo_Settings::get( 'telegram_admin_chat_id' ) ) {
				$tg = new BaleWoo_API_Telegram();
				if ( $tg->is_configured() ) {
					$result = $tg->send_message( BaleWoo_Settings::get( 'telegram_admin_chat_id' ), $text, $keyboard );
					$sent   = $sent || ! is_wp_error( $result );
				}
			}

			// پشتیبان: شماره همراه مدیر از طریق سفیر/پیامک.
			$admin_phone = BaleWoo_Settings::get( 'admin_phone' );
			if ( ! $sent && $admin_phone && ! $order ) {
				if ( BaleWoo_Settings::is_on( 'safir_enabled' ) ) {
					$safir = new BaleWoo_API_Safir();
					$sent  = ! is_wp_error( $safir->send( $admin_phone, $text ) );
				}
				if ( ! $sent && BaleWoo_Settings::is_on( 'sms_enabled' ) ) {
					$sms  = new BaleWoo_API_SMS();
					$sent = ! is_wp_error( $sms->send( $admin_phone, wp_strip_all_tags( $text ) ) );
				}
			}

			return $sent;
		}

		/* ------------------------------------------------------------------ */
		/* Keyboards                                                          */
		/* ------------------------------------------------------------------ */

		/**
		 * Inline keyboard for admin actions on an order.
		 *
		 * @param WC_Order $order Order.
		 * @return array
		 */
		public static function admin_keyboard( $order ) {
			$id = $order->get_id();

			$keyboard = array(
				array(
					array( 'text' => '✅ ' . __( 'تأیید پرداخت', 'balewoo' ), 'callback_data' => 'bpv:' . $id . ':approve' ),
					array( 'text' => '❌ ' . __( 'رد پرداخت', 'balewoo' ), 'callback_data' => 'bpv:' . $id . ':reject' ),
				),
			);

			$row = array();
			if ( $order->get_meta( '_balewoo_receipt', true ) ) {
				$row[] = array( 'text' => '🧾 ' . __( 'مشاهده رسید', 'balewoo' ), 'callback_data' => 'bpv:' . $id . ':receipt' );
			}
			$row[] = array( 'text' => '📋 ' . __( 'جزئیات سفارش', 'balewoo' ), 'url' => admin_url( 'post.php?post=' . $id . '&action=edit' ) );

			$keyboard[] = $row;
			$keyboard[] = array(
				array( 'text' => '↩️ ' . __( 'بازگشت (۳۰ ثانیه)', 'balewoo' ), 'callback_data' => 'bpv:' . $id . ':undo' ),
			);

			return array( 'inline_keyboard' => $keyboard );
		}

		/**
		 * Simple single-button keyboard.
		 *
		 * @param string $text Button text.
		 * @param string $url  Button URL.
		 * @return array
		 */
		public static function link_keyboard( $text, $url ) {
			return array( 'inline_keyboard' => array( array( array( 'text' => $text, 'url' => $url ) ) ) );
		}

		/* ------------------------------------------------------------------ */
		/* Reports                                                             */
		/* ------------------------------------------------------------------ */

		/**
		 * Build the automatic sales report text.
		 *
		 * @param int $days Period length in days.
		 * @return string
		 */
		public static function report_text( $days = 1 ) {
			$stats = BaleWoo_Transactions::stats();

			$total_orders = (int) $stats['today_orders'];
			$approved     = (int) $stats['approved'];
			$pending      = (int) $stats['status_counts']['pending'];
			$rejected     = (int) $stats['status_counts']['rejected'];
			$sales        = (int) $stats['sales_today'];

			$growth = $sales > 0 && $rejected > 0 ? round( ( $approved / max( 1, $approved + $rejected ) ) * 100 ) : 0;

			$title = 7 === $days ? __( 'گزارش هفتگی فروش', 'balewoo' ) : __( 'گزارش روزانه فروش', 'balewoo' );

			$text  = "📊 " . $title . "\n";
			$text .= "📅 " . BaleWoo_Templates::jdate( time(), 'l d F Y - H:i' ) . "\n";
			$text .= "─────────────────────\n\n";
			$text .= "📦 " . __( 'سفارشات:', 'balewoo' ) . "\n";
			$text .= "├ " . sprintf( __( 'کل سفارشات: %d', 'balewoo' ), $total_orders ) . "\n";
			$text .= "├ " . sprintf( __( 'تأیید شده: %d', 'balewoo' ), $approved ) . "\n";
			$text .= "├ " . sprintf( __( 'در انتظار: %d', 'balewoo' ), $pending ) . "\n";
			$text .= "└ " . sprintf( __( 'رد شده: %d', 'balewoo' ), $rejected ) . "\n\n";
			$text .= "💰 " . sprintf( __( 'فروش کل: %s', 'balewoo' ), number_format( $sales ) . ' ' . __( 'تومان', 'balewoo' ) ) . "\n";
			$text .= "📈 " . sprintf( __( 'نرخ تأیید: %d%%', 'balewoo' ), $growth ) . "\n";

			return apply_filters( 'balewoo_report_text', $text, $stats, $days );
		}

		/**
		 * Send the scheduled report.
		 *
		 * @param int $days Period in days.
		 * @return bool
		 */
		public static function send_report( $days = 1 ) {
			$text = self::report_text( $days );
			$via  = BaleWoo_Settings::get( 'report_via', 'bale' );
			$sent = false;

			if ( 'bale' === $via || 'both' === $via ) {
				$bale    = new BaleWoo_API_Bale();
				$chat_id = BaleWoo_Settings::get( 'bale_admin_chat_id' );
				if ( $bale->is_configured() && $chat_id ) {
					$sent = ! is_wp_error( $bale->send_message( $chat_id, $text ) );
				}
			}
			if ( 'telegram' === $via || 'both' === $via ) {
				$tg      = new BaleWoo_API_Telegram();
				$chat_id = BaleWoo_Settings::get( 'telegram_admin_chat_id' );
				if ( $tg->is_configured() && $chat_id ) {
					$sent = ! is_wp_error( $tg->send_message( $chat_id, $text ) ) || $sent;
				}
			}

			if ( $sent ) {
				BaleWoo_Logger::success( sprintf( 'Scheduled report sent (%s days)', $days ) );
			}

			return $sent;
		}
	}
}
