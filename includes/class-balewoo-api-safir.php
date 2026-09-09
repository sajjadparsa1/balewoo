<?php
/**
 * Safir (Bale) — send messages by phone number.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_API_Safir' ) ) {

	/**
	 * Safir API client: https://safir.bale.ai/api/v3/send_message
	 */
	class BaleWoo_API_Safir {

		/**
		 * Endpoint.
		 *
		 * @var string
		 */
		private $endpoint = 'https://safir.bale.ai/api/v3/send_message';

		/**
		 * Last error.
		 *
		 * @var string
		 */
		public $last_error = '';

		/**
		 * Whether Safir is configured.
		 *
		 * @return bool
		 */
		public function is_configured() {
			return (bool) ( BaleWoo_Settings::get( 'safir_key' ) && BaleWoo_Settings::get( 'safir_bot_id' ) );
		}

		/**
		 * Send a text message to a phone number.
		 *
		 * @param string $phone   Phone number (09xx or 989xx).
		 * @param string $message Message text.
		 * @param array  $keyboard Optional inline keyboard.
		 * @return bool|WP_Error
		 */
		public function send( $phone, $message, $keyboard = array() ) {
			$this->last_error = '';

			if ( ! $this->is_configured() ) {
				$this->last_error = __( 'سفیر بله تنظیم نشده است (کلید یا شناسه ربات خالی است).', 'balewoo' );
				return new WP_Error( 'balewoo_safir_off', $this->last_error );
			}

			$phone = self::normalize_phone( $phone );
			if ( ! $phone ) {
				$this->last_error = __( 'شماره تلفن معتبر نیست.', 'balewoo' );
				return new WP_Error( 'balewoo_safir_phone', $this->last_error );
			}

			$message_data = array(
				'is_secure' => false,
				'message'   => array( 'text' => $message ),
			);

			if ( ! empty( $keyboard ) ) {
				$message_data['message']['reply_markup'] = array( 'inline_keyboard' => $keyboard );
			}

			$body = array(
				'request_id'   => 'balewoo-' . wp_generate_password( 12, false, false ),
				'bot_id'       => (int) BaleWoo_Settings::get( 'safir_bot_id' ),
				'phone_number' => $phone,
				'message_data' => $message_data,
			);

			$response = wp_remote_post(
				$this->endpoint,
				array(
					'timeout'   => 20,
					'sslverify' => (bool) apply_filters( 'balewoo_api_sslverify', true ),
					'headers'   => array(
						'Content-Type'   => 'application/json',
						'api-access-key' => BaleWoo_Settings::get( 'safir_key' ),
					),
					'body'      => wp_json_encode( $body ),
				)
			);

			if ( is_wp_error( $response ) ) {
				$this->last_error = $response->get_error_message();
				BaleWoo_Logger::error( 'Safir error: ' . $this->last_error );
				return $response;
			}

			$code = wp_remote_retrieve_response_code( $response );
			$raw  = wp_remote_retrieve_body( $response );
			$data = json_decode( $raw, true );

			if ( $code < 200 || $code >= 300 ) {
				$this->last_error = sprintf( 'HTTP %s — %s', $code, wp_strip_all_tags( substr( $raw, 0, 200 ) ) );
				BaleWoo_Logger::error( 'Safir HTTP error: ' . $this->last_error, $data );
				return new WP_Error( 'balewoo_safir_http', $this->last_error );
			}

			BaleWoo_Logger::success( sprintf( 'Safir message sent to %s', $phone ) );
			return true;
		}

		/**
		 * Normalize Iranian phone numbers to 98xxxxxxxxxx.
		 *
		 * @param string $phone Phone.
		 * @return string
		 */
		public static function normalize_phone( $phone ) {
			$phone = preg_replace( '/[^0-9+]/', '', (string) $phone );
			$phone = ltrim( $phone, '+' );
			if ( preg_match( '/^0098\d{10}$/', $phone ) ) {
				$phone = substr( $phone, 2 );
			}
			if ( preg_match( '/^0\d{10}$/', $phone ) ) {
				$phone = '98' . substr( $phone, 1 );
			}
			return preg_match( '/^98\d{10}$/', $phone ) ? $phone : '';
		}
	}
}
