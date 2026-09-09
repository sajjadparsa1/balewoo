<?php
/**
 * About view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$features = array(
	array( 'icon' => '💳', 'title' => __( 'درگاه کارت به کارت', 'balewoo' ), 'desc' => __( 'مدیریت کامل پرداخت‌های کارت به کارت با تأیید مدیر', 'balewoo' ) ),
	array( 'icon' => '💙', 'title' => __( 'پرداخت آنلاین با بله', 'balewoo' ), 'desc' => __( 'اتصال به کیف پول بله و تأیید خودکار تراکنش', 'balewoo' ) ),
	array( 'icon' => '🔔', 'title' => __( 'اعلان خودکار', 'balewoo' ), 'desc' => __( 'اطلاع‌رسانی هوشمند به مشتری و مدیر در بله و تلگرام', 'balewoo' ) ),
	array( 'icon' => '✅', 'title' => __( 'تأیید از ربات', 'balewoo' ), 'desc' => __( 'تأیید/رد پرداخت با دکمه‌های اینلاین', 'balewoo' ) ),
	array( 'icon' => '↩️', 'title' => __( 'بازگشت (Undo)', 'balewoo' ), 'desc' => __( 'امکان بازگشت از آخرین عملیات تا ۳۰ ثانیه', 'balewoo' ) ),
	array( 'icon' => '📊', 'title' => __( 'گزارش خودکار', 'balewoo' ), 'desc' => __( 'گزارش روزانه و هفتگی فروش برای مدیر', 'balewoo' ) ),
	array( 'icon' => '📨', 'title' => __( 'ارسال گروهی', 'balewoo' ), 'desc' => __( 'ارسال پیام به کاربران بله و تلگرام', 'balewoo' ) ),
	array( 'icon' => '🔗', 'title' => __( 'اتصال دوگانه', 'balewoo' ), 'desc' => __( 'پشتیبانی همزمان از بله و تلگرام', 'balewoo' ) ),
);

$requirements = array(
	__( 'PHP', 'balewoo' )       => array( '7.4+', phpversion(), version_compare( phpversion(), '7.4', '>=' ) ),
	__( 'وردپرس', 'balewoo' )    => array( '6.0+', get_bloginfo( 'version' ), version_compare( get_bloginfo( 'version' ), '6.0', '>=' ) ),
	__( 'ووکامرس', 'balewoo' )   => array( '8.0+', defined( 'WC_VERSION' ) ? WC_VERSION : '-', defined( 'WC_VERSION' ) && version_compare( WC_VERSION, '8.0', '>=' ) ),
	__( 'OpenSSL', 'balewoo' )   => array( 'فعال', extension_loaded( 'openssl' ) ? 'فعال' : 'غیرفعال', extension_loaded( 'openssl' ) ),
	__( 'cURL', 'balewoo' )      => array( 'فعال', extension_loaded( 'curl' ) ? 'فعال' : 'غیرفعال', extension_loaded( 'curl' ) ),
);

$roadmap = array(
	array( 'phase' => __( 'فاز ۱ (نسخه ۱.۰)', 'balewoo' ), 'items' => __( 'درگاه کارت به کارت، پرداخت آنلاین بله، اعلان خودکار، تأیید از ربات، Undo، گزارش، اتصال دوگانه', 'balewoo' ) ),
	array( 'phase' => __( 'فاز ۲ (نسخه ۱.۵)', 'balewoo' ), 'items' => __( 'آپلود رسید از بله/تلگرام (پیاده‌سازی شده)، کد رهگیری، مدیریت وضعیت سفارش از ربات', 'balewoo' ) ),
	array( 'phase' => __( 'فاز ۳ (نسخه ۲.۰)', 'balewoo' ), 'items' => __( 'چت‌بات پیگیری، هشدار موجودی، سیستم تیکت، کاتالوگ محصولات', 'balewoo' ) ),
);
?>
<section class="balewoo-card balewoo-hero">
	<div class="balewoo-hero-icon">💙</div>
	<div>
		<h2><?php esc_html_e( 'بله‌وو', 'balewoo' ); ?> <span class="balewoo-muted"><?php printf( esc_html__( 'نسخه %s', 'balewoo' ), esc_html( BALEWOO_VERSION ) ); ?></span></h2>
		<p><?php esc_html_e( 'افزونه‌ای قدرتمند برای مدیریت خودکار سفارشات ووکامرس از طریق ربات‌های بله و تلگرام. پرداخت آنلاین با بله و تأیید پرداخت‌های کارت‌به‌کارت را هوشمند و سریع کنید.', 'balewoo' ); ?></p>
	</div>
</section>

<section class="balewoo-card">
	<header class="balewoo-card-head"><h2><?php esc_html_e( 'امکانات', 'balewoo' ); ?></h2></header>
	<div class="balewoo-features">
		<?php foreach ( $features as $feature ) : ?>
			<div class="balewoo-feature">
				<span class="balewoo-feature-icon"><?php echo esc_html( $feature['icon'] ); ?></span>
				<strong><?php echo esc_html( $feature['title'] ); ?></strong>
				<p class="balewoo-muted"><?php echo esc_html( $feature['desc'] ); ?></p>
			</div>
		<?php endforeach; ?>
	</div>
</section>

<div class="balewoo-grid balewoo-grid-2">
	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'نیازمندی‌ها', 'balewoo' ); ?></h2></header>
		<table class="balewoo-table">
			<thead>
				<tr><th><?php esc_html_e( 'مورد', 'balewoo' ); ?></th><th><?php esc_html_e( 'نیاز', 'balewoo' ); ?></th><th><?php esc_html_e( 'سرور شما', 'balewoo' ); ?></th><th></th></tr>
			</thead>
			<tbody>
				<?php foreach ( $requirements as $name => $req ) : ?>
					<tr>
						<td><?php echo esc_html( $name ); ?></td>
						<td><?php echo esc_html( $req[0] ); ?></td>
						<td><bdi><?php echo esc_html( $req[1] ); ?></bdi></td>
						<td><?php echo $req[2] ? '<span class="balewoo-dot is-ok"></span>' : '<span class="balewoo-dot is-off"></span>'; ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'نقشه راه', 'balewoo' ); ?></h2></header>
		<ul class="balewoo-roadmap">
			<?php foreach ( $roadmap as $step ) : ?>
				<li>
					<strong><?php echo esc_html( $step['phase'] ); ?></strong>
					<p class="balewoo-muted"><?php echo esc_html( $step['items'] ); ?></p>
				</li>
			<?php endforeach; ?>
		</ul>
	</section>
</div>
