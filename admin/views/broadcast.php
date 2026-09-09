<?php
/**
 * Bulk messaging view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

global $wpdb;

$history = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}balewoo_broadcasts ORDER BY id DESC LIMIT 20" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
$counts  = array(
	'all'      => count( BaleWoo_Transactions::audience( 'all' ) ),
	'bale'     => count( BaleWoo_Transactions::audience( 'bale' ) ),
	'telegram' => count( BaleWoo_Transactions::audience( 'telegram' ) ),
	'active30' => count( BaleWoo_Transactions::audience( 'active30' ) ),
);
?>
<div class="balewoo-grid balewoo-grid-2">
	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'ارسال پیام گروهی', 'balewoo' ); ?></h2>
		</header>

		<form class="balewoo-form balewoo-block-form" id="balewoo-broadcast-form" onsubmit="return false;">
			<label><?php esc_html_e( 'ارسال به', 'balewoo' ); ?>
				<select name="audience">
					<option value="all"><?php printf( esc_html__( 'همه کاربران (%d)', 'balewoo' ), (int) $counts['all'] ); ?></option>
					<option value="bale"><?php printf( esc_html__( 'کاربران بله (%d)', 'balewoo' ), (int) $counts['bale'] ); ?></option>
					<option value="telegram"><?php printf( esc_html__( 'کاربران تلگرام (%d)', 'balewoo' ), (int) $counts['telegram'] ); ?></option>
					<option value="active30"><?php printf( esc_html__( 'فعال در ۳۰ روز اخیر (%d)', 'balewoo' ), (int) $counts['active30'] ); ?></option>
				</select>
			</label>

			<label><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?>
				<select name="platform">
					<option value="bale"><?php esc_html_e( 'بله', 'balewoo' ); ?></option>
					<option value="telegram"><?php esc_html_e( 'تلگرام', 'balewoo' ); ?></option>
				</select>
			</label>

			<label><?php esc_html_e( 'زمان ارسال', 'balewoo' ); ?>
				<select name="when">
					<option value="now"><?php esc_html_e( 'فوری (هم‌اکنون)', 'balewoo' ); ?></option>
					<option value="scheduled"><?php esc_html_e( 'زمان‌بندی‌شده', 'balewoo' ); ?></option>
				</select>
			</label>

			<label><?php esc_html_e( 'عنوان پیام', 'balewoo' ); ?>
				<input type="text" name="title" placeholder="<?php esc_attr_e( 'مثل: تخفیف تابستانه', 'balewoo' ); ?>">
			</label>

			<label><?php esc_html_e( 'متن پیام', 'balewoo' ); ?>
				<textarea name="body" rows="6" placeholder="<?php esc_attr_e( 'متن پیام خود را بنویسید…', 'balewoo' ); ?>"></textarea>
			</label>

			<div class="balewoo-form-actions">
				<button type="button" class="balewoo-btn balewoo-btn-primary" id="balewoo-broadcast-send"><?php esc_html_e( 'ارسال', 'balewoo' ); ?></button>
				<button type="button" class="balewoo-btn balewoo-btn-ghost" id="balewoo-broadcast-test"><?php esc_html_e( 'ارسال تست', 'balewoo' ); ?></button>
				<span class="balewoo-muted" id="balewoo-broadcast-count"></span>
			</div>
		</form>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'پیش‌نمایش زنده', 'balewoo' ); ?></h2>
		</header>
		<div class="balewoo-phone">
			<div class="balewoo-phone-head">
				<span>💙</span>
				<div>
					<strong><?php echo esc_html( get_bloginfo( 'name' ) ); ?></strong>
					<small><?php esc_html_e( 'اکنون', 'balewoo' ); ?></small>
				</div>
			</div>
			<div class="balewoo-phone-body" id="balewoo-broadcast-preview">
				<b><?php esc_html_e( 'عنوان پیام اینجا…', 'balewoo' ); ?></b><br>
				<?php esc_html_e( 'متن پیام اینجا نمایش داده می‌شود…', 'balewoo' ); ?>
			</div>
		</div>
	</section>
</div>

<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'تاریخچه پیام‌های گروهی', 'balewoo' ); ?></h2>
	</header>
	<div class="balewoo-table-wrap">
		<table class="balewoo-table">
			<thead>
				<tr>
					<th><?php esc_html_e( 'عنوان', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'تعداد گیرنده', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'تاریخ', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'وضعیت', 'balewoo' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php if ( empty( $history ) ) : ?>
					<tr><td colspan="5" class="balewoo-empty"><?php esc_html_e( 'هنوز پیام گروهی ارسال نشده است.', 'balewoo' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $history as $item ) : ?>
						<tr>
							<td><?php echo esc_html( $item->title ); ?></td>
							<td><?php echo esc_html( number_format( (int) $item->recipients ) ); ?> (<?php echo esc_html( (int) $item->sent ); ?> ✓ / <?php echo esc_html( (int) $item->failed ); ?> ✗)</td>
							<td>
								<span class="balewoo-chip balewoo-chip-<?php echo esc_attr( $item->platform ); ?>">
									<?php echo esc_html( 'telegram' === $item->platform ? __( 'تلگرام', 'balewoo' ) : __( 'بله', 'balewoo' ) ); ?>
								</span>
							</td>
							<td><?php echo esc_html( BaleWoo_Templates::jdate( strtotime( $item->created_at ), 'Y/m/d' ) ); ?></td>
							<td><span class="balewoo-badge balewoo-badge-approved"><?php echo esc_html( 'failed' === $item->status ? __( 'ناموفق', 'balewoo' ) : __( 'ارسال شد', 'balewoo' ) ); ?></span></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</section>
