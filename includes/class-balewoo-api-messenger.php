<?php
/**
 * Shared (Telegram-compatible) messenger API client.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_API_Messenger' ) ) {

	/**
	 * Thin HTTP client for Telegram-compatible bot APIs (Bale / Telegram).
	 */
	class BaleWoo_API_Messenger {

		/**
		 * Bot token.
		 *
		 * @var string
		 */
		protected $token = '';

		/**
		 * API base URL (without trailing slash, no token).
		 *
		 * @var string
		 */
		protected $base = '';

		/**
		 * Platform slug.
		 *
		 * @var string
		 */
		protected $platform = 'bale';

		/**
		 * Last error message.
		 *
		 * @var string
		 */
		public $last_error = '';

		/**
		 * Constructor.
		 *
		 * @param string $token Bot token.
		 */
		public function __construct( $token = null ) {
			if ( null !== $token ) {
				$this->set_token( $token );
			}
		}

		/**
		 * Set token.
		 *
		 * @param string $token Token.
		 * @return void
		 */
		public function set_token( $token ) {
			$this->token = trim( (string) $token );
		}

		/**
		 * Get current token.
		 *
		 * @return string
		 */
		public function get_token() {
			return $this->token;
		}

		/**
		 * Platform slug.
		 *
		 * @return string
		 */
		public function get_platform() {
			return $this->platform;
		}

		/**
		 * Whether a usable token is set.
		 *
		 * @return bool
		 */
		public function is_configured() {
			return ! empty( $this->token );
		}

		/**
		 * Build full API endpoint.
		 *
		 * @param string $method API method.
		 * @return string
		 */
		protected function endpoint( $method ) {
			return $this->base . '/bot' . $this->token . '/' . ltrim( $method, '/' );
		}

		/**
		 * Perform an API call.
		 *
		 * @param string $method      API method.
		 * @param array  $params      Parameters.
		 * @param string $http_method GET or POST.
		 * @return array|WP_Error
		 */
		public function request( $method, $params = array(), $http_method = 'POST' ) {
			$this->last_error = '';

			if ( ! $this->is_configured() ) {
				$this->last_error = __( 'توکن ربات تنظیم نشده است.', 'balewoo' );
				return new WP_Error( 'balewoo_no_token', $this->last_error );
			}

			$url  = $this->endpoint( $method );
			$args = array(
				'timeout'    => (int) apply_filters( 'balewoo_api_timeout', 25 ),
				'headers'    => array( 'Accept' => 'application/json' ),
				'sslverify'  => (bool) apply_filters( 'balewoo_api_sslverify', true ),
				'user-agent' => 'BaleWoo/' . BALEWOO_VERSION . '; ' . home_url( '/' ),
				'body'       => $params,
			);

			if ( 'GET' === strtoupper( $http_method ) ) {
				$url           = add_query_arg( $params, $url );
				$response      = wp_remote_get( $url, $args ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			} else {
				$args['headers']['Content-Type'] = 'application/json';
				$args['body']                    = wp_json_encode( $params );
				$response                        = wp_remote_post( $url, $args ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}

			if ( is_wp_error( $response ) ) {
				$this->last_error = $response->get_error_message();
				BaleWoo_Logger::error( sprintf( '%s API error (%s): %s', ucfirst( $this->platform ), $method, $this->last_error ) );
				return $response;
			}

			$code = wp_remote_retrieve_response_code( $response );
			$body = wp_remote_retrieve_body( $response );
			$data = json_decode( $body, true );

			if ( ! is_array( $data ) ) {
				$this->last_error = sprintf( 'HTTP %s — پاسخ نامعتبر از سرور.', $code );
				BaleWoo_Logger::error( sprintf( '%s API (%s): %s', ucfirst( $this->platform ), $method, $this->last_error ), $body );
				return new WP_Error( 'balewoo_invalid_response', $this->last_error, array( 'status' => $code ) );
			}

			if ( empty( $data['ok'] ) ) {
				$this->last_error = isset( $data['description'] ) ? $data['description'] : sprintf( 'HTTP %s', $code );
				BaleWoo_Logger::error( sprintf( '%s API (%s): %s', ucfirst( $this->platform ), $method, $this->last_error ), $data );
				return new WP_Error( 'balewoo_api_error', $this->last_error, array( 'status' => $code, 'response' => $data ) );
			}

			return isset( $data['result'] ) ? $data['result'] : $data;
		}

		/**
		 * getMe — validate token.
		 *
		 * @return array|WP_Error
		 */
		public function get_me() {
			return $this->request( 'getMe', array(), 'GET' );
		}

		/**
		 * Send a message.
		 *
		 * @param string $chat_id      Chat id.
		 * @param string $text         Message text.
		 * @param array  $reply_markup Inline keyboard array.
		 * @param string $parse_mode   HTML or Markdown.
		 * @return array|WP_Error
		 */
		public function send_message( $chat_id, $text, $reply_markup = null, $parse_mode = 'HTML' ) {
			$params = array(
				'chat_id'    => $chat_id,
				'text'       => $text,
				'parse_mode' => $parse_mode,
			);
			if ( ! empty( $reply_markup ) ) {
				$params['reply_markup'] = $reply_markup;
			}

			$result = $this->request( 'sendMessage', $params );

			if ( is_wp_error( $result ) && 'HTML' === $parse_mode ) {
				// Retry without formatting — some clients choke on HTML entities.
				unset( $params['parse_mode'] );
				$result = $this->request( 'sendMessage', $params );
			}

			return $result;
		}

		/**
		 * Send a photo.
		 *
		 * @param string $chat_id      Chat id.
		 * @param string $photo        URL or file_id.
		 * @param string $caption      Caption.
		 * @param array  $reply_markup Keyboard.
		 * @return array|WP_Error
		 */
		public function send_photo( $chat_id, $photo, $caption = '', $reply_markup = null ) {
			$params = array(
				'chat_id' => $chat_id,
				'photo'   => $photo,
				'caption' => $caption,
			);
			if ( $reply_markup ) {
				$params['reply_markup'] = $reply_markup;
			}
			return $this->request( 'sendPhoto', $params );
		}

		/**
		 * Edit an existing message text.
		 *
		 * @param string $chat_id    Chat id.
		 * @param int    $message_id Message id.
		 * @param string $text       New text.
		 * @param array  $reply_markup New keyboard (null keeps, array() removes).
		 * @return array|WP_Error
		 */
		public function edit_message_text( $chat_id, $message_id, $text, $reply_markup = null ) {
			$params = array(
				'chat_id'    => $chat_id,
				'message_id' => (int) $message_id,
				'text'       => $text,
				'parse_mode' => 'HTML',
			);
			if ( null !== $reply_markup ) {
				$params['reply_markup'] = $reply_markup;
			}
			return $this->request( 'editMessageText', $params );
		}

		/**
		 * Answer a callback query.
		 *
		 * @param string $callback_id Callback query id.
		 * @param string $text        Toast text.
		 * @param bool   $alert       Show as alert.
		 * @return array|WP_Error
		 */
		public function answer_callback_query( $callback_id, $text = '', $alert = false ) {
			return $this->request(
				'answerCallbackQuery',
				array(
					'callback_query_id' => $callback_id,
					'text'              => $text,
					'show_alert'        => (bool) $alert,
				)
			);
		}

		/**
		 * Answer a pre-checkout query (payments).
		 *
		 * @param string $query_id Pre-checkout query id.
		 * @param bool   $ok       Whether the order can be fulfilled.
		 * @param string $error    Error message when rejected.
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
		 * Resolve a file id to a download URL.
		 *
		 * @param string $file_id File id.
		 * @return string|WP_Error
		 */
		public function get_file_url( $file_id ) {
			$file = $this->request( 'getFile', array( 'file_id' => $file_id ), 'GET' );
			if ( is_wp_error( $file ) ) {
				return $file;
			}
			$path = is_array( $file ) && isset( $file['file_path'] ) ? $file['file_path'] : '';
			if ( ! $path ) {
				return new WP_Error( 'balewoo_no_file', __( 'مسیر فایل یافت نشد.', 'balewoo' ) );
			}
			return $this->base . '/file/bot' . $this->token . '/' . ltrim( $path, '/' );
		}

		/**
		 * Register a webhook.
		 *
		 * @param string $url Webhook URL.
		 * @return array|WP_Error
		 */
		public function set_webhook( $url ) {
			return $this->request(
				'setWebhook',
				array(
					'url'             => $url,
					'allowed_updates' => array( 'message', 'callback_query', 'pre_checkout_query', 'successful_payment' ),
				)
			);
		}

		/**
		 * Remove webhook.
		 *
		 * @return array|WP_Error
		 */
		public function delete_webhook() {
			return $this->request( 'deleteWebhook', array( 'drop_pending_updates' => false ) );
		}

		/**
		 * Recent updates (used to discover chat ids).
		 *
		 * @param int $limit Number of updates.
		 * @return array|WP_Error
		 */
		public function get_updates( $limit = 20 ) {
			return $this->request( 'getUpdates', array( 'limit' => (int) $limit, 'timeout' => 1 ), 'GET' );
		}
	}
}
