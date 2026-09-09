<?php
/**
 * Dashboard view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$stats = BaleWoo_Transactions::stats();
$latest = BaleWoo_Transactions::query( array( 'per_page' => 5 ) );

$chart   = $stats['chart'];
$max     = 1;
foreach ( $chart as $point ) {
	$max = max( $max, (int) $point['amount'] );
}

$status_meta = array(
	'approved' => array( 'label' => __( 'تأیید شده', 'balewoo' ), 'color' => '#22c55e' ),
	'pending'  => array( 'label' => __( 'در انتظار', 'balewoo' ), 'color' => '#f59e0b' ),
	'rejected' => array( 'label' => __( 'رد شده', 'balewoo' ), 'color' => '#ef4444' ),
	'refunded' => array( 'label' => __( 'بازگشت خورده', 'balewoo' ), 'color' => '#8b5cf6' ),
	'expired'  => array( 'label' => __( 'منقضی شده', 'balewoo' ), 'color' => '#94a3b8' ),
);

$total_status = max( 1, array_sum( $stats['status_counts'] ) );

// مشتری آخر (برای باکس «تعیین مدیر»).
$last_customer = ! empty( $latest['items'] ) ? $latest['items'][0] : null;
?>
<div class="balewoo-stats">
	<div class="balewoo-stat-card">
		<span class="balewoo-stat-label"><?php esc_html_e( 'سفارش امروز', 'balewoo' ); ?></span>
		<strong class="balewoo-stat-value"><?php echo esc_html( BaleWoo_Templates::digits( number_format( $stats['today_orders'] ) ) ); ?></strong>
		<span class="balewoo-stat-trend is-up"><?php esc_html_e( 'نسبت به دیروز', 'balewoo' ); ?></span>
	</div>
	<div class="balewoo-stat-card">
		<span class="balewoo-stat-label"><?php esc_html_e( 'تأیید شده', 'balewoo' ); ?></span>
		<strong class="balewoo-stat-value"><?php echo esc_html( BaleWoo_Templates::digits( number_format( $stats['approved'] ) ) ); ?></strong>
		<span class="balewoo-stat-trend is-up"><?php esc_html_e( 'امروز', 'balewoo' ); ?></span>
	</div>
	<div class="balewoo-stat-card">
		<span class="balewoo-stat-label"><?php esc_html_e( 'در انتظار', 'balewoo' ); ?></span>
		<strong class="balewoo-stat-value"><?php echo esc_html( BaleWoo_Templates::digits( number_format( $stats['pending'] ) ) ); ?></strong>
		<span class="balewoo-stat-trend is-down"><?php esc_html_e( 'نیاز به بررسی', 'balewoo' ); ?></span>
	</div>
	<div class="balewoo-stat-card">
		<span class="balewoo-stat-label"><?php esc_html_e( 'فروش امروز (تومان)', 'balewoo' ); ?></span>
		<strong class="balewoo-stat-value"><?php echo esc_html( BaleWoo_Templates::digits( number_format( $stats['sales_today'] ) ) ); ?></strong>
		<span class="balewoo-stat-trend is-up"><?php esc_html_e( 'تأیید شده', 'balewoo' ); ?></span>
	</div>
</div>

<div class="balewoo-grid balewoo-grid-2">
	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'فروش ۷ روز اخیر', 'balewoo' ); ?></h2>
		</header>
		<div class="balewoo-chart">
			<?php foreach ( $chart as $point ) : ?>
				<?php $height = (int) round( ( $point['amount'] / $max ) * 100 ); ?>
				<div class="balewoo-bar-wrap">
					<div class="balewoo-bar" style="height:<?php echo esc_attr( max( 4, $height ) ); ?>%" title="<?php echo esc_attr( number_format( $point['amount'] ) ); ?>"></div>
					<span class="balewoo-bar-label"><?php echo esc_html( $point['label'] ); ?></span>
				</div>
			<?php endforeach; ?>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'وضعیت سفارشات', 'balewoo' ); ?></h2>
		</header>
		<div class="balewoo-donut-wrap">
			<svg viewBox="0 0 42 42" class="balewoo-donut" role="img" aria-label="<?php esc_attr_e( 'نمودار وضعیت سفارشات', 'balewoo' ); ?>">
				<?php
				$offset = 25;
				foreach ( $status_meta as $slug => $meta ) :
					$count = (int) $stats['status_counts'][ $slug ];
					if ( ! $count ) {
						continue;
					}
					$length = ( $count / $total_status ) * 100;
					?>
					<circle class="balewoo-donut-seg" cx="21" cy="21" r="15.91549431" fill="none"
						stroke="<?php echo esc_attr( $meta['color'] ); ?>" stroke-width="6"
						stroke-dasharray="<?php echo esc_attr( $length ); ?> <?php echo esc_attr( 100 - $length ); ?>"
						stroke-dashoffset="<?php echo esc_attr( $offset ); ?>"></circle>
					<?php
					$offset -= $length;
				endforeach;
				?>
			</svg>
			<ul class="balewoo-legend">
				<?php foreach ( $status_meta as $slug => $meta ) : ?>
					<li>
						<span class="balewoo-legend-dot" style="background:<?php echo esc_attr( $meta['color'] ); ?>"></span>
						<?php echo esc_html( $meta['label'] ); ?>
						<strong><?php echo esc_html( BaleWoo_Templates::digits( number_format( (int) $stats['status_counts'][ $slug ] ) ) ); ?></strong>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
	</section>
</div>

<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'آخرین تراکنش‌ها', 'balewoo' ); ?></h2>
		<a class="balewoo-link" href="<?php echo esc_url( admin_url( 'admin.php?page=balewoo-transactions' ) ); ?>"><?php esc_html_e( 'مشاهده همه', 'balewoo' ); ?></a>
	</header>
	<div class="balewoo-table-wrap">
		<table class="balewoo-table">
			<thead>
				<tr>
					<th>#</th>
					<th><?php esc_html_e( 'سفارش', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'مشتری', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'مبلغ', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'وضعیت', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'تاریخ', 'balewoo' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php if ( empty( $latest['items'] ) ) : ?>
					<tr><td colspan="7" class="balewoo-empty"><?php esc_html_e( 'هنوز تراکنشی ثبت نشده است.', 'balewoo' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $latest['items'] as $row ) : ?>
						<tr>
							<td><?php echo esc_html( $row->id ); ?></td>
							<td><a href="<?php echo esc_url( admin_url( 'post.php?post=' . (int) $row->order_id . '&action=edit' ) ); ?>">#<?php echo esc_html( $row->order_id ); ?></a></td>
							<td><?php echo esc_html( $row->customer_name ); ?></td>
							<td><?php echo esc_html( number_format( (float) $row->amount ) ); ?></td>
							<td>
								<span class="balewoo-chip balewoo-chip-<?php echo esc_attr( $row->platform ); ?>">
									<?php echo esc_html( 'telegram' === $row->platform ? __( 'تلگرام', 'balewoo' ) : ( 'card' === $row->platform ? __( 'کارت‌به‌کارت', 'balewoo' ) : __( 'بله', 'balewoo' ) ) ); ?>
								</span>
							</td>
							<td><span class="balewoo-badge balewoo-badge-<?php echo esc_attr( $row->status ); ?>"><?php echo esc_html( BaleWoo_Transactions::status_label( $row->status ) ); ?></span></td>
							<td><?php echo esc_html( BaleWoo_Templates::jdate( strtotime( $row->created_at ), 'Y/m/d' ) ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</section>

<div class="balewoo-grid balewoo-grid-2">
	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'مدیر اعلان‌ها', 'balewoo' ); ?></h2>
			<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-set-manager"><?php esc_html_e( 'تعیین مدیر', 'balewoo' ); ?></button>
		</header>
		<div class="balewoo-manager">
			<?php if ( $last_customer ) : ?>
				<div class="balewoo-avatar"><?php echo esc_html( mb_substr( $last_customer->customer_name, 0, 1 ) ); ?></div>
				<div>
					<strong><?php echo esc_html( $last_customer->customer_name ); ?></strong>
					<p class="balewoo-muted">
						<?php echo esc_html( 'telegram' === $last_customer->platform ? __( 'تلگرام', 'balewoo' ) : __( 'بله', 'balewoo' ) ); ?>
						· chat_id: <code><?php echo esc_html( $last_customer->chat_id ); ?></code>
					</p>
				</div>
			<?php else : ?>
				<p class="balewoo-muted"><?php esc_html_e( 'هنوز کاربری ثبت نشده است.', 'balewoo' ); ?></p>
			<?php endif; ?>
		</div>

		<form class="balewoo-form balewoo-manager-form" onsubmit="return false;">
			<label><?php esc_html_e( 'آیدی مدیر بله', 'balewoo' ); ?>
				<input type="text" name="bale_admin_chat_id" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_admin_chat_id' ) ); ?>" placeholder="123456789">
			</label>
			<label><?php esc_html_e( 'آیدی مدیر تلگرام', 'balewoo' ); ?>
				<input type="text" name="telegram_admin_chat_id" value="<?php echo esc_attr( BaleWoo_Settings::get( 'telegram_admin_chat_id' ) ); ?>" placeholder="123456789">
			</label>
			<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm" id="balewoo-save-manager"><?php esc_html_e( 'ذخیره', 'balewoo' ); ?></button>
		</form>
	</section>

	<?php if ( BaleWoo_Settings::is_on( 'enable_scenarios' ) ) : ?>
	<section class="balewoo-card balewoo-scenario">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'شبیه‌ساز سناریو', 'balewoo' ); ?></h2>
			<span class="balewoo-muted balewoo-scenario-status" id="balewoo-scenario-status"></span>
		</header>
		<div class="balewoo-scenario-actions">
			<button class="button" data-scenario="new_order"><?php esc_html_e( 'ثبت سفارش', 'balewoo' ); ?></button>
			<button class="button" data-scenario="receipt"><?php esc_html_e( 'آپلود رسید', 'balewoo' ); ?></button>
			<button class="button" data-scenario="approve"><?php esc_html_e( 'تأیید مدیر', 'balewoo' ); ?></button>
			<button class="button" data-scenario="reject"><?php esc_html_e( 'رد مدیر', 'balewoo' ); ?></button>
			<button class="button" data-scenario="undo"><?php esc_html_e( 'بازگشت Undo', 'balewoo' ); ?></button>
			<button class="button" data-scenario="refund"><?php esc_html_e( 'بازگشت وجه', 'balewoo' ); ?></button>
			<button class="button button-primary" data-scenario="full"><?php esc_html_e( 'سناریوی کامل', 'balewoo' ); ?></button>
			<button class="button" data-scenario="reset"><?php esc_html_e( 'ریست', 'balewoo' ); ?></button>
		</div>
		<div class="balewoo-chats">
			<div class="balewoo-chat">
				<header><?php esc_html_e( 'چت مشتری', 'balewoo' ); ?> · <span><?php esc_html_e( 'بله', 'balewoo' ); ?></span></header>
				<div class="balewoo-chat-body" id="balewoo-chat-customer">
					<p class="balewoo-muted"><?php esc_html_e( 'روی یکی از سناریوها کلیک کنید', 'balewoo' ); ?></p>
				</div>
			</div>
			<div class="balewoo-chat">
				<header><?php esc_html_e( 'چت مدیر', 'balewoo' ); ?> · <span><?php esc_html_e( 'پنل تأیید', 'balewoo' ); ?></span></header>
				<div class="balewoo-chat-body" id="balewoo-chat-admin">
					<p class="balewoo-muted"><?php esc_html_e( 'پیام‌های مدیر اینجا نمایش داده می‌شود', 'balewoo' ); ?></p>
				</div>
			</div>
		</div>
	</section>
	<?php endif; ?>
</div>
