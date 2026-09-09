<?php
/**
 * Settings registry.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Settings' ) ) {

	/**
	 * Read / write plugin settings.
	 */
	class BaleWoo_Settings {

		/**
		 * Cached settings.
		 *
		 * @var array|null
		 */
		private static $settings = null;

		/**
		 * Default settings.
		 *
		 * @return array
		 */
		public static function defaults() {
			return array(
				// اتصال‌ها.
				'bale_token'             => '',
				'telegram_token'         => '',
				'bale_admin_chat_id'     => '',
				'telegram_admin_chat_id' => '',
				'admin_phone'            => '',
				'webhook_secret'         => '',
				'bale_api_base'          => 'https://tapi.bale.ai',

				// درگاه.
				'gateway_enabled'        => 'yes',
				'bale_pay_enabled'       => 'yes',
				'card_pay_enabled'       => 'yes',
				'bale_provider_token'    => '',
				'amount_unit'            => 'toman',
				'payment_deadline_hours' => 24,
				'status_after_approval'  => 'processing',
				'payment_guide_text'     => "لطفاً مبلغ سفارش را به یکی از شماره کارت‌های زیر واریز کرده و سپس تصویر رسید را ارسال کنید.\nپس از تأیید توسط مدیر، سفارش شما پردازش خواهد شد.",
				'cards'                  => array(),
				'sheba'                  => '',

				// اعلان‌ها.
				'notify_customer_bale'     => 'yes',
				'notify_customer_telegram' => 'no',
				'notify_admin_bale'        => 'yes',
				'notify_admin_telegram'    => 'no',
				'channel_priority'         => array( 'bale_bot', 'safir', 'sms' ),

				// سفیر بله.
				'safir_enabled'      => 'no',
				'safir_key'          => '',
				'safir_bot_id'       => '',
				'safir_to_customer'  => 'no',

				// پیامک.
				'sms_enabled'        => 'no',
				'sms_username'       => '',
				'sms_password'       => '',
				'sms_from'           => '',
				'sms_flash'          => 'no',
				'sms_to_customer'    => 'no',
				'sms_endpoint'       => 'https://rest.payamak-panel.com/api/SendSMS/SendSMS',

				// قالب پیام‌ها.
				'tpl_customer_new'   => "سلام {customer} عزیز 🙏\nسفارش شما با شماره #{order_id} ثبت شد.\n\n🧾 اقلام: {items}\n💰 مبلغ قابل پرداخت: {total}\n\n{cards}\nپس از واریز، تصویر رسید را همین‌جا ارسال کنید.\n{order_url}",
				'tpl_customer_paid'  => "✅ پرداخت سفارش #{order_id} تأیید شد.\n\n💰 مبلغ: {total}\n📦 وضعیت: {status}\n🔢 کد پیگیری: {tracking}\n\nاز خرید شما سپاسگزاریم ❤️",
				'tpl_customer_reject' => "❌ پرداخت سفارش #{order_id} تأیید نشد.\n\n💰 مبلغ: {total}\nدر صورت کسر وجه، تا ۷۲ ساعت به حساب شما بازمی‌گردد.\nبرای پیگیری: {order_url}",
				'tpl_admin_new'      => "🆕 سفارش جدید #{order_id}\n\n👤 مشتری: {customer}\n📞 تلفن: {phone}\n💰 مبلغ: {total}\n🛍 اقلام: {items}\n📅 تاریخ: {date}\n🔗 مشاهده: {admin_url}",

				// گزارش خودکار.
				'report_type'        => 'none',
				'report_time'        => '09:00',
				'report_day'         => 'saturday',
				'report_via'         => 'bale',

				// ظاهر.
				'theme'              => 'blue',
				'dark_mode'          => 'no',
				'enable_scenarios'   => 'yes',
			);
		}

		/**
		 * Get all settings merged with defaults.
		 *
		 * @return array
		 */
		public static function all() {
			if ( null === self::$settings ) {
				$stored = get_option( BALEWOO_OPTION, array() );
				if ( ! is_array( $stored ) ) {
					$stored = array();
				}
				self::$settings = wp_parse_args( $stored, self::defaults() );
			}
			return self::$settings;
		}

		/**
		 * Get single setting.
		 *
		 * @param string $key     Setting key.
		 * @param mixed  $default Fallback value.
		 * @return mixed
		 */
		public static function get( $key, $default = null ) {
			$all = self::all();
			if ( array_key_exists( $key, $all ) ) {
				return $all[ $key ];
			}
			return null === $default ? '' : $default;
		}

		/**
		 * Check a yes/no setting.
		 *
		 * @param string $key Setting key.
		 * @return bool
		 */
		public static function is_on( $key ) {
			return 'yes' === self::get( $key, 'no' ) || '1' === (string) self::get( $key, 'no' );
		}

		/**
		 * Persist settings.
		 *
		 * Only the submitted keys are updated; everything else keeps its stored
		 * value. When the request carries `_keys`, checkboxes that belong to the
		 * submitted form but are absent from the payload are switched off.
		 *
		 * @param array $data Raw settings.
		 * @return void
		 */
		public static function save( $data ) {
			$defaults = self::defaults();
			$clean    = self::all();

			$submitted_keys = null;
			if ( isset( $data['_keys'] ) ) {
				$submitted_keys = is_array( $data['_keys'] ) ? $data['_keys'] : explode( ',', (string) $data['_keys'] );
				$submitted_keys = array_filter( array_map( 'sanitize_key', $submitted_keys ) );
				unset( $data['_keys'] );
			}

			foreach ( $defaults as $key => $default_value ) {
				if ( null !== $submitted_keys && ! in_array( $key, $submitted_keys, true ) ) {
					continue;
				}

				if ( 'webhook_secret' === $key ) {
					$clean[ $key ] = isset( $data[ $key ] ) && $data[ $key ] ? sanitize_text_field( $data[ $key ] ) : self::get( 'webhook_secret' );
					continue;
				}

				if ( 'cards' === $key ) {
					$clean[ $key ] = self::sanitize_cards( isset( $data['cards'] ) ? $data['cards'] : array() );
					continue;
				}

				if ( 'channel_priority' === $key ) {
					$raw          = isset( $data[ $key ] ) ? (array) $data[ $key ] : array( 'bale_bot', 'safir', 'sms' );
					$clean[ $key ] = array_values( array_intersect( array( 'bale_bot', 'safir', 'sms', 'telegram' ), array_map( 'sanitize_text_field', $raw ) ) );
					continue;
				}

				if ( is_bool( $default_value ) ) {
					$clean[ $key ] = ! empty( $data[ $key ] );
					continue;
				}

				if ( isset( $data[ $key ] ) ) {
					if ( in_array( $key, array( 'tpl_customer_new', 'tpl_customer_paid', 'tpl_customer_reject', 'tpl_admin_new', 'payment_guide_text' ), true ) ) {
						$clean[ $key ] = wp_kses_post( wp_unslash( $data[ $key ] ) );
					} elseif ( is_array( $default_value ) ) {
						$clean[ $key ] = array_map( 'sanitize_text_field', (array) $data[ $key ] );
					} elseif ( is_int( $default_value ) ) {
						$clean[ $key ] = (int) $data[ $key ];
					} else {
						$clean[ $key ] = sanitize_text_field( wp_unslash( $data[ $key ] ) );
					}
				} else {
					// Checkboxes that are absent mean "off".
					$clean[ $key ] = in_array( $key, array(
						'gateway_enabled', 'bale_pay_enabled', 'card_pay_enabled', 'notify_customer_bale',
						'notify_customer_telegram', 'notify_admin_bale', 'notify_admin_telegram',
						'safir_enabled', 'safir_to_customer', 'sms_enabled', 'sms_flash', 'sms_to_customer',
						'dark_mode', 'enable_scenarios',
					), true ) ? 'no' : $default_value;
				}
			}

			update_option( BALEWOO_OPTION, $clean );
			self::$settings = null;

			BaleWoo_Logger::add( 'تنظیمات افزونه ذخیره شد.', 'info' );
		}

		/**
		 * Sanitize bank cards.
		 *
		 * @param array $cards Raw cards.
		 * @return array
		 */
		public static function sanitize_cards( $cards ) {
			$clean = array();
			if ( ! is_array( $cards ) ) {
				return $clean;
			}
			foreach ( $cards as $card ) {
				if ( empty( $card['number'] ) ) {
					continue;
				}
				$clean[] = array(
					'number' => sanitize_text_field( wp_unslash( $card['number'] ) ),
					'bank'   => isset( $card['bank'] ) ? sanitize_text_field( wp_unslash( $card['bank'] ) ) : '',
					'holder' => isset( $card['holder'] ) ? sanitize_text_field( wp_unslash( $card['holder'] ) ) : '',
				);
			}
			return $clean;
		}

		/**
		 * Active bank cards.
		 *
		 * @return array
		 */
		public static function cards() {
			$cards = self::get( 'cards', array() );
			return is_array( $cards ) ? array_values( array_filter( $cards, function ( $c ) {
				return ! empty( $c['number'] );
			} ) ) : array();
		}

		/**
		 * Webhook secret (generated if missing).
		 *
		 * @return string
		 */
		public static function webhook_secret() {
			$secret = self::get( 'webhook_secret' );
			if ( ! $secret ) {
				$secret = wp_generate_password( 24, false, false );
				$all    = get_option( BALEWOO_OPTION, array() );
				$all    = is_array( $all ) ? $all : array();
				$all['webhook_secret'] = $secret;
				update_option( BALEWOO_OPTION, $all );
				self::$settings = null;
			}
			return $secret;
		}

		/**
		 * Full webhook URL for a platform.
		 *
		 * @param string $platform bale|telegram.
		 * @return string
		 */
		public static function webhook_url( $platform = 'bale' ) {
			if ( function_exists( 'rest_url' ) ) {
				return rest_url( 'balewoo/v1/webhook/' . $platform . '/' . self::webhook_secret() );
			}
			return add_query_arg(
				array(
					'balewoo_webhook' => $platform,
					'secret'          => self::webhook_secret(),
				),
				home_url( '/' )
			);
		}
	}
}
