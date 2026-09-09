<?php
/**
 * WooCommerce payment gateways: Bale wallet + card-to-card.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Gateway_Base' ) ) {

	/**
	 * Shared gateway behaviour.
	 */
	abstract class BaleWoo_Gateway_Base extends WC_Payment_Gateway {

		/**
		 * Common setup for both gateways.
		 *
		 * فراخوانی این متد باید بعد از مقداردهی $this->id انجام شود؛
		 * ابتدا فیلدهای فرم ساخته می‌شوند و سپس تنظیمات ذخیره‌شده خوانده می‌شود.
		 *
		 * @return void
		 */
		protected function common_init() {
			$this->has_fields = false;
			$this->supports   = array( 'products', 'refunds' );

			// subclass fills $this->form_fields.
			$this->init_form_fields();
			$this->init_settings();

			$this->title       = $this->get_option( 'title' );
			$this->description = $this->get_option( 'description' );
			$this->enabled     = $this->get_option( 'enabled' );

			add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
		}

		/**
		 * Standard gateway option fields.
		 *
		 * @param string $default_title       Default title.
		 * @param string $default_description Default description.
		 * @return void
		 */
		protected function common_form_fields( $default_title, $default_description ) {
			$this->form_fields = array(
				'enabled'     => array(
					'title'   => __( 'فعال / غیرفعال', 'balewoo' ),
					'type'    => 'checkbox',
					'label'   => __( 'فعال‌سازی این روش پرداخت', 'balewoo' ),
					'default' => 'yes',
				),
				'title'       => array(
					'title'       => __( 'عنوان درگاه', 'balewoo' ),
					'type'        => 'text',
					'description' => __( 'عنوانی که مشتری در صفحه تسویه حساب می‌بیند.', 'balewoo' ),
					'default'     => $default_title,
					'desc_tip'    => true,
				),
				'description' => array(
					'title'       => __( 'توضیحات درگاه', 'balewoo' ),
					'type'        => 'textarea',
					'description' => __( 'توضیحاتی که زیر عنوان درگاه نمایش داده می‌شود.', 'balewoo' ),
					'default'     => $default_description,
					'desc_tip'    => true,
				),
				'balewoo_settings_link' => array(
					'title'       => __( 'تنظیمات بله‌وو', 'balewoo' ),
					'type'        => 'title',
					'description' => sprintf(
						/* translators: %s: settings url */
						__( 'تنظیمات ربات، کارت‌های بانکی، قالب پیام‌ها و گزارش‌ها در <a href="%s">پنل بله‌وو</a> انجام می‌شود.', 'balewoo' ),
						esc_url( admin_url( 'admin.php?page=balewoo-settings' ) )
					),
				),
			);
		}

		/**
		 * Respect the plugin-level on/off switches.
		 *
		 * @return bool
		 */
		public function is_available() {
			if ( 'yes' !== BaleWoo_Settings::get( 'gateway_enabled', 'yes' ) ) {
				return false;
			}

			$flag = 'balewoo_bale' === $this->id ? 'bale_pay_enabled' : 'card_pay_enabled';

			if ( 'yes' !== BaleWoo_Settings::get( $flag, 'yes' ) ) {
				return false;
			}

			return parent::is_available();
		}

		/**
		 * Build the payment page URL for an order.
		 *
		 * @param WC_Order $order Order.
		 * @return string
		 */
		protected function pay_page_url( $order ) {
			return add_query_arg(
				array(
					'balewoo_pay' => $order->get_id(),
					'key'         => $order->get_order_key(),
				),
				WC()->api_request_url( 'balewoo_pay' )
			);
		}
	}

	/**
	 * Gateway 1: آنلاین با کیف پول بله.
	 */
	class BaleWoo_Gateway_Bale extends BaleWoo_Gateway_Base {

		/**
		 * Constructor.
		 */
		public function __construct() {
			$this->id                 = 'balewoo_bale';
			$this->icon               = BALEWOO_URL . 'public/images/bale.svg';
			$this->method_title       = __( 'بله‌وو — پرداخت آنلاین با بله', 'balewoo' );
			$this->method_description = __( 'مشتری پس از ثبت سفارش به کیف پول بله منتقل شده و پرداخت به‌صورت خودکار تأیید می‌شود.', 'balewoo' );

			$this->common_init();
		}

		/**
		 * Gateway settings fields.
		 *
		 * @return void
		 */
		public function init_form_fields() {
			$this->common_form_fields(
				__( 'پرداخت آنلاین با بله 💙', 'balewoo' ),
				__( 'پس از ثبت سفارش، برای پرداخت امن به بله منتقل می‌شوید. نتیجه پرداخت به‌صورت خودکار ثبت می‌شود.', 'balewoo' )
			);
		}

		/**
		 * Checkout description.
		 *
		 * @return void
		 */
		public function payment_fields() {
			if ( $this->description ) {
				echo '<p class="balewoo-gateway-description">' . wp_kses_post( wpautop( $this->description ) ) . '</p>';
			}

			if ( ! BaleWoo_Settings::get( 'bale_provider_token' ) || ! BaleWoo_Settings::get( 'bale_token' ) ) {
				echo '<p class="balewoo-gateway-warning">' . esc_html__( 'توجه: توکن ربات یا توکن پرداخت بله هنوز تنظیم نشده است.', 'balewoo' ) . '</p>';
			}
		}

		/**
		 * Process the payment and redirect to the Bale pay page.
		 *
		 * @param int $order_id Order id.
		 * @return array
		 */
		public function process_payment( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return array( 'result' => 'failure' );
			}

			$amount  = BaleWoo_Orders::amount_for_bale( $order );
			$payload = BaleWoo_Webhook::build_payload( $order );

			$prices = array(
				array(
					'label'  => sprintf( __( 'سفارش #%d', 'balewoo' ), $order->get_id() ),
					'amount' => $amount,
				),
			);

			$invoice_args = array(
				'title'             => sprintf( __( 'سفارش شماره %d', 'balewoo' ), $order->get_id() ),
				'description'       => sprintf( __( 'پرداخت سفارش از فروشگاه %s', 'balewoo' ), get_bloginfo( 'name' ) ),
				'payload'           => $payload,
				'provider_token'    => BaleWoo_Settings::get( 'bale_provider_token' ),
				'currency'          => 'IRR',
				'prices'            => $prices,
				'need_phone_number' => false,
				'is_flexible'       => false,
			);

			$invoice_url = '';
			$sent_to_chat = false;

			$bale = new BaleWoo_API_Bale();

			if ( $bale->is_configured() ) {
				$chat_id = $order->get_meta( '_balewoo_chat_id', true );
				if ( ! $chat_id ) {
					$chat_id = BaleWoo_Orders::get_user_chat_id( $order->get_user_id(), 'bale' );
				}

				if ( $chat_id ) {
					$sent = $bale->send_invoice( $chat_id, $invoice_args );
					if ( ! is_wp_error( $sent ) ) {
						$sent_to_chat = true;
						BaleWoo_Logger::success( sprintf( 'Invoice sent to Bale chat — order #%d', $order->get_id() ) );
					} else {
						BaleWoo_Logger::warning( 'sendInvoice failed: ' . $bale->last_error );
					}
				}

				$link = $bale->create_invoice_link( $invoice_args );
				if ( is_wp_error( $link ) ) {
					BaleWoo_Logger::error( 'createInvoiceLink failed: ' . $link->get_error_message() );
				} else {
					$invoice_url = $link;
				}
			} else {
				BaleWoo_Logger::error( 'Bale token missing — payment started without an invoice.' );
			}

			$order->update_meta_data( '_balewoo_invoice_url', $invoice_url );
			$order->update_meta_data( '_balewoo_invoice_payload', $payload );
			$order->update_meta_data( '_balewoo_invoice_sent_to_chat', $sent_to_chat ? 'yes' : 'no' );
			$order->update_status( 'pending', __( 'در انتظار پرداخت از طریق کیف پول بله.', 'balewoo' ) );
			$order->save();

			BaleWoo_Transactions::upsert(
				$order->get_id(),
				array(
					'status'   => 'pending',
					'platform' => 'bale',
					'method'   => 'balewoo_bale',
					'payload'  => $payload,
				)
			);

			if ( function_exists( 'wc_empty_cart' ) && WC()->cart ) {
				WC()->cart->empty_cart();
			}

			BaleWoo_Logger::add( sprintf( 'Payment started for order #%d — amount %d (%s)', $order->get_id(), $amount, BaleWoo_Settings::get( 'amount_unit' ) ) );

			return array(
				'result'   => 'success',
				'redirect' => $this->pay_page_url( $order ),
			);
		}

		/**
		 * Handle refunds from the WooCommerce order screen.
		 *
		 * @param int    $order_id Order id.
		 * @param float  $amount   Amount.
		 * @param string $reason   Reason.
		 * @return bool
		 */
		public function process_refund( $order_id, $amount = null, $reason = '' ) {
			$order  = wc_get_order( $order_id );
			$charge = $order ? $order->get_meta( '_balewoo_charge_id', true ) : '';

			if ( ! $charge ) {
				return new WP_Error( 'balewoo_refund', __( 'این سفارش شناسه پرداخت بله ندارد (احتمالاً کارت‌به‌کارت بوده است).', 'balewoo' ) );
			}

			$bale = new BaleWoo_API_Bale();
			$done = $bale->refund_payment( $charge );

			if ( is_wp_error( $done ) ) {
				BaleWoo_Logger::error( 'Refund failed: ' . $done->get_error_message() );
				return $done;
			}

			BaleWoo_Transactions::set_status( $order_id, 'refunded', array( 'note' => $reason ) );
			BaleWoo_Logger::success( sprintf( 'Order #%d refunded via Bale', $order_id ) );

			return true;
		}
	}

	/**
	 * Gateway 2: کارت به کارت با تأیید مدیر در بله.
	 */
	class BaleWoo_Gateway_Card extends BaleWoo_Gateway_Base {

		/**
		 * Constructor.
		 */
		public function __construct() {
			$this->id                 = 'balewoo_card';
			$this->icon               = BALEWOO_URL . 'public/images/card.svg';
			$this->method_title       = __( 'بله‌وو — کارت به کارت', 'balewoo' );
			$this->method_description = __( 'مشتری مبلغ را کارت‌به‌کارت واریز کرده و رسید را ارسال می‌کند؛ مدیر از طریق ربات بله تأیید یا رد می‌کند.', 'balewoo' );

			$this->common_init();
		}

		/**
		 * Gateway settings fields.
		 *
		 * @return void
		 */
		public function init_form_fields() {
			$this->common_form_fields(
				__( 'پرداخت کارت به کارت 💳', 'balewoo' ),
				__( 'مبلغ را به یکی از شماره کارت‌ها واریز کرده و تصویر رسید را در صفحه بعد بارگذاری کنید.', 'balewoo' )
			);
		}

		/**
		 * Show card details on checkout.
		 *
		 * @return void
		 */
		public function payment_fields() {
			if ( $this->description ) {
				echo '<p class="balewoo-gateway-description">' . wp_kses_post( wpautop( $this->description ) ) . '</p>';
			}

			$cards = BaleWoo_Settings::cards();
			if ( empty( $cards ) ) {
				echo '<p class="balewoo-gateway-warning">' . esc_html__( 'هیچ شماره کارتی در تنظیمات بله‌وو ثبت نشده است.', 'balewoo' ) . '</p>';
				return;
			}

			echo '<ul class="balewoo-card-list">';
			foreach ( $cards as $card ) {
				echo '<li>';
				echo '<span class="balewoo-card-number" data-card="' . esc_attr( preg_replace( '/\D/', '', $card['number'] ) ) . '">' . esc_html( BaleWoo_Templates::format_card( $card['number'] ) ) . '</span>';
				if ( ! empty( $card['bank'] ) ) {
					echo ' <span class="balewoo-card-bank">' . esc_html( $card['bank'] ) . '</span>';
				}
				if ( ! empty( $card['holder'] ) ) {
					echo ' <span class="balewoo-card-holder">(' . esc_html( $card['holder'] ) . ')</span>';
				}
				echo '</li>';
			}
			echo '</ul>';

			if ( BaleWoo_Settings::get( 'sheba' ) ) {
				echo '<p class="balewoo-sheba">' . esc_html__( 'شبا: ', 'balewoo' ) . '<bdi>' . esc_html( BaleWoo_Settings::get( 'sheba' ) ) . '</bdi></p>';
			}
		}

		/**
		 * Process the card-to-card payment.
		 *
		 * @param int $order_id Order id.
		 * @return array
		 */
		public function process_payment( $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) {
				return array( 'result' => 'failure' );
			}

			$deadline = (int) BaleWoo_Settings::get( 'payment_deadline_hours', 24 );
			$order->update_meta_data( '_balewoo_deadline', gmdate( 'Y-m-d H:i:s', time() + max( 1, $deadline ) * HOUR_IN_SECONDS ) );
			$order->update_status( 'on-hold', __( 'در انتظار واریز کارت‌به‌کارت و تأیید مدیر.', 'balewoo' ) );
			$order->save();

			BaleWoo_Transactions::upsert(
				$order->get_id(),
				array(
					'status'   => 'pending',
					'platform' => 'card',
					'method'   => 'balewoo_card',
				)
			);

			if ( function_exists( 'wc_empty_cart' ) && WC()->cart ) {
				WC()->cart->empty_cart();
			}

			return array(
				'result'   => 'success',
				'redirect' => $this->get_return_url( $order ),
			);
		}
	}
}

/**
 * Register the gateways with WooCommerce.
 *
 * @param array $gateways Gateways.
 * @return array
 */
function balewoo_add_gateways( $gateways ) {
	$gateways[] = 'BaleWoo_Gateway_Bale';
	$gateways[] = 'BaleWoo_Gateway_Card';
	return $gateways;
}
add_filter( 'woocommerce_payment_gateways', 'balewoo_add_gateways' );

/**
 * Register custom cron schedule.
 *
 * @param array $schedules Schedules.
 * @return array
 */
function balewoo_cron_schedules( $schedules ) {
	$schedules['balewoo_five_minutes'] = array(
		'interval' => 5 * MINUTE_IN_SECONDS,
		'display'  => __( 'هر ۵ دقیقه (بله‌وو)', 'balewoo' ),
	);
	return $schedules;
}
add_filter( 'cron_schedules', 'balewoo_cron_schedules' );
