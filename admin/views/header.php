<?php
/**
 * Admin shell header.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$theme     = BaleWoo_Settings::get( 'theme', 'blue' );
$dark      = BaleWoo_Settings::is_on( 'dark_mode' );
$nav_items = array(
	'balewoo'              => __( 'داشبورد', 'balewoo' ),
	'balewoo-transactions' => __( 'تراکنش‌ها', 'balewoo' ),
	'balewoo-broadcast'    => __( 'ارسال گروهی', 'balewoo' ),
	'balewoo-reports'      => __( 'گزارشات', 'balewoo' ),
	'balewoo-settings'     => __( 'تنظیمات', 'balewoo' ),
	'balewoo-logs'         => __( 'لاگ‌ها', 'balewoo' ),
	'balewoo-about'        => __( 'درباره', 'balewoo' ),
);

$bale_ok  = (bool) BaleWoo_Settings::get( 'bale_token' );
$tg_ok    = (bool) BaleWoo_Settings::get( 'telegram_token' );
$cards    = count( BaleWoo_Settings::cards() );
?>
<div class="balewoo-wrap balewoo-theme-<?php echo esc_attr( $theme ); ?><?php echo $dark ? ' balewoo-dark' : ''; ?>">
	<div class="balewoo-shell">
		<aside class="balewoo-sidebar">
			<div class="balewoo-brand">
				<span class="balewoo-logo">💙</span>
				<div>
					<strong><?php esc_html_e( 'بله‌وو', 'balewoo' ); ?></strong>
					<small><?php printf( esc_html__( 'نسخه %s', 'balewoo' ), esc_html( BALEWOO_VERSION ) ); ?></small>
				</div>
			</div>

			<nav class="balewoo-nav">
				<?php foreach ( $nav_items as $slug => $label ) : ?>
					<a class="balewoo-nav-item<?php echo BaleWoo_Admin::$page === str_replace( 'balewoo-', '', $slug ) ? ' is-active' : ''; ?>" href="<?php echo esc_url( admin_url( 'admin.php?page=' . $slug ) ); ?>">
						<?php echo esc_html( $label ); ?>
					</a>
				<?php endforeach; ?>
			</nav>

			<div class="balewoo-sidebar-status">
				<div class="balewoo-status-row">
					<span><?php esc_html_e( 'ربات بله', 'balewoo' ); ?></span>
					<span class="balewoo-dot <?php echo $bale_ok ? 'is-ok' : 'is-off'; ?>"></span>
				</div>
				<div class="balewoo-status-row">
					<span><?php esc_html_e( 'ربات تلگرام', 'balewoo' ); ?></span>
					<span class="balewoo-dot <?php echo $tg_ok ? 'is-ok' : 'is-off'; ?>"></span>
				</div>
				<div class="balewoo-status-row">
					<span><?php esc_html_e( 'کارت‌های بانکی', 'balewoo' ); ?></span>
					<strong><?php echo esc_html( $cards ); ?></strong>
				</div>
			</div>

			<div class="balewoo-sidebar-foot">
				<?php esc_html_e( 'پرداخت امن با بله برای ووکامرس', 'balewoo' ); ?>
			</div>
		</aside>

		<main class="balewoo-main">
			<header class="balewoo-topbar">
				<div>
					<h1><?php echo esc_html( isset( $nav_items[ 'balewoo-' . BaleWoo_Admin::$page ] ) ? $nav_items[ 'balewoo-' . BaleWoo_Admin::$page ] : ( 'dashboard' === BaleWoo_Admin::$page ? $nav_items['balewoo'] : '' ) ); ?></h1>
					<p class="balewoo-subtitle"><?php echo esc_html( get_bloginfo( 'name' ) ); ?> · <?php echo esc_html( BaleWoo_Templates::jdate( time(), 'l d F Y' ) ); ?></p>
				</div>
				<div class="balewoo-topbar-actions">
					<button type="button" class="balewoo-btn balewoo-btn-ghost" id="balewoo-toggle-dark">🌙</button>
					<a class="balewoo-btn balewoo-btn-primary" href="<?php echo esc_url( admin_url( 'admin.php?page=balewoo-settings' ) ); ?>"><?php esc_html_e( 'تنظیمات', 'balewoo' ); ?></a>
				</div>
			</header>

			<div class="balewoo-content">
