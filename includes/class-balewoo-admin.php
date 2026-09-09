<?php
/**
 * Admin menus, screens and AJAX handlers.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Admin' ) ) {

	/**
	 * Admin screens controller.
	 */
	class BaleWoo_Admin {

		/**
		 * Current page slug.
		 *
		 * @var string
		 */
		public static $page = '';

		/**
		 * Bootstrap admin.
		 *
		 * @return void
		 */
		public static function init() {
			add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
			add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
			add_filter( 'plugin_action_links_' . BALEWOO_BASENAME, array( __CLASS__, 'action_links' ) );

			// فرم‌ها و اکشن‌های ایجکس.
			$ajax = array(
				'balewoo_save_settings'    => 'ajax_save_settings',
				'balewoo_test_connection'  => 'ajax_test_connection',
				'balewoo_test_message'     => 'ajax_test_message',
				'balewoo_set_webhook'      => 'ajax_set_webhook',
				'balewoo_webhook_test'     => 'ajax_webhook_test',
				'balewoo_send_broadcast'   => 'ajax_send_broadcast',
				'balewoo_broadcast_preview' => 'ajax_broadcast_preview',
				'balewoo_order_action'     => 'ajax_order_action',
				'balewoo_clear_logs'       => 'ajax_clear_logs',
				'balewoo_transactions'     => 'ajax_transactions',
				'balewoo_scenario'         => 'ajax_scenario',
				'balewoo_set_manager'      => 'ajax_set_manager',
				'balewoo_send_report'      => 'ajax_send_report',
				'balewoo_dismiss_notice'   => 'ajax_dismiss_notice',
			);

			foreach ( $ajax as $action => $method ) {
				add_action( 'wp_ajax_' . $action, array( __CLASS__, $method ) );
			}

			add_action( 'admin_post_balewoo_export_csv', array( __CLASS__, 'export_csv' ) );
			add_action( 'admin_notices', array( __CLASS__, 'notices' ) );
		}

		/* ------------------------------------------------------------------ */
		/* Menu                                                                */
		/* ------------------------------------------------------------------ */

		/**
		 * Add the admin menus.
		 *
		 * @return void
		 */
		public static function menu() {
			$cap = 'manage_balewoo';

			add_menu_page(
				__( 'بله‌وو', 'balewoo' ),
				__( 'بله‌وو', 'balewoo' ),
				$cap,
				'balewoo',
				array( __CLASS__, 'page_dashboard' ),
				'data:image/svg+xml;base64,' . base64_encode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0d6efd"/><path d="M7 8h7a3.5 3.5 0 0 1 0 7H9l4 4v-2.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
				56
			);

			add_submenu_page( 'balewoo', __( 'داشبورد', 'balewoo' ), __( 'داشبورد', 'balewoo' ), $cap, 'balewoo', array( __CLASS__, 'page_dashboard' ) );
			add_submenu_page( 'balewoo', __( 'تراکنش‌ها', 'balewoo' ), __( 'تراکنش‌ها', 'balewoo' ), $cap, 'balewoo-transactions', array( __CLASS__, 'page_transactions' ) );
			add_submenu_page( 'balewoo', __( 'ارسال گروهی', 'balewoo' ), __( 'ارسال گروهی', 'balewoo' ), $cap, 'balewoo-broadcast', array( __CLASS__, 'page_broadcast' ) );
			add_submenu_page( 'balewoo', __( 'گزارشات', 'balewoo' ), __( 'گزارشات', 'balewoo' ), $cap, 'balewoo-reports', array( __CLASS__, 'page_reports' ) );
			add_submenu_page( 'balewoo', __( 'تنظیمات', 'balewoo' ), __( 'تنظیمات', 'balewoo' ), $cap, 'balewoo-settings', array( __CLASS__, 'page_settings' ) );
			add_submenu_page( 'balewoo', __( 'لاگ‌های سیستم', 'balewoo' ), __( 'لاگ‌های سیستم', 'balewoo' ), $cap, 'balewoo-logs', array( __CLASS__, 'page_logs' ) );
			add_submenu_page( 'balewoo', __( 'درباره بله‌وو', 'balewoo' ), __( 'درباره', 'balewoo' ), $cap, 'balewoo-about', array( __CLASS__, 'page_about' ) );
		}

		/**
		 * Quick links on the plugins screen.
		 *
		 * @param array $links Links.
		 * @return array
		 */
		public static function action_links( $links ) {
			$settings = '<a href="' . esc_url( admin_url( 'admin.php?page=balewoo-settings' ) ) . '">' . esc_html__( 'تنظیمات', 'balewoo' ) . '</a>';
			array_unshift( $links, $settings );
			return $links;
		}

		/* ------------------------------------------------------------------ */
		/* Assets                                                              */
		/* ------------------------------------------------------------------ */

		/**
		 * Enqueue admin styles and scripts.
		 *
		 * @param string $hook Current screen hook.
		 * @return void
		 */
		public static function assets( $hook ) {
			if ( false === strpos( $hook, 'balewoo' ) && 'post.php' !== $hook && 'post-new.php' !== $hook ) {
				return;
			}

			wp_enqueue_style( 'balewoo-admin', BALEWOO_URL . 'admin/css/balewoo-admin.css', array(), BALEWOO_VERSION );
			wp_enqueue_script( 'balewoo-admin', BALEWOO_URL . 'admin/js/balewoo-admin.js', array( 'jquery' ), BALEWOO_VERSION, true );

			wp_localize_script(
				'balewoo-admin',
				'balewooAdmin',
				array(
					'ajax'  => admin_url( 'admin-ajax.php' ),
					'nonce' => wp_create_nonce( 'balewoo_admin' ),
					'i18n'  => array(
						'saved'   => __( 'تنظیمات ذخیره شد ✓', 'balewoo' ),
						'error'   => __( 'خطا رخ داد. دوباره تلاش کنید.', 'balewoo' ),
						'confirm' => __( 'آیا مطمئن هستید؟', 'balewoo' ),
						'copied'  => __( 'کپی شد ✓', 'balewoo' ),
						'testing' => __( 'در حال تست…', 'balewoo' ),
						'sending' => __( 'در حال ارسال…', 'balewoo' ),
					),
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* Page wrappers                                                       */
		/* ------------------------------------------------------------------ */

		/**
		 * Render a page with the plugin shell.
		 *
		 * @param string $view View file (without extension).
		 * @return void
		 */
		public static function render( $view ) {
			self::$page = $view;
			include BALEWOO_DIR . 'admin/views/header.php';
			include BALEWOO_DIR . 'admin/views/' . $view . '.php';
			include BALEWOO_DIR . 'admin/views/footer.php';
		}

		public static function page_dashboard() {
			self::render( 'dashboard' );
		}
		public static function page_transactions() {
			self::render( 'transactions' );
		}
		public static function page_broadcast() {
			self::render( 'broadcast' );
		}
		public static function page_reports() {
			self::render( 'reports' );
		}
		public static function page_settings() {
			self::render( 'settings' );
		}
		public static function page_logs() {
			self::render( 'logs' );
		}
		public static function page_about() {
			self::render( 'about' );
		}

		/* ------------------------------------------------------------------ */
		/* Notices                                                             */
		/* ------------------------------------------------------------------ */

		/**
		 * Setup checklist notice.
		 *
		 * @return void
		 */
		public static function notices() {
			if ( ! current_user_can( 'manage_balewoo' ) || get_transient( 'balewoo_notice_dismissed' ) ) {
				return;
			}

			if ( ! isset( $_GET['page'] ) || false === strpos( sanitize_text_field( wp_unslash( $_GET['page'] ) ), 'balewoo' ) ) {
				return;
			}

			$missing = array();

			if ( ! BaleWoo_Settings::get( 'bale_token' ) ) {
				$missing[] = __( 'توکن ربات بله', 'balewoo' );
			}
			if ( ! BaleWoo_Settings::get( 'bale_admin_chat_id' ) ) {
				$missing[] = __( 'آیدی مدیر بله', 'balewoo' );
			}
			if ( empty( BaleWoo_Settings::cards() ) ) {
				$missing[] = __( 'حداقل یک شماره کارت', 'balewoo' );
			}

			if ( empty( $missing ) ) {
				return;
			}

			echo '<div class="notice notice-warning is-dismissible balewoo-notice" data-notice="1"><p>';
			printf(
				/* translators: %s: list of missing items */
				esc_html__( 'بله‌وو: موارد زیر هنوز تنظیم نشده‌اند — %s', 'balewoo' ),
				esc_html( implode( '، ', $missing ) )
			);
			echo ' <a href="' . esc_url( admin_url( 'admin.php?page=balewoo-settings' ) ) . '">' . esc_html__( 'رفتن به تنظیمات', 'balewoo' ) . '</a>';
			echo '</p></div>';
		}

		/**
		 * Dismiss the checklist notice.
		 *
		 * @return void
		 */
		public static function ajax_dismiss_notice() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );
			set_transient( 'balewoo_notice_dismissed', 1, 3 * DAY_IN_SECONDS );
			wp_send_json_success();
		}

		/* ------------------------------------------------------------------ */
		/* AJAX — settings                                                     */
		/* ------------------------------------------------------------------ */

		/**
		 * Save the settings form.
		 *
		 * @return void
		 */
		public static function ajax_save_settings() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			if ( ! current_user_can( 'manage_balewoo' ) ) {
				wp_send_json_error( array( 'message' => __( 'دسترسی غیرمجاز.', 'balewoo' ) ) );
			}

			$data = isset( $_POST['settings'] ) ? wp_unslash( $_POST['settings'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			BaleWoo_Settings::save( is_array( $data ) ? $data : array() );

			wp_send_json_success( array( 'message' => __( 'تنظیمات با موفقیت ذخیره شد.', 'balewoo' ) ) );
		}

		/**
		 * Test a bot connection.
		 *
		 * @return void
		 */
		public static function ajax_test_connection() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$token    = isset( $_POST['token'] ) ? sanitize_text_field( wp_unslash( $_POST['token'] ) ) : '';

			$client = 'telegram' === $platform ? new BaleWoo_API_Telegram( $token ) : new BaleWoo_API_Bale( $token );
			$me     = $client->get_me();

			if ( is_wp_error( $me ) ) {
				wp_send_json_error( array( 'message' => $me->get_error_message() ) );
			}

			$name = '';
			if ( ! empty( $me['username'] ) ) {
				$name = '@' . $me['username'];
			} elseif ( ! empty( $me['first_name'] ) ) {
				$name = $me['first_name'];
			}

			wp_send_json_success(
				array(
					'message' => sprintf( __( 'اتصال برقرار است — %s', 'balewoo' ), $name ),
					'bot'     => $name,
					'id'      => isset( $me['id'] ) ? $me['id'] : '',
				)
			);
		}

		/**
		 * Send a test message.
		 *
		 * @return void
		 */
		public static function ajax_test_message() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$chat_id  = isset( $_POST['chat_id'] ) ? sanitize_text_field( wp_unslash( $_POST['chat_id'] ) ) : '';
			$text     = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : __( 'این یک پیام تست از بله‌وو است ✅', 'balewoo' );

			if ( ! $chat_id ) {
				wp_send_json_error( array( 'message' => __( 'آیدی گیرنده را وارد کنید.', 'balewoo' ) ) );
			}

			$client = 'telegram' === $platform ? new BaleWoo_API_Telegram() : new BaleWoo_API_Bale();
			$result = $client->send_message( $chat_id, $text );

			if ( is_wp_error( $result ) ) {
				wp_send_json_error( array( 'message' => $result->get_error_message() ) );
			}

			wp_send_json_success( array( 'message' => sprintf( __( 'پیام به %s ارسال شد ✓', 'balewoo' ), $chat_id ) ) );
		}

		/**
		 * Register the webhook on the platform.
		 *
		 * @return void
		 */
		public static function ajax_set_webhook() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$results  = BaleWoo_Cron::ensure_webhooks();
			$result   = isset( $results[ $platform ] ) ? $results[ $platform ] : array( 'ok' => false, 'error' => __( 'پلتفرم نامعتبر.', 'balewoo' ) );

			if ( empty( $result['ok'] ) ) {
				wp_send_json_error( array( 'message' => $result['error'] ) );
			}

			wp_send_json_success( array( 'message' => __( 'وب‌هوک با موفقیت ثبت شد ✓', 'balewoo' ), 'url' => $result['url'] ) );
		}

		/**
		 * Simulate a webhook update (tools page).
		 *
		 * @return void
		 */
		public static function ajax_webhook_test() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$type     = isset( $_POST['type'] ) ? sanitize_key( $_POST['type'] ) : 'start';
			$order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;

			if ( ! $order_id ) {
				$rows     = BaleWoo_Transactions::query( array( 'per_page' => 1 ) );
				$order_id = ! empty( $rows['items'] ) ? (int) $rows['items'][0]->order_id : 0;
			}

			if ( ! $order_id ) {
				wp_send_json_error( array( 'message' => __( 'هیچ سفارشی برای شبیه‌سازی وجود ندارد.', 'balewoo' ) ) );
			}

			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				wp_send_json_error( array( 'message' => __( 'سفارش یافت نشد.', 'balewoo' ) ) );
			}

			$chat_id = BaleWoo_Settings::get( 'bale_admin_chat_id' );
			$update  = array();

			switch ( $type ) {
				case 'approve':
					$update = array(
						'callback_query' => array(
							'id'      => 'test-' . wp_generate_password( 8, false, false ),
							'from'    => array( 'id' => $chat_id ? $chat_id : 1, 'first_name' => 'Test' ),
							'data'    => 'bpv:' . $order_id . ':approve',
							'message' => array(
								'message_id' => 1,
								'chat'       => array( 'id' => $chat_id ? $chat_id : 1 ),
							),
						),
					);
					break;

				case 'reject':
					$update = array(
						'callback_query' => array(
							'id'      => 'test-' . wp_generate_password( 8, false, false ),
							'from'    => array( 'id' => $chat_id ? $chat_id : 1, 'first_name' => 'Test' ),
							'data'    => 'bpv:' . $order_id . ':reject',
							'message' => array(
								'message_id' => 1,
								'chat'       => array( 'id' => $chat_id ? $chat_id : 1 ),
							),
						),
					);
					break;

				case 'start':
					$update = array(
						'message' => array(
							'message_id' => 1,
							'from'       => array( 'id' => 123456789, 'first_name' => 'مشتری تست' ),
							'chat'       => array( 'id' => 123456789 ),
							'text'       => '/start order_' . $order_id . '_' . $order->get_order_key(),
						),
					);
					break;

				case 'payment':
					$update = array(
						'message' => array(
							'message_id' => 2,
							'from'       => array( 'id' => 123456789, 'first_name' => 'مشتری تست' ),
							'chat'       => array( 'id' => 123456789 ),
							'successful_payment' => array(
								'currency'        => 'IRR',
								'total_amount'    => BaleWoo_Orders::amount_for_bale( $order ),
								'invoice_payload' => BaleWoo_Webhook::build_payload( $order ),
								'provider_payment_charge_id' => 'test-charge-' . wp_generate_password( 6, false, false ),
							),
						),
					);
					break;

				case 'receipt':
				default:
					$update = array(
						'message' => array(
							'message_id' => 3,
							'from'       => array( 'id' => 123456789, 'first_name' => 'مشتری تست' ),
							'chat'       => array( 'id' => 123456789 ),
							'photo'      => array( array( 'file_id' => 'test-file-id', 'width' => 100, 'height' => 100 ) ),
						),
					);
					break;
			}

			$response = BaleWoo_Webhook::process( $platform, BaleWoo_Settings::webhook_secret(), $update );
			$data     = $response instanceof WP_REST_Response ? $response->get_data() : array();

			wp_send_json_success(
				array(
					'message'  => __( 'تست وب‌هوک اجرا شد.', 'balewoo' ),
					'response' => $data,
					'status'   => $response instanceof WP_REST_Response ? $response->get_status() : 200,
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* AJAX — orders                                                       */
		/* ------------------------------------------------------------------ */

		/**
		 * Approve / reject / undo from the admin screens.
		 *
		 * @return void
		 */
		public static function ajax_order_action() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			if ( ! current_user_can( 'edit_shop_orders' ) ) {
				wp_send_json_error( array( 'message' => __( 'دسترسی غیرمجاز.', 'balewoo' ) ) );
			}

			$order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
			$action   = isset( $_POST['order_action'] ) ? sanitize_key( $_POST['order_action'] ) : '';
			$order    = wc_get_order( $order_id );

			if ( ! $order ) {
				wp_send_json_error( array( 'message' => __( 'سفارش یافت نشد.', 'balewoo' ) ) );
			}

			switch ( $action ) {
				case 'approve':
					BaleWoo_Orders::approve( $order_id, 'admin' );
					$message = __( 'پرداخت تأیید شد ✓', 'balewoo' );
					break;
				case 'reject':
					BaleWoo_Orders::reject( $order_id, __( 'توسط مدیر رد شد.', 'balewoo' ), 'admin' );
					$message = __( 'پرداخت رد شد ✗', 'balewoo' );
					break;
				case 'undo':
					BaleWoo_Orders::undo( $order_id ) ? $message = __( 'عملیات برگشت داده شد ↩️', 'balewoo' ) : $message = __( 'مهلت بازگشت تمام شده است.', 'balewoo' );
					break;
				default:
					wp_send_json_error( array( 'message' => __( 'عملیات نامعتبر.', 'balewoo' ) ) );
			}

			$order = wc_get_order( $order_id );

			wp_send_json_success(
				array(
					'message' => $message,
					'status'  => $order ? $order->get_status() : '',
					'label'   => $order ? wc_get_order_status_name( $order->get_status() ) : '',
				)
			);
		}

		/**
		 * Promote a messenger user to admin.
		 *
		 * @return void
		 */
		public static function ajax_set_manager() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$chat_id  = isset( $_POST['chat_id'] ) ? sanitize_text_field( wp_unslash( $_POST['chat_id'] ) ) : '';

			if ( ! $chat_id ) {
				wp_send_json_error( array( 'message' => __( 'آیدی وارد نشده است.', 'balewoo' ) ) );
			}

			BaleWoo_Webhook::set_admin_chat_id( $platform, $chat_id );

			wp_send_json_success( array( 'message' => sprintf( __( 'مدیر %s تنظیم شد ✓', 'balewoo' ), 'telegram' === $platform ? 'تلگرام' : 'بله' ) ) );
		}

		/**
		 * Send the sales report to admins now.
		 *
		 * @return void
		 */
		public static function ajax_send_report() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$sent = BaleWoo_Notifier::send_report( isset( $_POST['days'] ) && 7 === absint( $_POST['days'] ) ? 7 : 1 );

			if ( ! $sent ) {
				wp_send_json_error( array( 'message' => __( 'ارسال گزارش ناموفق بود. تنظیمات ربات و آیدی مدیر را بررسی کنید.', 'balewoo' ) ) );
			}

			wp_send_json_success( array( 'message' => __( 'گزارش ارسال شد ✓', 'balewoo' ) ) );
		}

		/* ------------------------------------------------------------------ */
		/* AJAX — transactions & logs                                          */
		/* ------------------------------------------------------------------ */

		/**
		 * Filtered transactions table body.
		 *
		 * @return void
		 */
		public static function ajax_transactions() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$args = array(
				'status'   => isset( $_POST['status'] ) ? sanitize_key( $_POST['status'] ) : '',
				'platform' => isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : '',
				'from'     => isset( $_POST['from'] ) ? sanitize_text_field( wp_unslash( $_POST['from'] ) ) : '',
				'to'       => isset( $_POST['to'] ) ? sanitize_text_field( wp_unslash( $_POST['to'] ) ) : '',
				'search'   => isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '',
				'per_page' => isset( $_POST['per_page'] ) ? absint( $_POST['per_page'] ) : 20,
				'page'     => isset( $_POST['paged'] ) ? absint( $_POST['paged'] ) : 1,
			);

			$result = BaleWoo_Transactions::query( $args );

			ob_start();
			self::transactions_rows( $result['items'] );
			$html = ob_get_clean();

			wp_send_json_success(
				array(
					'html'  => $html,
					'total' => (int) $result['total'],
					'pages' => (int) ceil( $result['total'] / max( 1, (int) $args['per_page'] ) ),
				)
			);
		}

		/**
		 * Render transaction table rows.
		 *
		 * @param array $rows Rows.
		 * @return void
		 */
		public static function transactions_rows( $rows ) {
			if ( empty( $rows ) ) {
				echo '<tr><td colspan="9" class="balewoo-empty">' . esc_html__( 'موردی یافت نشد.', 'balewoo' ) . '</td></tr>';
				return;
			}

			foreach ( $rows as $row ) {
				$order = wc_get_order( $row->order_id );
				?>
				<tr data-order="<?php echo esc_attr( $row->order_id ); ?>">
					<td><?php echo esc_html( $row->id ); ?></td>
					<td>
						<a href="<?php echo esc_url( admin_url( 'post.php?post=' . (int) $row->order_id . '&action=edit' ) ); ?>">#<?php echo esc_html( $row->order_id ); ?></a>
					</td>
					<td><?php echo esc_html( $row->customer_name ); ?></td>
					<td><bdi><?php echo esc_html( $row->phone ); ?></bdi></td>
					<td><?php echo esc_html( number_format( (float) $row->amount ) ); ?></td>
					<td>
						<span class="balewoo-chip balewoo-chip-<?php echo esc_attr( $row->platform ); ?>">
							<?php
							echo esc_html(
								'telegram' === $row->platform ? __( 'تلگرام', 'balewoo' ) : ( 'card' === $row->platform ? __( 'کارت‌به‌کارت', 'balewoo' ) : __( 'بله', 'balewoo' ) )
							);
							?>
						</span>
					</td>
					<td>
						<span class="balewoo-badge balewoo-badge-<?php echo esc_attr( $row->status ); ?>"><?php echo esc_html( BaleWoo_Transactions::status_label( $row->status ) ); ?></span>
					</td>
					<td><?php echo esc_html( BaleWoo_Templates::jdate( strtotime( $row->created_at ), 'Y/m/d H:i' ) ); ?></td>
					<td class="balewoo-actions">
						<?php if ( $order && ! $order->is_paid() ) : ?>
							<button class="button button-small button-primary balewoo-order-action" data-action="approve" data-order="<?php echo esc_attr( $row->order_id ); ?>"><?php esc_html_e( 'تأیید', 'balewoo' ); ?></button>
							<button class="button button-small balewoo-order-action" data-action="reject" data-order="<?php echo esc_attr( $row->order_id ); ?>"><?php esc_html_e( 'رد', 'balewoo' ); ?></button>
						<?php endif; ?>
						<button class="button button-small balewoo-order-action" data-action="undo" data-order="<?php echo esc_attr( $row->order_id ); ?>"><?php esc_html_e( 'بازگشت', 'balewoo' ); ?></button>
						<?php if ( $row->receipt_url ) : ?>
							<a class="button button-small" target="_blank" href="<?php echo esc_url( $row->receipt_url ); ?>"><?php esc_html_e( 'رسید', 'balewoo' ); ?></a>
						<?php endif; ?>
					</td>
				</tr>
				<?php
			}
		}

		/**
		 * Clear the log table.
		 *
		 * @return void
		 */
		public static function ajax_clear_logs() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			if ( ! current_user_can( 'manage_balewoo' ) ) {
				wp_send_json_error( array( 'message' => __( 'دسترسی غیرمجاز.', 'balewoo' ) ) );
			}

			BaleWoo_Logger::clear();
			wp_send_json_success( array( 'message' => __( 'لاگ‌ها پاک شدند.', 'balewoo' ) ) );
		}

		/* ------------------------------------------------------------------ */
		/* AJAX — broadcast                                                    */
		/* ------------------------------------------------------------------ */

		/**
		 * Live preview of a broadcast message.
		 *
		 * @return void
		 */
		public static function ajax_broadcast_preview() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$title   = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
			$body    = isset( $_POST['body'] ) ? sanitize_textarea_field( wp_unslash( $_POST['body'] ) ) : '';
			$audience = isset( $_POST['audience'] ) ? sanitize_key( $_POST['audience'] ) : 'all';

			$recipients = BaleWoo_Transactions::audience( $audience );

			wp_send_json_success(
				array(
					'recipients' => count( $recipients ),
					'preview'    => ( $title ? '<b>' . esc_html( $title ) . '</b><br>' : '' ) . nl2br( esc_html( $body ) ),
				)
			);
		}

		/**
		 * Send a broadcast.
		 *
		 * @return void
		 */
		public static function ajax_send_broadcast() {
			global $wpdb;

			check_ajax_referer( 'balewoo_admin', 'nonce' );

			if ( ! current_user_can( 'manage_balewoo' ) ) {
				wp_send_json_error( array( 'message' => __( 'دسترسی غیرمجاز.', 'balewoo' ) ) );
			}

			$audience = isset( $_POST['audience'] ) ? sanitize_key( $_POST['audience'] ) : 'all';
			$platform = isset( $_POST['platform'] ) ? sanitize_key( $_POST['platform'] ) : 'bale';
			$title    = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
			$body     = isset( $_POST['body'] ) ? sanitize_textarea_field( wp_unslash( $_POST['body'] ) ) : '';
			$test     = ! empty( $_POST['test'] );

			if ( ! $body ) {
				wp_send_json_error( array( 'message' => __( 'متن پیام خالی است.', 'balewoo' ) ) );
			}

			$text = $title ? $title . "\n\n" . $body : $body;

			if ( $test ) {
				$chat_id = 'telegram' === $platform ? BaleWoo_Settings::get( 'telegram_admin_chat_id' ) : BaleWoo_Settings::get( 'bale_admin_chat_id' );
				if ( ! $chat_id ) {
					wp_send_json_error( array( 'message' => __( 'آیدی مدیر تنظیم نشده است.', 'balewoo' ) ) );
				}
				$client = 'telegram' === $platform ? new BaleWoo_API_Telegram() : new BaleWoo_API_Bale();
				$result = $client->send_message( $chat_id, $text );
				if ( is_wp_error( $result ) ) {
					wp_send_json_error( array( 'message' => $result->get_error_message() ) );
				}
				wp_send_json_success( array( 'message' => __( 'پیام تست ارسال شد ✓', 'balewoo' ), 'sent' => 1, 'failed' => 0 ) );
			}

			$recipients = BaleWoo_Transactions::audience( $audience );
			if ( 'telegram' === $platform ) {
				$recipients = array_filter( $recipients, function ( $r ) {
					return 'telegram' === $r->platform;
				} );
			} elseif ( 'bale' === $platform ) {
				$recipients = array_filter( $recipients, function ( $r ) {
					return 'telegram' !== $r->platform;
				} );
			}

			$sent   = 0;
			$failed = 0;
			$client = 'telegram' === $platform ? new BaleWoo_API_Telegram() : new BaleWoo_API_Bale();

			foreach ( $recipients as $recipient ) {
				$result  = $client->send_message( $recipient->chat_id, $text );
				$result_ok = ! is_wp_error( $result );

				// تلاش دوم از طریق سفیر در صورت عدم تحویل.
				if ( ! $result_ok && 'telegram' !== $platform && BaleWoo_Settings::is_on( 'safir_enabled' ) && $recipient->phone ) {
					$safir      = new BaleWoo_API_Safir();
					$result_ok  = ! is_wp_error( $safir->send( $recipient->phone, $text ) );
				}

				$result_ok ? $sent++ : $failed++;
				usleep( 60000 ); // کمی مکث برای محدودیت نرخ پیام‌رسان.
			}

			$wpdb->insert(
				$wpdb->prefix . 'balewoo_broadcasts',
				array(
					'title'      => $title,
					'body'       => $body,
					'audience'   => $audience,
					'platform'   => $platform,
					'recipients' => count( $recipients ),
					'sent'       => $sent,
					'failed'     => $failed,
					'status'     => $failed && ! $sent ? 'failed' : 'sent',
					'created_at' => current_time( 'mysql', 1 ),
				)
			);

			BaleWoo_Logger::success( sprintf( 'Broadcast sent — %d recipients (%d ok / %d failed)', count( $recipients ), $sent, $failed ) );

			wp_send_json_success(
				array(
					'message' => sprintf( __( 'ارسال انجام شد: %d موفق، %d ناموفق', 'balewoo' ), $sent, $failed ),
					'sent'    => $sent,
					'failed'  => $failed,
					'total'   => count( $recipients ),
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* AJAX — scenario simulator (demo panel)                              */
		/* ------------------------------------------------------------------ */

		/**
		 * Run one step of the demo scenario.
		 *
		 * @return void
		 */
		public static function ajax_scenario() {
			check_ajax_referer( 'balewoo_admin', 'nonce' );

			$step     = isset( $_POST['step'] ) ? sanitize_key( $_POST['step'] ) : '';
			$order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
			$events   = array();

			if ( 'reset' === $step ) {
				delete_transient( 'balewoo_demo_order' );
				wp_send_json_success( array( 'events' => array( array( 'side' => 'system', 'text' => __( 'سناریو ریست شد.', 'balewoo' ) ) ) ) );
			}

			if ( ! $order_id ) {
				$order_id = (int) get_transient( 'balewoo_demo_order' );
			}

			if ( in_array( $step, array( 'new_order', 'full' ), true ) && ! $order_id ) {
				$order_id = self::create_demo_order();
				set_transient( 'balewoo_demo_order', $order_id, HOUR_IN_SECONDS );
				$order    = wc_get_order( $order_id );

				$events[] = array(
					'side' => 'customer',
					'text' => BaleWoo_Templates::render( 'tpl_customer_new', $order ),
				);
				$events[] = array(
					'side' => 'admin',
					'text' => BaleWoo_Templates::render( 'tpl_admin_new', $order ) . "\n\n[✅ تأیید] [❌ رد] [↩️ بازگشت]",
					'keyboard' => true,
				);
				$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'سفارش #%d ثبت شد — وضعیت: %s', 'balewoo' ), $order_id, wc_get_order_status_name( $order->get_status() ) ) );
			}

			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				wp_send_json_error( array( 'message' => __( 'سفارش دمو یافت نشد. دوباره تلاش کنید.', 'balewoo' ) ) );
			}

			switch ( $step ) {
				case 'receipt':
					BaleWoo_Orders::save_receipt( $order_id, BALEWOO_URL . 'public/images/receipt-sample.svg', 'bale' );
					$events[] = array( 'side' => 'customer', 'text' => '🧾 ' . __( 'رسید پرداخت ارسال شد.', 'balewoo' ) );
					$events[] = array( 'side' => 'admin', 'text' => sprintf( __( 'رسید جدید برای سفارش #%d دریافت شد.', 'balewoo' ), $order_id ) . "\n\n[✅ تأیید] [❌ رد] [🧾 مشاهده رسید]", 'keyboard' => true );
					$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'وضعیت سفارش: %s', 'balewoo' ), wc_get_order_status_name( wc_get_order( $order_id )->get_status() ) ) );
					break;

				case 'approve':
					BaleWoo_Orders::approve( $order_id, 'bot' );
					$order = wc_get_order( $order_id );
					$events[] = array( 'side' => 'admin', 'text' => '✅ ' . sprintf( __( 'سفارش #%d تأیید شد — کد پیگیری %s', 'balewoo' ), $order_id, $order->get_meta( '_balewoo_tracking', true ) ) );
					$events[] = array( 'side' => 'customer', 'text' => BaleWoo_Templates::render( 'tpl_customer_paid', $order ) );
					$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'وضعیت سفارش: %s', 'balewoo' ), wc_get_order_status_name( $order->get_status() ) ) );
					break;

				case 'reject':
					BaleWoo_Orders::reject( $order_id, __( 'مبلغ واریزی با سفارش مطابقت ندارد.', 'balewoo' ), 'bot' );
					$order = wc_get_order( $order_id );
					$events[] = array( 'side' => 'admin', 'text' => '❌ ' . sprintf( __( 'سفارش #%d رد شد.', 'balewoo' ), $order_id ) );
					$events[] = array( 'side' => 'customer', 'text' => BaleWoo_Templates::render( 'tpl_customer_reject', $order ) );
					$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'وضعیت سفارش: %s', 'balewoo' ), wc_get_order_status_name( $order->get_status() ) ) );
					break;

				case 'refund':
					$order->update_status( 'refunded', __( 'بازگشت وجه در سناریوی دمو.', 'balewoo' ) );
					BaleWoo_Transactions::set_status( $order_id, 'refunded' );
					$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'سفارش #%d بازگشت وجه خورد.', 'balewoo' ), $order_id ) );
					break;

				case 'undo':
					BaleWoo_Orders::undo( $order_id );
					$order = wc_get_order( $order_id );
					$events[] = array( 'side' => 'admin', 'text' => '↩️ ' . sprintf( __( 'عملیات برگشت داده شد — وضعیت: %s', 'balewoo' ), wc_get_order_status_name( $order->get_status() ) ) );
					break;

				case 'full':
					BaleWoo_Orders::save_receipt( $order_id, BALEWOO_URL . 'public/images/receipt-sample.svg', 'bale' );
					BaleWoo_Orders::approve( $order_id, 'bot' );
					$order = wc_get_order( $order_id );
					$events[] = array( 'side' => 'customer', 'text' => '🧾 ' . __( 'رسید پرداخت ارسال شد.', 'balewoo' ) );
					$events[] = array( 'side' => 'admin', 'text' => '✅ ' . sprintf( __( 'سفارش #%d تأیید شد.', 'balewoo' ), $order_id ) );
					$events[] = array( 'side' => 'customer', 'text' => BaleWoo_Templates::render( 'tpl_customer_paid', $order ) );
					$events[] = array( 'side' => 'system', 'text' => sprintf( __( 'سناریوی کامل اجرا شد — وضعیت: %s', 'balewoo' ), wc_get_order_status_name( $order->get_status() ) ) );
					break;
			}

			wp_send_json_success(
				array(
					'order_id' => $order_id,
					'events'   => $events,
					'status'   => wc_get_order_status_name( wc_get_order( $order_id )->get_status() ),
				)
			);
		}

		/**
		 * Create a demo order for the simulator.
		 *
		 * @return int Order id.
		 */
		public static function create_demo_order() {
			if ( ! function_exists( 'wc_get_products' ) ) {
				return 0;
			}

			$products = wc_get_products( array( 'limit' => 1, 'status' => 'publish' ) );
			$order    = wc_create_order();

			if ( ! empty( $products ) ) {
				$order->add_product( $products[0], 1 );
			} else {
				// اگر محصولی نبود، یک آیتم ساده اضافه می‌کنیم.
				$item = new WC_Order_Item_Product();
				$item->set_name( __( 'محصول نمونه', 'balewoo' ) );
				$item->set_quantity( 1 );
				$item->set_subtotal( 85000 );
				$item->set_total( 85000 );
				$order->add_item( $item );
				$order->set_total( 85000 );
			}

			$order->set_billing_first_name( 'علی' );
			$order->set_billing_last_name( 'محمدی' );
			$order->set_billing_phone( '09123456789' );
			$order->set_payment_method( 'balewoo_card' );
			$order->set_payment_method_title( __( 'کارت به کارت (دمو)', 'balewoo' ) );
			$order->set_status( 'pending' );
			$order->calculate_totals();
			$order->save();

			BaleWoo_Transactions::upsert(
				$order->get_id(),
				array(
					'status'   => 'pending',
					'platform' => 'bale',
					'method'   => 'balewoo_card',
					'amount'   => (int) round( (float) $order->get_total() ),
				)
			);

			BaleWoo_Logger::add( sprintf( 'Demo order #%d created by the scenario simulator', $order->get_id() ) );

			return $order->get_id();
		}

		/* ------------------------------------------------------------------ */
		/* Export                                                              */
		/* ------------------------------------------------------------------ */

		/**
		 * CSV export (admin-post endpoint).
		 *
		 * @return void
		 */
		public static function export_csv() {
			if ( ! current_user_can( 'manage_balewoo' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'balewoo_export' ) ) {
				wp_die( esc_html__( 'دسترسی غیرمجاز.', 'balewoo' ) );
			}

			BaleWoo_Transactions::export_csv(
				array(
					'status'   => isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : '',
					'platform' => isset( $_GET['platform'] ) ? sanitize_key( $_GET['platform'] ) : '',
					'from'     => isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '',
					'to'       => isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : '',
					'search'   => isset( $_GET['search'] ) ? sanitize_text_field( wp_unslash( $_GET['search'] ) ) : '',
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* View helpers                                                        */
		/* ------------------------------------------------------------------ */

		/**
		 * Settings status rows for the debug box.
		 *
		 * @return array
		 */
		public static function debug_status() {
			$rows = array(
				array( 'key' => 'gateway_enabled', 'label' => __( 'درگاه فعال', 'balewoo' ), 'value' => BaleWoo_Settings::is_on( 'gateway_enabled' ) ? 'yes' : 'no' ),
				array( 'key' => 'bale_token', 'label' => __( 'توکن ربات بله', 'balewoo' ), 'value' => BaleWoo_Settings::get( 'bale_token' ) ? 'set' : 'missing' ),
				array( 'key' => 'bale_provider_token', 'label' => __( 'توکن پرداخت بله', 'balewoo' ), 'value' => BaleWoo_Settings::get( 'bale_provider_token' ) ? 'set' : 'missing' ),
				array( 'key' => 'telegram_token', 'label' => __( 'توکن ربات تلگرام', 'balewoo' ), 'value' => BaleWoo_Settings::get( 'telegram_token' ) ? 'set' : 'missing' ),
				array( 'key' => 'bale_admin_chat_id', 'label' => __( 'آیدی مدیر بله', 'balewoo' ), 'value' => BaleWoo_Settings::get( 'bale_admin_chat_id' ) ? BaleWoo_Settings::get( 'bale_admin_chat_id' ) : 'empty' ),
				array( 'key' => 'admin_phone', 'label' => __( 'شماره مدیر', 'balewoo' ), 'value' => BaleWoo_Settings::get( 'admin_phone' ) ? BaleWoo_Settings::get( 'admin_phone' ) : '(empty — optional)' ),
				array( 'key' => 'notify_customer_bale', 'label' => __( 'اعلان به مشتری (بله)', 'balewoo' ), 'value' => BaleWoo_Settings::is_on( 'notify_customer_bale' ) ? 'ON' : 'OFF' ),
				array( 'key' => 'notify_admin_bale', 'label' => __( 'اعلان به مدیر (بله)', 'balewoo' ), 'value' => BaleWoo_Settings::is_on( 'notify_admin_bale' ) ? 'ON' : 'OFF' ),
				array( 'key' => 'sms_enabled', 'label' => __( 'پیامک', 'balewoo' ), 'value' => BaleWoo_Settings::is_on( 'sms_enabled' ) ? 'ON' : 'OFF' ),
				array( 'key' => 'safir_enabled', 'label' => __( 'سفیر بله', 'balewoo' ), 'value' => BaleWoo_Settings::is_on( 'safir_enabled' ) ? 'ON' : 'OFF' ),
				array( 'key' => 'active_cards', 'label' => __( 'کارت‌های فعال', 'balewoo' ), 'value' => count( BaleWoo_Settings::cards() ) ),
				array( 'key' => 'webhook_url', 'label' => __( 'آدرس وب‌هوک', 'balewoo' ), 'value' => BaleWoo_Settings::webhook_url( 'bale' ) ),
			);

			$essential = BaleWoo_Settings::get( 'bale_token' ) && BaleWoo_Settings::get( 'bale_admin_chat_id' ) && count( BaleWoo_Settings::cards() );

			return array(
				'rows'  => $rows,
				'ready' => (bool) $essential,
			);
		}
	}
}
