<?php
/**
 * Card-to-card instructions + receipt upload block.
 *
 * @package BaleWoo
 *
 * @var WC_Order $order
 * @var array    $cards
 * @var string   $receipt
 */

defined( 'ABSPATH' ) || exit;

$guide     = BaleWoo_Settings::get( 'payment_guide_text' );
$sheba     = BaleWoo_Settings::get( 'sheba' );
$deadline  = $order->get_meta( '_balewoo_deadline', true );
$bot_link  = BaleWoo_Paypage::bot_link( $order, 'bale' );
?>
<div class="balewoo-card-block" id="balewoo-card-block" data-order="<?php echo esc_attr( $order->get_id() ); ?>" data-key="<?php echo esc_attr( $order->get_order_key() ); ?>">
	<h3><?php esc_html_e( 'پرداخت کارت به کارت', 'balewoo' ); ?></h3>

	<?php if ( $guide ) : ?>
		<p class="balewoo-card-guide"><?php echo nl2br( esc_html( $guide ) ); ?></p>
	<?php endif; ?>

	<?php if ( ! empty( $cards ) ) : ?>
		<ul class="balewoo-card-numbers">
			<?php foreach ( $cards as $card ) : ?>
				<li>
					<span class="balewoo-card-number" data-card="<?php echo esc_attr( preg_replace( '/\D/', '', $card['number'] ) ); ?>"><?php echo esc_html( BaleWoo_Templates::format_card( $card['number'] ) ); ?></span>
					<?php if ( ! empty( $card['bank'] ) ) : ?>
						<span class="balewoo-card-bank"><?php echo esc_html( $card['bank'] ) ; ?></span>
					<?php endif; ?>
					<?php if ( ! empty( $card['holder'] ) ) : ?>
						<span class="balewoo-card-holder"><?php echo esc_html( $card['holder'] ); ?></span>
					<?php endif; ?>
					<button type="button" class="balewoo-copy-card"><?php esc_html_e( 'کپی', 'balewoo' ); ?></button>
				</li>
			<?php endforeach; ?>
		</ul>
	<?php endif; ?>

	<?php if ( $sheba ) : ?>
		<p class="balewoo-card-sheba"><?php esc_html_e( 'شماره شبا:', 'balewoo' ); ?> <bdi><?php echo esc_html( $sheba ); ?></bdi></p>
	<?php endif; ?>

	<?php if ( $deadline ) : ?>
		<p class="balewoo-card-deadline">
			<?php echo esc_html( sprintf( __( 'مهلت پرداخت تا %s', 'balewoo' ), BaleWoo_Templates::jdate( strtotime( $deadline ), 'Y/m/d H:i' ) ) ); ?>
		</p>
	<?php endif; ?>

	<?php if ( $receipt ) : ?>
		<div class="balewoo-receipt-preview">
			<p><?php esc_html_e( 'رسید شما ارسال شده و در انتظار تأیید مدیر است.', 'balewoo' ); ?></p>
			<a href="<?php echo esc_url( $receipt ); ?>" target="_blank" rel="noopener">
				<img src="<?php echo esc_url( $receipt ); ?>" alt="<?php esc_attr_e( 'رسید پرداخت', 'balewoo' ); ?>">
			</a>
		</div>
	<?php else : ?>
		<form class="balewoo-receipt-form" enctype="multipart/form-data">
			<input type="hidden" name="action" value="balewoo_upload_receipt">
			<input type="hidden" name="order_id" value="<?php echo esc_attr( $order->get_id() ); ?>">
			<input type="hidden" name="key" value="<?php echo esc_attr( $order->get_order_key() ); ?>">
			<input type="hidden" name="nonce" value="<?php echo esc_attr( wp_create_nonce( 'balewoo_front' ) ); ?>">
			<label class="balewoo-file-label">
				<input type="file" name="receipt" accept="image/*,application/pdf" required>
				<span><?php esc_html_e( 'انتخاب تصویر رسید', 'balewoo' ); ?></span>
			</label>
			<button type="submit" class="balewoo-submit-receipt"><?php esc_html_e( 'ارسال رسید', 'balewoo' ); ?></button>
			<span class="balewoo-receipt-message"></span>
		</form>
	<?php endif; ?>

	<?php if ( $bot_link ) : ?>
		<a class="balewoo-bot-link" href="<?php echo esc_url( $bot_link ); ?>" target="_blank" rel="noopener">
			<?php esc_html_e( 'اتصال به ربات بله برای دریافت اعلان‌ها 💙', 'balewoo' ); ?>
		</a>
	<?php endif; ?>
</div>
