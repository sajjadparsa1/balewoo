<?php
/**
 * Standalone "pay with Bale" page.
 *
 * @package BaleWoo
 *
 * @var WC_Order $order
 */

defined( 'ABSPATH' ) || exit;

$invoice_url = $order->get_meta( '_balewoo_invoice_url', true );
$sent_to_chat = 'yes' === $order->get_meta( '_balewoo_invoice_sent_to_chat', true );
$bot_link    = BaleWoo_Paypage::bot_link( $order, 'bale' );
$amount      = BaleWoo_Orders::amount_label( $order );
$shop        = get_bloginfo( 'name' );
?>
<!DOCTYPE html>
<html dir="rtl" lang="<?php echo esc_attr( get_bloginfo( 'language' ) ); ?>">
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title><?php echo esc_html( sprintf( __( 'پرداخت سفارش #%d', 'balewoo' ), $order->get_id() ) ); ?></title>
	<meta name="robots" content="noindex, nofollow">
	<?php wp_print_styles( 'balewoo-front' ); ?>
</head>
<body class="balewoo-pay-body">
	<main class="balewoo-pay-page">
		<div class="balewoo-pay-card">
			<div class="balewoo-pay-brand">
				<span class="balewoo-pay-logo">💙</span>
				<div>
					<h1><?php esc_html_e( 'پرداخت با بله', 'balewoo' ); ?></h1>
					<p><?php echo esc_html( $shop ); ?></p>
				</div>
			</div>

			<div class="balewoo-pay-amount">
				<span><?php esc_html_e( 'مبلغ قابل پرداخت', 'balewoo' ); ?></span>
				<strong><?php echo esc_html( $amount ); ?></strong>
				<span class="balewoo-pay-order"><?php echo esc_html( sprintf( __( 'سفارش #%d', 'balewoo' ), $order->get_id() ) ); ?></span>
			</div>

			<?php if ( $sent_to_chat ) : ?>
				<div class="balewoo-pay-notice">
					<?php esc_html_e( 'صورتحساب پرداخت به گفتگوی شما در بله ارسال شد. اپلیکیشن بله را باز کنید و پرداخت را تأیید کنید.', 'balewoo' ); ?>
				</div>
			<?php endif; ?>

			<?php if ( $invoice_url ) : ?>
				<a class="balewoo-pay-button" href="<?php echo esc_url( $invoice_url ); ?>" target="_blank" rel="noopener">
					<?php esc_html_e( 'پرداخت با بله 💙', 'balewoo' ); ?>
				</a>
			<?php else : ?>
				<div class="balewoo-pay-warning">
					<?php esc_html_e( 'ساخت لینک پرداخت ناموفق بود. لطفاً با پشتیبانی فروشگاه تماس بگیرید یا از روش کارت‌به‌کارت استفاده کنید.', 'balewoo' ); ?>
				</div>
			<?php endif; ?>

			<div class="balewoo-pay-status" id="balewoo-pay-status" data-order="<?php echo esc_attr( $order->get_id() ); ?>" data-key="<?php echo esc_attr( $order->get_order_key() ); ?>">
				<span class="balewoo-spinner"></span>
				<span class="balewoo-pay-status-text"><?php esc_html_e( 'در انتظار تأیید پرداخت…', 'balewoo' ); ?></span>
			</div>

			<?php if ( $bot_link ) : ?>
				<a class="balewoo-pay-secondary" href="<?php echo esc_url( $bot_link ); ?>" target="_blank" rel="noopener">
					<?php esc_html_e( 'اتصال به ربات برای دریافت پیام سفارش', 'balewoo' ); ?>
				</a>
			<?php endif; ?>

			<div class="balewoo-pay-actions">
				<button type="button" class="balewoo-pay-check" id="balewoo-pay-check"><?php esc_html_e( 'پرداخت کردم — بررسی کن', 'balewoo' ); ?></button>
				<a class="balewoo-pay-cancel" href="<?php echo esc_url( $order->get_cancel_order_url() ); ?>"><?php esc_html_e( 'انصراف', 'balewoo' ); ?></a>
			</div>

			<p class="balewoo-pay-foot"><?php esc_html_e( 'پس از پرداخت موفق، به‌صورت خودکار به صفحه تأیید سفارش منتقل می‌شوید.', 'balewoo' ); ?></p>
		</div>
	</main>
	<?php wp_print_scripts( 'balewoo-front' ); ?>
</body>
</html>
