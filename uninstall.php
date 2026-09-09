<?php
/**
 * Fired when the plugin is uninstalled.
 *
 * @package BaleWoo
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// حذف تنظیمات.
delete_option( 'balewoo_settings' );
delete_option( 'balewoo_db_version' );
delete_option( 'balewoo_webhook_check' );

// حذف جداول.
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}balewoo_transactions" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}balewoo_logs" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}balewoo_broadcasts" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

// حذف متادیتای کاربران (اتصال به ربات).
$wpdb->query( "DELETE FROM {$wpdb->usermeta} WHERE meta_key IN ('_balewoo_bale_chat_id','_balewoo_telegram_chat_id','_balewoo_phone')" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

// حذف زمان‌بندی‌ها.
wp_clear_scheduled_hook( 'balewoo_cron_hourly' );
wp_clear_scheduled_hook( 'balewoo_cron_five_minutes' );
wp_clear_scheduled_hook( 'balewoo_cron_reports' );

// حذف ترنزینت‌ها.
delete_transient( 'balewoo_notice_dismissed' );
delete_transient( 'balewoo_demo_order' );
delete_transient( 'balewoo_bot_username_bale' );
delete_transient( 'balewoo_bot_username_telegram' );

// حذف capability.
$roles = array( 'administrator', 'shop_manager' );
foreach ( $roles as $role_name ) {
	$role = get_role( $role_name );
	if ( $role && $role->has_cap( 'manage_balewoo' ) ) {
		$role->remove_cap( 'manage_balewoo' );
	}
}

wp_cache_flush();
