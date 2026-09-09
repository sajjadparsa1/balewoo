<?php
/**
 * Plugin Name:       بله‌وو | BaleWoo — درگاه پرداخت بله و مدیریت سفارشات ووکامرس
 * Plugin URI:        https://github.com/sajjadparsa1/balewoo
 * Description:       افزونه‌ای قدرتمند برای پرداخت آنلاین از طریق بله (کیف پول بله) و پرداخت کارت‌به‌کارت با تأیید هوشمند از طریق ربات‌های بله و تلگرام. شامل اعلان خودکار، تأیید/رد با دکمه‌های اینلاین، بازگشت (Undo)، آپلود رسید، گزارش خودکار، ارسال گروهی، پیامک و سفیر بله.
 * Version:           1.0.0
 * Author:            BaleWoo
 * Author URI:        https://github.com/sajjadparsa1/balewoo
 * License:           GPL-2.0+
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       balewoo
 * Domain Path:       /languages
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 8.0
 * WC tested up to:   9.5
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

define( 'BALEWOO_VERSION', '1.0.0' );
define( 'BALEWOO_FILE', __FILE__ );
define( 'BALEWOO_DIR', plugin_dir_path( __FILE__ ) );
define( 'BALEWOO_URL', plugin_dir_url( __FILE__ ) );
define( 'BALEWOO_BASENAME', plugin_basename( __FILE__ ) );
define( 'BALEWOO_OPTION', 'balewoo_settings' );

require_once BALEWOO_DIR . 'includes/class-balewoo-activator.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-settings.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-logger.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-api-messenger.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-api-bale.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-api-telegram.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-api-safir.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-api-sms.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-templates.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-transactions.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-orders.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-notifier.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-webhook.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-gateway.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-paypage.php';
require_once BALEWOO_DIR . 'includes/class-balewoo-cron.php';

if ( is_admin() || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
	require_once BALEWOO_DIR . 'includes/class-balewoo-admin.php';
}

register_activation_hook( BALEWOO_FILE, array( 'BaleWoo_Activator', 'activate' ) );
register_deactivation_hook( BALEWOO_FILE, array( 'BaleWoo_Activator', 'deactivate' ) );

/**
 * Declare WooCommerce feature compatibility (HPOS / Cart & Checkout blocks).
 */
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', BALEWOO_FILE, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', BALEWOO_FILE, false );
		}
	}
);

/**
 * Load plugin text domain.
 */
add_action(
	'plugins_loaded',
	function () {
		load_plugin_textdomain( 'balewoo', false, dirname( BALEWOO_BASENAME ) . '/languages' );
	}
);

/**
 * Admin notice when WooCommerce is missing.
 */
function balewoo_missing_woocommerce_notice() {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	echo '<div class="notice notice-error"><p>';
	printf(
		/* translators: %s: WooCommerce plugin name */
		esc_html__( 'افزونه «بله‌وو» برای کار نیاز به ووکامرس دارد. لطفاً ابتدا ووکامرس را نصب و فعال کنید.', 'balewoo' ),
		'BaleWoo'
	);
	echo '</p></div>';
}

/**
 * Bootstrap the plugin once all plugins are loaded.
 */
function balewoo_init() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', 'balewoo_missing_woocommerce_notice' );
		return;
	}

	BaleWoo_Webhook::init();
	BaleWoo_Orders::init();
	BaleWoo_Paypage::init();
	BaleWoo_Cron::init();

	if ( is_admin() || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
		BaleWoo_Admin::init();
	}
}
add_action( 'plugins_loaded', 'balewoo_init', 20 );
