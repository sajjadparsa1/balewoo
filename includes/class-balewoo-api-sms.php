<?php
/**
 * SMS provider (Melipayamak compatible).
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_API_SMS' ) ) {

	/**
	 * Sends SMS through a Melipayamak-style REST endpoint.
	 */
	class BaleWoo_API_SMS {

		/**
		 * Last error.
		 *
		 * @var string
		 */
		public $last_error = '';

		/**
		 * Whether SMS is configured.
		 *
		 * @return bool
		 */
		public function is_configured() {
			return (bool) ( BaleWoo_Settings::get( 'sms_username' ) && BaleWoo_Settings::get( 'sms_password' ) && BaleWoo_Settings::get( 'sms_from' ) );
		}

		/**
		 * Send an SMS.
		 *
		 * @param string $phone   Recipient.
		 * @param string $message Message body.
		 * @return bool|WP_Error
		 */
		public function send( $phone, $message ) {
			$this->last_error = '';

			if ( ! $this->is_configured() ) {
				$this->last_error = __( 'تنظیمات پیامک کامل نیست.', 'balewoo' );
				return new WP_Error( 'balewoo_sms_off', $this->last_error );
			}

			$endpoint = BaleWoo_Settings::get( 'sms_endpoint', 'https://rest.payamak-panel.com/api/SendSMS/SendSMS' );
			$phone    = BaleWoo_API_Safir::normalize_phone( $phone );

			if ( ! $phone ) {
				$this->last_error = __( 'شماره تلفن معتبر نیست.', 'balewoo' );
				return new WP_Error( 'balewoo_sms_phone', $this->last_error );
			}

			$body = array(
				'username' => BaleWoo_Settings::get( 'sms_username' ),
				'password' => BaleWoo_Settings::get( 'sms_password' ),
				'to'       => $phone,
				'from'     => BaleWoo_Settings::get( 'sms_from' ),
				'text'     => $message,
				'isFlash'  => BaleWoo_Settings::is_on( 'sms_flash' ),
			);

			$response = wp_remote_post(
				$endpoint,
				array(
					'timeout'   => 20,
					'sslverify' => (bool) apply_filters( 'balewoo_api_sslverify', true ),
					'headers'   => array( 'Content-Type' => 'application/json' ),
					'body'      => wp_json_encode( $body ),
				)
			);

			if ( is_wp_error( $response ) ) {
				$this->last_error = $response->get_error_message();
				BaleWoo_Logger::error( 'SMS error: ' . $this->last_error );
				return $response;
			}

			$code = wp_remote_retrieve_response_code( $response );
			$raw  = wp_remote_retrieve_body( $response );

			if ( $code < 200 || $code >= 300 ) {
				$this->last_error = sprintf( 'HTTP %s — %s', $code, wp_strip_all_tags( substr( $raw, 0, 200 ) ) );
				BaleWoo_Logger::error( 'SMS HTTP error: ' . $this->last_error );
				return new WP_Error( 'balewoo_sms_http', $this->last_error );
			}

			BaleWoo_Logger::success( sprintf( 'SMS sent to %s', $phone ) );
			return true;
		}
	}
}
