<?php
/**
 * Inline Bale payment block (order-pay page).
 *
 * @package BaleWoo
 *
 * @var WC_Order $order
 */

defined( 'ABSPATH' ) || exit;

$invoice_url  = $order->get_meta( '_balewoo_invoice_url', true );
$bot_link     = BaleWoo_Paypage::bot_link( $order, 'bale' );
$amount       = BaleWoo_Orders::amount_label( $order );
$attempts     = (int) $order->get_meta( '_balewoo_invoice_attempts', true );
?>
<div class="balewoo-pay-inline" id="balewoo-pay-status" data-order="<?php echo esc_attr( $order->get_id() ); ?>" data-key="<?php echo esc_attr( $order->get_order_key() ); ?>">
	<h3><?php esc_html_e( 'پرداخت با کیف پول بله', 'balewoo' ); ?></h3>

	<p class="balewoo-pay-inline-amount">
		<?php esc_html_e( 'مبلغ قابل پرداخت:', 'balewoo' ); ?> <strong><?php echo esc_html( $amount ); ?></strong>
	</p>

	<?php if ( $invoice_url ) : ?>
		<a class="balewoo-pay-button" href="<?php echo esc_url( $invoice_url ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'پرداخت با بله 💙', 'balewoo' ); ?></a>
	<?php else : ?>
		<button type="button" class="balewoo-pay-button" id="balewoo-retry-invoice" data-order="<?php echo esc_attr( $order->get_id() ); ?>">
			<?php esc_html_e( 'دریافت لینک پرداخت', 'balewoo' ); ?>
		</button>
		<?php if ( $attempts > 1 ) : ?>
			<p class="balewoo-pay-warning"><?php esc_html_e( 'ساخت لینک پرداخت ناموفق بود. توکن پرداخت بله را در تنظیمات بررسی کنید.', 'balewoo' ); ?></p>
		<?php endif; ?>
	<?php endif; ?>

	<p class="balewoo-pay-status-text"><?php esc_html_e( 'در انتظار تأیید پرداخت…', 'balewoo' ); ?></p>

	<?php if ( $bot_link ) : ?>
		<a class="balewoo-pay-secondary" href="<?php echo esc_url( $bot_link ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'اتصال به ربات بله', 'balewoo' ); ?></a>
	<?php endif; ?>
</div>
