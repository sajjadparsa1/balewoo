<?php
/**
 * The "pay with Bale" page rendered after checkout.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Paypage' ) ) {

	/**
	 * Renders a standalone payment page (wc-api=balewoo_pay) and pay-page hooks.
	 */
	class BaleWoo_Paypage {

		/**
		 * Register hooks and assets.
		 *
		 * @return void
		 */
		public static function init() {
			add_action( 'woocommerce_api_balewoo_pay', array( __CLASS__, 'render' ) );
			add_action( 'woocommerce_receipt_balewoo_bale', array( __CLASS__, 'receipt_bale' ) );
			add_action( 'woocommerce_receipt_balewoo_card', array( __CLASS__, 'receipt_card' ) );

			add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ) );
		}

		/**
		 * Register front-end assets.
		 *
		 * @return void
		 */
		public static function register_assets() {
			wp_register_style( 'balewoo-front', BALEWOO_URL . 'public/css/balewoo-front.css', array(), BALEWOO_VERSION );
			wp_register_script(
				'balewoo-front',
				BALEWOO_URL . 'public/js/balewoo-front.js',
				array( 'jquery' ),
				BALEWOO_VERSION,
				true
			);
			wp_localize_script(
				'balewoo-front',
				'balewooFront',
				array(
					'ajax'    => admin_url( 'admin-ajax.php' ),
					'nonce'   => wp_create_nonce( 'balewoo_front' ),
					'rest'    => esc_url_raw( rest_url( 'balewoo/v1/pay/' ) ),
					'i18n'    => array(
						'waiting' => __( 'در انتظار تأیید پرداخت…', 'balewoo' ),
						'paid'    => __( 'پرداخت شما تأیید شد. در حال انتقال…', 'balewoo' ),
						'failed'  => __( 'پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.', 'balewoo' ),
						'copied'  => __( 'شماره کارت کپی شد ✓', 'balewoo' ),
						'upload'  => __( 'در حال ارسال رسید…', 'balewoo' ),
					),
				)
			);
		}

		/**
		 * Render the standalone payment page.
		 *
		 * @return void
		 */
		public static function render() {
			$order_id = isset( $_GET['balewoo_pay'] ) ? absint( $_GET['balewoo_pay'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
			$key      = isset( $_GET['key'] ) ? sanitize_text_field( wp_unslash( $_GET['key'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
			$order    = wc_get_order( $order_id );

			if ( ! $order || ! hash_equals( $order->get_order_key(), $key ) ) {
				wp_die( esc_html__( 'لینک پرداخت نامعتبر است.', 'balewoo' ), esc_html__( 'بله‌وو', 'balewoo' ), array( 'response' => 403 ) );
			}

			if ( in_array( $order->get_status(), array( 'processing', 'completed' ), true ) ) {
				wp_safe_redirect( $order->get_checkout_order_received_url() );
				exit;
			}

			// درخواست‌های wc-api پیش از wp_enqueue_scripts اجرا می‌شوند،
			// بنابراین دارایی‌ها را اینجا ثبت و چاپ می‌کنیم.
			if ( ! wp_style_is( 'balewoo-front', 'registered' ) ) {
				self::register_assets();
			}
			wp_enqueue_style( 'balewoo-front' );
			wp_enqueue_script( 'balewoo-front' );

			status_header( 200 );
			nocache_headers();

			include BALEWOO_DIR . 'public/views/pay.php';
			exit;
		}

		/**
		 * Pay page for the Bale wallet gateway (order-pay endpoint).
		 *
		 * @param int $order_id Order id.
		 * @return void
		 */
		public static function receipt_bale( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return;
			}
			wp_enqueue_style( 'balewoo-front' );
			wp_enqueue_script( 'balewoo-front' );
			include BALEWOO_DIR . 'public/views/pay-inline.php';
		}

		/**
		 * Pay page for the card-to-card gateway.
		 *
		 * @param int $order_id Order id.
		 * @return void
		 */
		public static function receipt_card( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return;
			}
			BaleWoo_Orders::render_card_block( $order );
		}

		/**
		 * Build the bot deep-link that connects a chat to an order.
		 *
		 * @param WC_Order $order  Order.
		 * @param string   $platform bale|telegram.
		 * @return string
		 */
		public static function bot_link( $order, $platform = 'bale' ) {
			$param = 'order_' . $order->get_id() . '_' . $order->get_order_key();
			$token = 'bale' === $platform ? BaleWoo_Settings::get( 'bale_token' ) : BaleWoo_Settings::get( 'telegram_token' );

			if ( ! $token ) {
				return '';
			}

			$username = self::bot_username( $platform );

			if ( 'telegram' === $platform ) {
				return $username ? 'https://t.me/' . $username . '?start=' . rawurlencode( $param ) : '';
			}

			return $username ? 'https://bale.ai/' . $username . '?start=' . rawurlencode( $param ) : '';
		}

		/**
		 * Cached bot username (from getMe).
		 *
		 * @param string $platform bale|telegram.
		 * @return string
		 */
		public static function bot_username( $platform = 'bale' ) {
			$key  = 'balewoo_bot_username_' . $platform;
			$user = get_transient( $key );

			if ( $user ) {
				return $user;
			}

			$client = 'telegram' === $platform ? new BaleWoo_API_Telegram() : new BaleWoo_API_Bale();
			$me     = $client->is_configured() ? $client->get_me() : null;

			if ( is_array( $me ) && ! empty( $me['username'] ) ) {
				$user = $me['username'];
				set_transient( $key, $user, HOUR_IN_SECONDS );
				return $user;
			}

			return '';
		}
	}
}
