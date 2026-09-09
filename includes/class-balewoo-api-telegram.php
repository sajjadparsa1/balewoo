<?php
/**
 * Telegram bot API client.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_API_Telegram' ) ) {

	/**
	 * Telegram messenger API.
	 */
	class BaleWoo_API_Telegram extends BaleWoo_API_Messenger {

		/**
		 * Platform slug.
		 *
		 * @var string
		 */
		protected $platform = 'telegram';

		/**
		 * Constructor.
		 *
		 * @param string $token Bot token (defaults to saved one).
		 */
		public function __construct( $token = null ) {
			$this->base = untrailingslashit( (string) apply_filters( 'balewoo_telegram_api_base', 'https://api.telegram.org' ) );
			if ( null === $token ) {
				$token = BaleWoo_Settings::get( 'telegram_token' );
			}
			parent::__construct( $token );
		}
	}
}
