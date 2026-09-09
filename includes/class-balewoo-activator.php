<?php
/**
 * Activation / deactivation routines.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Activator' ) ) {

	/**
	 * Handles install-time work: database tables, defaults and cron.
	 */
	class BaleWoo_Activator {

		/**
		 * Run on activation.
		 *
		 * @return void
		 */
		public static function activate() {
			self::create_tables();
			self::install_defaults();
			self::schedule_cron();
			self::add_capabilities();
			flush_rewrite_rules();

			BaleWoo_Logger::add( 'افزونه بله‌وو نصب/به‌روزرسانی شد. نسخه ' . BALEWOO_VERSION, 'info' );
		}

		/**
		 * Run on deactivation.
		 *
		 * @return void
		 */
		public static function deactivate() {
			wp_clear_scheduled_hook( 'balewoo_cron_hourly' );
			wp_clear_scheduled_hook( 'balewoo_cron_reports' );
			wp_clear_scheduled_hook( 'balewoo_cron_five_minutes' );
			flush_rewrite_rules();
		}

		/**
		 * Create plugin tables.
		 *
		 * @return void
		 */
		public static function create_tables() {
			global $wpdb;

			require_once ABSPATH . 'wp-admin/includes/upgrade.php';

			$charset_collate = $wpdb->get_charset_collate();
			$prefix          = $wpdb->prefix;

			$sql_transactions = "CREATE TABLE {$prefix}balewoo_transactions (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				order_id bigint(20) unsigned NOT NULL DEFAULT 0,
				user_id bigint(20) unsigned NOT NULL DEFAULT 0,
				chat_id varchar(64) NOT NULL DEFAULT '',
				customer_name varchar(190) NOT NULL DEFAULT '',
				phone varchar(64) NOT NULL DEFAULT '',
				amount bigint(20) NOT NULL DEFAULT 0,
				currency varchar(10) NOT NULL DEFAULT 'IRR',
				method varchar(32) NOT NULL DEFAULT 'bale',
				platform varchar(32) NOT NULL DEFAULT 'bale',
				status varchar(32) NOT NULL DEFAULT 'pending',
				tracking_code varchar(120) NOT NULL DEFAULT '',
				receipt_url text NULL,
				payload varchar(190) NOT NULL DEFAULT '',
				note text NULL,
				created_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				updated_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				PRIMARY KEY  (id),
				KEY order_id (order_id),
				KEY status (status),
				KEY platform (platform),
				KEY created_at (created_at)
			) $charset_collate;";

			$sql_logs = "CREATE TABLE {$prefix}balewoo_logs (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				level varchar(20) NOT NULL DEFAULT 'info',
				message text NOT NULL,
				context text NULL,
				created_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				PRIMARY KEY  (id),
				KEY level (level),
				KEY created_at (created_at)
			) $charset_collate;";

			$sql_broadcasts = "CREATE TABLE {$prefix}balewoo_broadcasts (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				title varchar(190) NOT NULL DEFAULT '',
				body text NOT NULL,
				audience varchar(64) NOT NULL DEFAULT 'all',
				platform varchar(32) NOT NULL DEFAULT 'bale',
				recipients int(11) NOT NULL DEFAULT 0,
				sent int(11) NOT NULL DEFAULT 0,
				failed int(11) NOT NULL DEFAULT 0,
				status varchar(32) NOT NULL DEFAULT 'sent',
				scheduled_at datetime NULL,
				created_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				PRIMARY KEY  (id),
				KEY status (status)
			) $charset_collate;";

			dbDelta( $sql_transactions );
			dbDelta( $sql_logs );
			dbDelta( $sql_broadcasts );

			update_option( 'balewoo_db_version', BALEWOO_VERSION );
		}

		/**
		 * Install default settings (only missing keys are filled).
		 *
		 * @return void
		 */
		public static function install_defaults() {
			$defaults = BaleWoo_Settings::defaults();
			$current  = get_option( BALEWOO_OPTION, array() );

			if ( ! is_array( $current ) ) {
				$current = array();
			}

			if ( empty( $current['webhook_secret'] ) ) {
				$current['webhook_secret'] = wp_generate_password( 24, false, false );
			}

			$current = wp_parse_args( $current, $defaults );
			update_option( BALEWOO_OPTION, $current );
		}

		/**
		 * Schedule recurring events.
		 *
		 * @return void
		 */
		public static function schedule_cron() {
			if ( ! wp_next_scheduled( 'balewoo_cron_hourly' ) ) {
				wp_schedule_event( time() + 60, 'hourly', 'balewoo_cron_hourly' );
			}
			if ( ! wp_next_scheduled( 'balewoo_cron_five_minutes' ) ) {
				wp_schedule_event( time() + 60, 'balewoo_five_minutes', 'balewoo_cron_five_minutes' );
			}
			if ( ! wp_next_scheduled( 'balewoo_cron_reports' ) ) {
				wp_schedule_event( time() + 300, 'hourly', 'balewoo_cron_reports' );
			}
		}

		/**
		 * Give shop managers access to the plugin screens.
		 *
		 * @return void
		 */
		public static function add_capabilities() {
			$role = get_role( 'administrator' );
			if ( $role && ! $role->has_cap( 'manage_balewoo' ) ) {
				$role->add_cap( 'manage_balewoo' );
			}
			$shop_manager = get_role( 'shop_manager' );
			if ( $shop_manager && ! $shop_manager->has_cap( 'manage_balewoo' ) ) {
				$shop_manager->add_cap( 'manage_balewoo' );
			}
		}
	}
}
