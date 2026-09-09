<?php
/**
 * Reports view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$stats = BaleWoo_Transactions::stats();
$days  = array(
	'saturday'  => __( 'شنبه', 'balewoo' ),
	'sunday'    => __( 'یکشنبه', 'balewoo' ),
	'monday'    => __( 'دوشنبه', 'balewoo' ),
	'tuesday'   => __( 'سه‌شنبه', 'balewoo' ),
	'wednesday' => __( 'چهارشنبه', 'balewoo' ),
	'thursday'  => __( 'پنجشنبه', 'balewoo' ),
	'friday'    => __( 'جمعه', 'balewoo' ),
);

$preview = BaleWoo_Notifier::report_text( 1 );
?>
<div class="balewoo-grid balewoo-grid-2">
	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'تنظیمات گزارش خودکار', 'balewoo' ); ?></h2>
		</header>

		<form class="balewoo-form balewoo-block-form balewoo-settings-form" onsubmit="return false;">
			<label><?php esc_html_e( 'نوع گزارش', 'balewoo' ); ?>
				<select name="settings[report_type]">
					<option value="none" <?php selected( BaleWoo_Settings::get( 'report_type' ), 'none' ); ?>><?php esc_html_e( 'غیرفعال', 'balewoo' ); ?></option>
					<option value="daily" <?php selected( BaleWoo_Settings::get( 'report_type' ), 'daily' ); ?>><?php esc_html_e( 'روزانه', 'balewoo' ); ?></option>
					<option value="weekly" <?php selected( BaleWoo_Settings::get( 'report_type' ), 'weekly' ); ?>><?php esc_html_e( 'هفتگی', 'balewoo' ); ?></option>
				</select>
			</label>

			<label><?php esc_html_e( 'ساعت ارسال', 'balewoo' ); ?>
				<input type="time" name="settings[report_time]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'report_time' ) ); ?>">
			</label>

			<label><?php esc_html_e( 'روز ارسال (هفتگی)', 'balewoo' ); ?>
				<select name="settings[report_day]">
					<?php foreach ( $days as $key => $label ) : ?>
						<option value="<?php echo esc_attr( $key ); ?>" <?php selected( BaleWoo_Settings::get( 'report_day' ), $key ); ?>><?php echo esc_html( $label ); ?></option>
					<?php endforeach; ?>
				</select>
			</label>

			<label><?php esc_html_e( 'ارسال از طریق', 'balewoo' ); ?>
				<select name="settings[report_via]">
					<option value="bale" <?php selected( BaleWoo_Settings::get( 'report_via' ), 'bale' ); ?>><?php esc_html_e( 'بله', 'balewoo' ); ?></option>
					<option value="telegram" <?php selected( BaleWoo_Settings::get( 'report_via' ), 'telegram' ); ?>><?php esc_html_e( 'تلگرام', 'balewoo' ); ?></option>
					<option value="both" <?php selected( BaleWoo_Settings::get( 'report_via' ), 'both' ); ?>><?php esc_html_e( 'هر دو', 'balewoo' ); ?></option>
				</select>
			</label>

			<div class="balewoo-form-actions">
				<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm balewoo-save-settings"><?php esc_html_e( 'ذخیره تنظیمات', 'balewoo' ); ?></button>
				<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-send-report" data-days="1"><?php esc_html_e( 'ارسال تست', 'balewoo' ); ?></button>
				<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-send-report-weekly" data-days="7"><?php esc_html_e( 'ارسال گزارش هفتگی', 'balewoo' ); ?></button>
			</div>
		</form>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'پیش‌نمایش گزارش', 'balewoo' ); ?></h2>
		</header>
		<div class="balewoo-phone">
			<div class="balewoo-phone-head">
				<span>📊</span>
				<div>
					<strong><?php esc_html_e( 'گزارش فروش', 'balewoo' ); ?></strong>
					<small><?php echo esc_html( BaleWoo_Templates::jdate( time(), 'Y/m/d H:i' ) ); ?></small>
				</div>
			</div>
			<div class="balewoo-phone-body balewoo-mono"><?php echo nl2br( esc_html( $preview ) ); ?></div>
		</div>
	</section>
</div>

<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'فروش ۷ روز اخیر', 'balewoo' ); ?></h2>
	</header>
	<div class="balewoo-chart">
		<?php
		$max = 1;
		foreach ( $stats['chart'] as $point ) {
			$max = max( $max, (int) $point['amount'] );
		}
		foreach ( $stats['chart'] as $point ) :
			$height = (int) round( ( $point['amount'] / $max ) * 100 );
			?>
			<div class="balewoo-bar-wrap">
				<div class="balewoo-bar" style="height:<?php echo esc_attr( max( 4, $height ) ); ?>%" title="<?php echo esc_attr( number_format( $point['amount'] ) ); ?>"></div>
				<span class="balewoo-bar-label"><?php echo esc_html( $point['label'] ); ?></span>
				<span class="balewoo-bar-value"><?php echo esc_html( BaleWoo_Templates::digits( number_format( (int) $point['amount'] ) ) ); ?></span>
			</div>
		<?php endforeach; ?>
	</div>
</section>
