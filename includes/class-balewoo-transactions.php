<?php
/**
 * Transactions storage, queries and stats.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Transactions' ) ) {

	/**
	 * CRUD for the balewoo_transactions table.
	 */
	class BaleWoo_Transactions {

		/**
		 * Human readable statuses.
		 *
		 * @return array
		 */
		public static function statuses() {
			return array(
				'pending'  => __( 'در انتظار', 'balewoo' ),
				'approved' => __( 'تأیید شده', 'balewoo' ),
				'rejected' => __( 'رد شده', 'balewoo' ),
				'refunded' => __( 'بازگشت خورده', 'balewoo' ),
				'expired'  => __( 'منقضی شده', 'balewoo' ),
			);
		}

		/**
		 * Status label.
		 *
		 * @param string $status Status slug.
		 * @return string
		 */
		public static function status_label( $status ) {
			$all = self::statuses();
			return isset( $all[ $status ] ) ? $all[ $status ] : $status;
		}

		/**
		 * Insert or update the transaction row of an order.
		 *
		 * @param int   $order_id Order id.
		 * @param array $data     Row data.
		 * @return int|false
		 */
		public static function upsert( $order_id, $data = array() ) {
			global $wpdb;

			$table   = $wpdb->prefix . 'balewoo_transactions';
			$order   = wc_get_order( $order_id );
			$now     = current_time( 'mysql', 1 );
			$default = array(
				'order_id'      => $order_id,
				'user_id'       => $order ? (int) $order->get_user_id() : 0,
				'chat_id'       => $order ? (string) $order->get_meta( '_balewoo_chat_id', true ) : '',
				'customer_name' => $order ? trim( $order->get_formatted_billing_full_name() ) : '',
				'phone'         => $order ? (string) $order->get_billing_phone() : '',
				'amount'        => $order ? (int) round( (float) $order->get_total() ) : 0,
				'currency'      => $order ? $order->get_currency() : get_woocommerce_currency(),
				'method'        => $order ? (string) $order->get_payment_method() : 'balewoo',
				'platform'      => $order ? (string) $order->get_meta( '_balewoo_platform', true ) : 'bale',
				'status'        => 'pending',
				'tracking_code' => '',
				'receipt_url'   => '',
				'payload'       => '',
				'note'          => '',
				'updated_at'    => $now,
			);

			$data = wp_parse_args( $data, $default );

			$existing = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE order_id = %d", $order_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

			if ( $existing ) {
				$wpdb->update( $table, $data, array( 'id' => $existing ) );
				return (int) $existing;
			}

			$data['created_at'] = $now;
			$wpdb->insert( $table, $data );

			return $wpdb->insert_id ? (int) $wpdb->insert_id : false;
		}

		/**
		 * Update the status of an order transaction.
		 *
		 * @param int    $order_id Order id.
		 * @param string $status   New status.
		 * @param array  $extra    Extra columns.
		 * @return void
		 */
		public static function set_status( $order_id, $status, $extra = array() ) {
			self::upsert(
				$order_id,
				wp_parse_args(
					$extra,
					array(
						'status'     => $status,
						'updated_at' => current_time( 'mysql', 1 ),
					)
				)
			);
		}

		/**
		 * Get the transaction row for an order.
		 *
		 * @param int $order_id Order id.
		 * @return object|null
		 */
		public static function get_by_order( $order_id ) {
			global $wpdb;
			return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}balewoo_transactions WHERE order_id = %d", $order_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		/**
		 * Query transactions with filters.
		 *
		 * @param array $args Query args: status, platform, from, to, search, per_page, page, orderby, order.
		 * @return array { items: array, total: int }
		 */
		public static function query( $args = array() ) {
			global $wpdb;

			$table = $wpdb->prefix . 'balewoo_transactions';
			$args  = wp_parse_args(
				$args,
				array(
					'status'   => '',
					'platform' => '',
					'from'     => '',
					'to'       => '',
					'search'   => '',
					'per_page' => 20,
					'page'     => 1,
					'orderby'  => 'id',
					'order'    => 'DESC',
				)
			);

			$where  = array( '1=1' );
			$params = array();

			if ( $args['status'] ) {
				$where[]  = 'status = %s';
				$params[] = $args['status'];
			}
			if ( $args['platform'] ) {
				$where[]  = 'platform = %s';
				$params[] = $args['platform'];
			}
			if ( $args['from'] ) {
				$bounds   = self::day_bounds_gmt( sanitize_text_field( $args['from'] ) );
				$where[]  = 'created_at >= %s';
				$params[] = $bounds['start'];
			}
			if ( $args['to'] ) {
				$bounds   = self::day_bounds_gmt( sanitize_text_field( $args['to'] ) );
				$where[]  = 'created_at <= %s';
				$params[] = $bounds['end'];
			}
			if ( $args['search'] ) {
				$like     = '%' . $wpdb->esc_like( sanitize_text_field( $args['search'] ) ) . '%';
				$where[]  = '(order_id LIKE %s OR customer_name LIKE %s OR phone LIKE %s OR tracking_code LIKE %s)';
				$params[] = $like;
				$params[] = $like;
				$params[] = $like;
				$params[] = $like;
			}

			$where_sql = implode( ' AND ', $where );
			$orderby   = in_array( $args['orderby'], array( 'id', 'order_id', 'amount', 'created_at', 'status' ), true ) ? $args['orderby'] : 'id';
			$order     = 'ASC' === strtoupper( $args['order'] ) ? 'ASC' : 'DESC';
			$per_page  = max( 1, (int) $args['per_page'] );
			$offset    = max( 0, ( (int) $args['page'] - 1 ) * $per_page );

			$total = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", $params ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

			$sql     = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d";
			$params[] = $per_page;
			$params[] = $offset;
			$items   = $wpdb->get_results( $wpdb->prepare( $sql, $params ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

			return array(
				'items' => $items,
				'total' => $total,
			);
		}

		/**
		 * Start and end of a site-local day, expressed in GMT (how rows are stored).
		 *
		 * @param string $date_ymd Local date in Y-m-d format.
		 * @return array { start, end }
		 */
		public static function day_bounds_gmt( $date_ymd ) {
			$offset = (int) round( (float) get_option( 'gmt_offset' ) * 3600 );
			$start  = gmdate( 'Y-m-d H:i:s', strtotime( $date_ymd . ' 00:00:00' ) - $offset );
			$end    = gmdate( 'Y-m-d H:i:s', strtotime( $date_ymd . ' 23:59:59' ) - $offset );

			return array(
				'start' => $start,
				'end'   => $end,
			);
		}

		/**
		 * Today's date in the site timezone.
		 *
		 * @return string Y-m-d
		 */
		public static function local_today() {
			$offset = (int) round( (float) get_option( 'gmt_offset' ) * 3600 );
			return gmdate( 'Y-m-d', time() + $offset );
		}

		/**
		 * Sum of approved sales within a local day.
		 *
		 * @param string $date_ymd Local date (Y-m-d).
		 * @return int
		 */
		public static function sales_of_day( $date_ymd ) {
			global $wpdb;

			$bounds = self::day_bounds_gmt( $date_ymd );
			$table  = $wpdb->prefix . 'balewoo_transactions';

			return (int) $wpdb->get_var(
				$wpdb->prepare(
					"SELECT COALESCE(SUM(amount),0) FROM {$table} WHERE status = %s AND created_at >= %s AND created_at <= %s",
					'approved',
					$bounds['start'],
					$bounds['end']
				)
			); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		/**
		 * Dashboard statistics.
		 *
		 * @return array
		 */
		public static function stats() {
			global $wpdb;

			$table  = $wpdb->prefix . 'balewoo_transactions';
			$today  = self::local_today();
			$bounds = self::day_bounds_gmt( $today );

			$today_sql = $wpdb->prepare( 'created_at >= %s AND created_at <= %s', $bounds['start'], $bounds['end'] );

			$today_orders = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE {$today_sql}" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$approved     = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'approved' AND {$today_sql}" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$sales_today  = (int) $wpdb->get_var( "SELECT COALESCE(SUM(amount),0) FROM {$table} WHERE status = 'approved' AND {$today_sql}" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$pending      = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE status = %s", 'pending' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

			// ۷ روز اخیر (بر اساس تاریخ محلی سایت).
			$chart = array();
			for ( $i = 6; $i >= 0; $i-- ) {
				$date   = gmdate( 'Y-m-d', strtotime( $today ) - ( $i * DAY_IN_SECONDS ) );
				$chart[] = array(
					'date'   => $date,
					'label'  => BaleWoo_Templates::jdate( strtotime( $date ), 'l' ),
					'amount' => self::sales_of_day( $date ),
				);
			}

			$status_counts = array();
			foreach ( array_keys( self::statuses() ) as $slug ) {
				$status_counts[ $slug ] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE status = %s", $slug ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			}

			return array(
				'today_orders'  => $today_orders,
				'approved'      => $approved,
				'pending'       => $pending,
				'sales_today'   => $sales_today,
				'chart'         => $chart,
				'status_counts' => $status_counts,
				'total'         => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ), // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			);
		}

		/**
		 * Chat ids grouped by platform, for broadcasting.
		 *
		 * @param string $audience all|bale|telegram|active30.
		 * @return array of {chat_id, platform, name}
		 */
		public static function audience( $audience = 'all' ) {
			global $wpdb;

			$table   = $wpdb->prefix . 'balewoo_transactions';
			$where   = array( "chat_id <> ''" );
			$params  = array();

			if ( 'bale' === $audience || 'telegram' === $audience ) {
				$where[]  = 'platform = %s';
				$params[] = $audience;
			}
			if ( 'active30' === $audience ) {
				$where[]  = 'created_at >= %s';
				$params[] = gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS );
			}

			$where_sql = implode( ' AND ', $where );
			$sql       = "SELECT DISTINCT chat_id, platform, customer_name, phone FROM {$table} WHERE {$where_sql} ORDER BY id DESC LIMIT 2000";

			return $wpdb->get_results( $wpdb->prepare( $sql, $params ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		}

		/**
		 * Export filtered rows as CSV (echoes and exits).
		 *
		 * @param array $args Query args.
		 * @return void
		 */
		public static function export_csv( $args = array() ) {
			$args['per_page'] = 5000;
			$args['page']     = 1;
			$result           = self::query( $args );

			$filename = 'balewoo-transactions-' . gmdate( 'Y-m-d-His' ) . '.csv';

			header( 'Content-Type: text/csv; charset=UTF-8' );
			header( 'Content-Disposition: attachment; filename=' . $filename );
			header( 'Pragma: no-cache' );
			header( 'Expires: 0' );

			$handle = fopen( 'php://output', 'w' );
			fprintf( $handle, chr( 0xEF ) . chr( 0xBB ) . chr( 0xBF ) ); // BOM for Excel (فارسی).
			fputcsv(
				$handle,
				array( 'ID', 'Order', 'Customer', 'Phone', 'Amount', 'Platform', 'Method', 'Status', 'Tracking', 'Date' )
			);

			foreach ( $result['items'] as $row ) {
				fputcsv(
					$handle,
					array(
						$row->id,
						'#' . $row->order_id,
						$row->customer_name,
						$row->phone,
						$row->amount,
						$row->platform,
						$row->method,
						self::status_label( $row->status ),
						$row->tracking_code,
						$row->created_at,
					)
				);
			}

			fclose( $handle );
			exit;
		}
	}
}
