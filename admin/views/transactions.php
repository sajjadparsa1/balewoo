<?php
/**
 * Transactions view.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$filters = array(
	'status'   => isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : '',
	'platform' => isset( $_GET['platform'] ) ? sanitize_key( $_GET['platform'] ) : '',
	'from'     => isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '',
	'to'       => isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : '',
	'search'   => isset( $_GET['search'] ) ? sanitize_text_field( wp_unslash( $_GET['search'] ) ) : '',
	'paged'    => isset( $_GET['paged'] ) ? max( 1, absint( $_GET['paged'] ) ) : 1,
	'per_page' => 20,
);

$result = BaleWoo_Transactions::query( $filters );
$pages  = max( 1, (int) ceil( $result['total'] / $filters['per_page'] ) );

$export_url = wp_nonce_url(
	add_query_arg(
		array_merge(
			array( 'action' => 'balewoo_export_csv' ),
			array_filter(
				array(
					'status'   => $filters['status'],
					'platform' => $filters['platform'],
					'from'     => $filters['from'],
					'to'       => $filters['to'],
					'search'   => $filters['search'],
				)
			)
		),
		admin_url( 'admin-post.php' )
	),
	'balewoo_export'
);
?>
<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'فیلتر تراکنش‌ها', 'balewoo' ); ?></h2>
		<a class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" href="<?php echo esc_url( $export_url ); ?>"><?php esc_html_e( 'خروجی CSV', 'balewoo' ); ?></a>
	</header>

	<form class="balewoo-form balewoo-filter-form" id="balewoo-filter-form" onsubmit="return false;">
		<label><?php esc_html_e( 'از تاریخ', 'balewoo' ); ?>
			<input type="date" name="from" value="<?php echo esc_attr( $filters['from'] ); ?>">
		</label>
		<label><?php esc_html_e( 'تا تاریخ', 'balewoo' ); ?>
			<input type="date" name="to" value="<?php echo esc_attr( $filters['to'] ); ?>">
		</label>
		<label><?php esc_html_e( 'وضعیت', 'balewoo' ); ?>
			<select name="status">
				<option value=""><?php esc_html_e( 'همه', 'balewoo' ); ?></option>
				<?php foreach ( BaleWoo_Transactions::statuses() as $slug => $label ) : ?>
					<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $filters['status'], $slug ); ?>><?php echo esc_html( $label ); ?></option>
				<?php endforeach; ?>
			</select>
		</label>
		<label><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?>
			<select name="platform">
				<option value=""><?php esc_html_e( 'همه پلتفرم‌ها', 'balewoo' ); ?></option>
				<option value="bale" <?php selected( $filters['platform'], 'bale' ); ?>><?php esc_html_e( 'بله', 'balewoo' ); ?></option>
				<option value="telegram" <?php selected( $filters['platform'], 'telegram' ); ?>><?php esc_html_e( 'تلگرام', 'balewoo' ); ?></option>
				<option value="card" <?php selected( $filters['platform'], 'card' ); ?>><?php esc_html_e( 'کارت‌به‌کارت', 'balewoo' ); ?></option>
			</select>
		</label>
		<label><?php esc_html_e( 'جستجو', 'balewoo' ); ?>
			<input type="search" name="search" value="<?php echo esc_attr( $filters['search'] ); ?>" placeholder="<?php esc_attr_e( 'شماره سفارش، نام یا تلفن', 'balewoo' ); ?>">
		</label>
		<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm" id="balewoo-filter-apply"><?php esc_html_e( 'فیلتر', 'balewoo' ); ?></button>
		<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-filter-reset"><?php esc_html_e( 'پاک کردن', 'balewoo' ); ?></button>
	</form>
</section>

<section class="balewoo-card">
	<header class="balewoo-card-head">
		<h2><?php esc_html_e( 'لیست تراکنش‌ها', 'balewoo' ); ?></h2>
		<span class="balewoo-muted" id="balewoo-total-count"><?php echo esc_html( sprintf( __( '%d مورد', 'balewoo' ), (int) $result['total'] ) ); ?></span>
	</header>

	<div class="balewoo-table-wrap">
		<table class="balewoo-table">
			<thead>
				<tr>
					<th>#</th>
					<th><?php esc_html_e( 'سفارش', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'مشتری', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'تلفن', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'مبلغ', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'وضعیت', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'تاریخ', 'balewoo' ); ?></th>
					<th><?php esc_html_e( 'عملیات', 'balewoo' ); ?></th>
				</tr>
			</thead>
			<tbody id="balewoo-transactions-body">
				<?php BaleWoo_Admin::transactions_rows( $result['items'] ); ?>
			</tbody>
		</table>
	</div>

	<div class="balewoo-pagination">
		<button class="button" id="balewoo-prev" data-page="<?php echo esc_attr( (int) $filters['paged'] - 1 ); ?>" <?php disabled( $filters['paged'] <= 1 ); ?>><?php esc_html_e( 'قبلی', 'balewoo' ); ?></button>
		<span class="balewoo-muted">
			<?php
			printf(
				/* translators: 1: current page, 2: total pages */
				esc_html__( 'صفحه %1$s از %2$s', 'balewoo' ),
				esc_html( (string) $filters['paged'] ),
				esc_html( (string) $pages )
			);
			?>
		</span>
		<button class="button" id="balewoo-next" data-page="<?php echo esc_attr( (int) $filters['paged'] + 1 ); ?>" <?php disabled( $filters['paged'] >= $pages ); ?>><?php esc_html_e( 'بعدی', 'balewoo' ); ?></button>
		<input type="hidden" id="balewoo-current-page" value="<?php echo esc_attr( (int) $filters['paged'] ); ?>">
		<input type="hidden" id="balewoo-total-pages" value="<?php echo esc_attr( $pages ); ?>">
	</div>
</section>
