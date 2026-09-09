<?php
/**
 * System logs view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$level  = isset( $_GET['level'] ) ? sanitize_key( $_GET['level'] ) : '';
$logs   = BaleWoo_Logger::get( array( 'limit' => 200, 'level' => $level ) );
$levels = array( 'info', 'success', 'warning', 'error' );
?>
<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'لاگ‌های سیستم', 'balewoo' ); ?></h2>
		<div class="balewoo-card-actions">
			<select id="balewoo-log-level">
				<option value=""><?php esc_html_e( 'همه سطوح', 'balewoo' ); ?></option>
				<?php foreach ( $levels as $item ) : ?>
					<option value="<?php echo esc_attr( $item ); ?>" <?php selected( $level, $item ); ?>><?php echo esc_html( $item ); ?></option>
				<?php endforeach; ?>
			</select>
			<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-clear-logs"><?php esc_html_e( 'پاک کردن', 'balewoo' ); ?></button>
		</div>
	</header>

	<div class="balewoo-logs">
		<?php if ( empty( $logs ) ) : ?>
			<p class="balewoo-empty"><?php esc_html_e( 'لاگی ثبت نشده است.', 'balewoo' ); ?></p>
		<?php else : ?>
			<?php foreach ( $logs as $log ) : ?>
				<div class="balewoo-log-line balewoo-log-<?php echo esc_attr( $log->level ); ?>">
					<span class="balewoo-log-time">[<?php echo esc_html( gmdate( 'H:i:s', strtotime( $log->created_at ) ) ); ?>]</span>
					<span class="balewoo-log-message"><?php echo esc_html( $log->message ); ?></span>
					<?php if ( ! empty( $log->context ) ) : ?>
						<span class="balewoo-log-context"><?php echo esc_html( mb_substr( $log->context, 0, 300 ) ); ?></span>
					<?php endif; ?>
				</div>
			<?php endforeach; ?>
		<?php endif; ?>
	</div>
</section>
