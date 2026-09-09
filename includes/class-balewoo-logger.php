<?php
/**
 * System logger.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Logger' ) ) {

	/**
	 * Writes plugin events to the logs table (and to error_log in debug mode).
	 */
	class BaleWoo_Logger {

		/**
		 * Add a log entry.
		 *
		 * @param string $message Log message.
		 * @param string $level   info|success|warning|error.
		 * @param mixed  $context Optional context (array/object/string).
		 * @return void
		 */
		public static function add( $message, $level = 'info', $context = null ) {
			global $wpdb;

			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( '[BaleWoo][' . $level . '] ' . $message ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}

			$context_string = null;
			if ( null !== $context ) {
				$context_string = is_string( $context ) ? $context : wp_json_encode( $context, JSON_UNESCAPED_UNICODE );
			}

			$wpdb->insert(
				$wpdb->prefix . 'balewoo_logs',
				array(
					'level'      => in_array( $level, array( 'info', 'success', 'warning', 'error' ), true ) ? $level : 'info',
					'message'    => wp_strip_all_tags( (string) $message ),
					'context'    => $context_string,
					'created_at' => current_time( 'mysql', 1 ),
				),
				array( '%s', '%s', '%s', '%s' )
			);

			self::prune();
		}

		/**
		 * Convenience wrappers.
		 *
		 * @param string $message Message.
		 * @param mixed  $context Context.
		 */
		public static function success( $message, $context = null ) {
			self::add( $message, 'success', $context );
		}
		public static function warning( $message, $context = null ) {
			self::add( $message, 'warning', $context );
		}
		public static function error( $message, $context = null ) {
			self::add( $message, 'error', $context );
		}

		/**
		 * Fetch logs.
		 *
		 * @param array $args Query args.
		 * @return array
		 */
		public static function get( $args = array() ) {
			global $wpdb;

			$defaults = array(
				'limit'  => 100,
				'offset' => 0,
				'level'  => '',
				'search' => '',
			);
			$args     = wp_parse_args( $args, $defaults );

			$where  = '1=1';
			$params = array();

			if ( $args['level'] ) {
				$where   .= ' AND level = %s';
				$params[] = $args['level'];
			}
			if ( $args['search'] ) {
				$where   .= ' AND message LIKE %s';
				$params[] = '%' . $wpdb->esc_like( $args['search'] ) . '%';
			}

			$sql = "SELECT * FROM {$wpdb->prefix}balewoo_logs WHERE {$where} ORDER BY id DESC LIMIT %d OFFSET %d";
			$params[] = (int) $args['limit'];
			$params[] = (int) $args['offset'];

			return $wpdb->get_results( $wpdb->prepare( $sql, $params ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		}

		/**
		 * Clear all logs.
		 *
		 * @return void
		 */
		public static function clear() {
			global $wpdb;
			$wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}balewoo_logs" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		/**
		 * Keep the log table small.
		 *
		 * @return void
		 */
		private static function prune() {
			global $wpdb;
			$keep = (int) apply_filters( 'balewoo_log_retention', 500 );
			if ( $keep < 50 ) {
				$keep = 50;
			}
			if ( wp_cache_get( 'balewoo_pruned', 'balewoo' ) ) {
				return;
			}
			wp_cache_set( 'balewoo_pruned', 1, 'balewoo', 300 );

			$wpdb->query(
				$wpdb->prepare(
					"DELETE l FROM {$wpdb->prefix}balewoo_logs l
					 LEFT JOIN (SELECT id FROM {$wpdb->prefix}balewoo_logs ORDER BY id DESC LIMIT %d) k ON l.id = k.id
					 WHERE k.id IS NULL",
					$keep
				)
			); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}
	}
}
