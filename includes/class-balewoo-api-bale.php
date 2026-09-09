<?php
/**
 * Bale bot API client (Telegram-compatible + Bale payments).
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_API_Bale' ) ) {

	/**
	 * Bale messenger API.
	 */
	class BaleWoo_API_Bale extends BaleWoo_API_Messenger {

		/**
		 * Platform slug.
		 *
		 * @var string
		 */
		protected $platform = 'bale';

		/**
		 * Constructor.
		 *
		 * @param string $token Bot token (defaults to saved one).
		 */
		public function __construct( $token = null ) {
			$this->base = untrailingslashit( (string) apply_filters( 'balewoo_bale_api_base', BaleWoo_Settings::get( 'bale_api_base', 'https://tapi.bale.ai' ) ) );
			if ( null === $token ) {
				$token = BaleWoo_Settings::get( 'bale_token' );
			}
			parent::__construct( $token );
		}

		/**
		 * Create a payable invoice link (works for any user, no chat required).
		 *
		 * @param array $args Invoice args: title, description, payload, provider_token, prices, photo_url, need_name, need_phone_number...
		 * @return string|WP_Error Invoice URL.
		 */
		public function create_invoice_link( $args ) {
			$defaults = array(
				'title'              => '',
				'description'        => '',
				'payload'            => '',
				'provider_token'     => BaleWoo_Settings::get( 'bale_provider_token' ),
				'currency'           => 'IRR',
				'prices'             => array(),
				'photo_url'          => '',
				'is_flexible'        => false,
				'need_name'          => false,
				'need_phone_number'  => false,
				'need_email'         => false,
				'need_shipping_address' => false,
			);

			$params = wp_parse_args( $args, $defaults );
			$params = array_filter(
				$params,
				function ( $value ) {
					return !( '' === $value || null === $value || array() === $value );
				}
			);

			$result = $this->request( 'createInvoiceLink', $params );

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( is_string( $result ) ) {
				return $result;
			}

			if ( is_array( $result ) && ! empty( $result['url'] ) ) {
				return $result['url'];
			}

			if ( is_array( $result ) && ! empty( $result['invoice_link'] ) ) {
				return $result['invoice_link'];
			}

			return new WP_Error( 'balewoo_no_invoice', __( 'لینک پرداختی از سمت بله دریافت نشد.', 'balewoo' ), $result );
		}

		/**
		 * Send an invoice straight into a chat (user pays inside Bale).
		 *
		 * @param string $chat_id Chat id.
		 * @param array  $args    Invoice args (same as create_invoice_link + chat_id).
		 * @return array|WP_Error
		 */
		public function send_invoice( $chat_id, $args ) {
			$args['chat_id'] = $chat_id;
			return $this->request( 'sendInvoice', array_filter( $args, function ( $value ) {
				return !( '' === $value || null === $value || array() === $value );
			} ) );
		}

		/**
		 * Answer a pre-checkout query (confirm the order can be fulfilled).
		 *
		 * @param string $query_id Pre-checkout query id.
		 * @param bool   $ok       Whether everything is fine.
		 * @param string $error    Error message shown to the user when rejected.
		 * @return array|WP_Error
		 */
		public function answer_pre_checkout_query( $query_id, $ok = true, $error = '' ) {
			$params = array(
				'pre_checkout_query_id' => $query_id,
				'ok'                    => (bool) $ok,
			);
			if ( ! $ok ) {
				$params['error_message'] = $error ? $error : __( 'امکان پردازش این سفارش وجود ندارد.', 'balewoo' );
			}
			return $this->request( 'answerPreCheckoutQuery', $params );
		}

		/**
		 * Refund a payment (best-effort, depends on provider support).
		 *
		 * @param string $charge_id Provider charge id.
		 * @return array|WP_Error
		 */
		public function refund_payment( $charge_id ) {
			return $this->request( 'refundPayment', array( 'provider_payment_charge_id' => $charge_id ) );
		}
	}
}
