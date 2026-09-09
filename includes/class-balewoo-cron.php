<?php
/**
 * Scheduled tasks: deadlines, reports, webhook health.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Cron' ) ) {

	/**
	 * Cron callbacks.
	 */
	class BaleWoo_Cron {

		/**
		 * Register hooks.
		 *
		 * @return void
		 */
		public static function init() {
			add_action( 'balewoo_cron_five_minutes', array( __CLASS__, 'expire_orders' ) );
			add_action( 'balewoo_cron_hourly', array( __CLASS__, 'hourly' ) );
			add_action( 'balewoo_cron_reports', array( __CLASS__, 'maybe_send_report' ) );
		}

		/**
		 * Cancel card-to-card orders whose payment deadline has passed.
		 *
		 * @return void
		 */
		public static function expire_orders() {
			$deadline_hours = max( 1, (int) BaleWoo_Settings::get( 'payment_deadline_hours', 24 ) );

			$orders = wc_get_orders(
				array(
					'limit'      => 50,
					'status'     => array( 'pending', 'on-hold' ),
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery
						'relation' => 'AND',
						array(
							'key'     => '_payment_method',
							'value'   => 'balewoo_card',
							'compare' => '=',
						),
						array(
							'key'     => '_balewoo_deadline',
							'value'   => current_time( 'mysql', 1 ),
							'compare' => '<',
							'type'    => 'DATETIME',
						),
					),
				)
			);

			foreach ( $orders as $order ) {
				$deadline = $order->get_meta( '_balewoo_deadline', true );
				if ( ! $deadline ) {
					continue;
				}

				$order->update_status( 'cancelled', __( 'مهلت پرداخت به پایان رسید (بله‌وو).', 'balewoo' ) );
				BaleWoo_Transactions::set_status( $order->get_id(), 'expired' );
				BaleWoo_Logger::warning( sprintf( 'Order #%d expired — payment deadline reached', $order->get_id() ) );

				BaleWoo_Notifier::to_customer( $order, sprintf( __( 'مهلت پرداخت سفارش #%d به پایان رسید و سفارش لغو شد.', 'balewoo' ), $order->get_id() ) );
			}
		}

		/**
		 * Hourly maintenance.
		 *
		 * @return void
		 */
		public static function hourly() {
			// ثبت مجدد وب‌هوک در صورت نیاز (هر ۱۲ ساعت یک‌بار).
			$last = (int) get_option( 'balewoo_webhook_check', 0 );
			if ( time() - $last > 12 * HOUR_IN_SECONDS ) {
				self::ensure_webhooks();
				update_option( 'balewoo_webhook_check', time() );
			}

			// پاک‌سازی ترنزینت‌های قدیمیِ Undo.
			delete_expired_transients( true );
		}

		/**
		 * Make sure webhooks are registered on Bale / Telegram.
		 *
		 * @return array Result per platform.
		 */
		public static function ensure_webhooks() {
			$results = array();

			$platforms = array(
				'bale'     => new BaleWoo_API_Bale(),
				'telegram' => new BaleWoo_API_Telegram(),
			);

			foreach ( $platforms as $platform => $client ) {
				if ( ! $client->is_configured() ) {
					$results[ $platform ] = array( 'ok' => false, 'error' => __( 'توکن تنظیم نشده است.', 'balewoo' ) );
					continue;
				}

				$result = $client->set_webhook( BaleWoo_Settings::webhook_url( $platform ) );

				if ( is_wp_error( $result ) ) {
					$results[ $platform ] = array( 'ok' => false, 'error' => $result->get_error_message() );
					BaleWoo_Logger::error( sprintf( 'Webhook registration failed (%s): %s', $platform, $result->get_error_message() ) );
				} else {
					$results[ $platform ] = array( 'ok' => true, 'url' => BaleWoo_Settings::webhook_url( $platform ) );
					BaleWoo_Logger::success( sprintf( 'Webhook registered (%s)', $platform ) );
				}
			}

			return $results;
		}

		/**
		 * Send the automatic report when the configured time is reached.
		 *
		 * @return void
		 */
		public static function maybe_send_report() {
			$type = BaleWoo_Settings::get( 'report_type', 'none' );
			if ( 'none' === $type ) {
				return;
			}

			$time  = BaleWoo_Settings::get( 'report_time', '09:00' );
			$now   = current_time( 'H:i' );
			$parts = explode( ':', $time );
			$hour  = isset( $parts[0] ) ? (int) $parts[0] : 9;
			$minute = isset( $parts[1] ) ? (int) $parts[1] : 0;
			$now_parts = explode( ':', $now );

			$hour_match   = (int) $now_parts[0] === $hour;
			$within_hour  = abs( ( (int) $now_parts[0] * 60 + (int) $now_parts[1] ) - ( $hour * 60 + $minute ) ) < 60;

			if ( ! $within_hour ) {
				return;
			}

			if ( 'weekly' === $type ) {
				$today = strtolower( current_time( 'l' ) );
				if ( strtolower( BaleWoo_Settings::get( 'report_day', 'saturday' ) ) !== $today ) {
					return;
				}
			}

			$marker = 'balewoo_report_sent_' . current_time( 'Y-m-d' ) . '_' . $hour;
			if ( get_transient( $marker ) ) {
				return;
			}

			if ( BaleWoo_Notifier::send_report( 'weekly' === $type ? 7 : 1 ) ) {
				set_transient( $marker, 1, 2 * HOUR_IN_SECONDS );
			}
		}
	}
}
