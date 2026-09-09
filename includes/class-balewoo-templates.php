<?php
/**
 * Message templates + Jalali date helpers.
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'BaleWoo_Templates' ) ) {

	/**
	 * Renders notification templates with order placeholders.
	 */
	class BaleWoo_Templates {

		/**
		 * Available placeholders (label => description).
		 *
		 * @return array
		 */
		public static function placeholders() {
			return array(
				'{order_id}'  => __( 'شماره سفارش', 'balewoo' ),
				'{total}'     => __( 'مبلغ سفارش', 'balewoo' ),
				'{customer}'  => __( 'نام مشتری', 'balewoo' ),
				'{phone}'     => __( 'تلفن مشتری', 'balewoo' ),
				'{date}'      => __( 'تاریخ سفارش', 'balewoo' ),
				'{items}'     => __( 'اقلام سفارش', 'balewoo' ),
				'{cards}'     => __( 'کارت‌های بانکی', 'balewoo' ),
				'{sheba}'     => __( 'شماره شبا', 'balewoo' ),
				'{order_url}' => __( 'لینک پیگیری مشتری', 'balewoo' ),
				'{admin_url}' => __( 'لینک مدیریت سفارش', 'balewoo' ),
				'{status}'    => __( 'وضعیت سفارش', 'balewoo' ),
				'{tracking}'  => __( 'کد پیگیری', 'balewoo' ),
				'{shop}'      => __( 'نام فروشگاه', 'balewoo' ),
			);
		}

		/**
		 * Render a template string.
		 *
		 * @param string $template Raw template.
		 * @param array  $vars     Placeholder values (without braces).
		 * @return string
		 */
		public static function apply( $template, $vars ) {
			$pairs = array();
			foreach ( $vars as $key => $value ) {
				$pairs[ '{' . $key . '}' ] = is_scalar( $value ) ? $value : '';
			}
			return strtr( (string) $template, $pairs );
		}

		/**
		 * Build placeholder values for an order.
		 *
		 * @param WC_Order|int $order Order object or id.
		 * @param array        $extra Extra vars.
		 * @return array
		 */
		public static function vars_for_order( $order, $extra = array() ) {
			$order = is_object( $order ) ? $order : wc_get_order( $order );

			if ( ! $order ) {
				return array();
			}

			$items = array();
			foreach ( $order->get_items() as $item ) {
				$items[] = sprintf( '• %s × %d', $item->get_name(), max( 1, (int) $item->get_quantity() ) );
			}

			$cards_text = self::cards_text();

			$vars = array(
				'order_id'  => $order->get_id(),
				'total'     => self::money( $order->get_total() ),
				'customer'  => trim( $order->get_formatted_billing_full_name() ),
				'phone'     => $order->get_billing_phone(),
				'date'      => self::jdate( $order->get_date_created() ? $order->get_date_created()->getTimestamp() : time(), 'Y/m/d H:i' ),
				'items'     => $items ? implode( "\n", $items ) : '—',
				'cards'     => $cards_text,
				'sheba'     => BaleWoo_Settings::get( 'sheba' ) ? __( 'شبا: ', 'balewoo' ) . BaleWoo_Settings::get( 'sheba' ) : '',
				'order_url' => $order->get_view_order_url(),
				'admin_url' => admin_url( 'post.php?post=' . $order->get_id() . '&action=edit' ),
				'status'    => wc_get_order_status_name( $order->get_status() ),
				'tracking'  => $order->get_meta( '_balewoo_tracking', true ),
				'shop'      => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ),
			);

			return wp_parse_args( $extra, $vars );
		}

		/**
		 * Render a named template.
		 *
		 * @param string       $key   Template setting key.
		 * @param WC_Order|int $order Order.
		 * @param array        $extra Extra vars.
		 * @return string
		 */
		public static function render( $key, $order, $extra = array() ) {
			$template = BaleWoo_Settings::get( $key );
			$vars     = self::vars_for_order( $order, $extra );
			$text     = self::apply( $template, $vars );

			/**
			 * Filter the rendered message.
			 */
			return apply_filters( 'balewoo_render_template', $text, $key, $order );
		}

		/**
		 * Bank cards block for messages.
		 *
		 * @return string
		 */
		public static function cards_text() {
			$cards = BaleWoo_Settings::cards();
			if ( empty( $cards ) ) {
				return '';
			}
			$lines = array( '💳 ' . __( 'کارت‌های بانکی:', 'balewoo' ) );
			foreach ( $cards as $card ) {
				$line = sprintf( '» %s', self::format_card( $card['number'] ) );
				if ( ! empty( $card['bank'] ) ) {
					$line .= ' — ' . $card['bank'];
				}
				if ( ! empty( $card['holder'] ) ) {
					$line .= ' (' . $card['holder'] . ')';
				}
				$lines[] = $line;
			}
			return implode( "\n", $lines );
		}

		/**
		 * Pretty card number: 6219-8610-1234-5678
		 *
		 * @param string $number Card number.
		 * @return string
		 */
		public static function format_card( $number ) {
			$digits = preg_replace( '/\D/', '', (string) $number );
			return trim( implode( '-', str_split( $digits, 4 ) ), '-' );
		}

		/**
		 * Format money with the shop currency.
		 *
		 * @param float|string $amount Amount.
		 * @return string
		 */
		public static function money( $amount ) {
			if ( function_exists( 'wc_price' ) ) {
				return wp_strip_all_tags( wc_price( $amount ) );
			}
			return number_format( (float) $amount ) . ' ' . get_woocommerce_currency();
		}

		/**
		 * Gregorian timestamp to Jalali date string.
		 *
		 * @param int|string $timestamp Unix timestamp or parsable date.
		 * @param string     $format    Output format (Y/m/d H:i supported).
		 * @return string
		 */
		public static function jdate( $timestamp = null, $format = 'Y/m/d' ) {
			if ( null === $timestamp ) {
				$timestamp = time();
			}
			if ( ! is_numeric( $timestamp ) ) {
				$timestamp = strtotime( (string) $timestamp );
			}
			$timestamp = (int) $timestamp;

			if ( function_exists( 'jdate' ) ) {
				return jdate( $format, $timestamp );
			}

			$tz_offset = (int) ( get_option( 'gmt_offset' ) * 3600 );
			$ts        = $timestamp + $tz_offset;

			list( $j_y, $j_m, $j_d ) = self::gregorian_to_jalali( gmdate( 'Y', $ts ), gmdate( 'n', $ts ), gmdate( 'j', $ts ) );

			$months = array( 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' );
			$days   = array( 'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه' );

			// نام روز هفته از روی timestamp میلادی (یکشنبه=0 ... شنبه=6) → شنبه=0.
			$greg_weekday = (int) gmdate( 'w', $ts );
			$jalali_index = ( $greg_weekday + 1 ) % 7;

			$map = array(
				'Y' => $j_y,
				'y' => substr( (string) $j_y, -2 ),
				'm' => str_pad( (string) $j_m, 2, '0', STR_PAD_LEFT ),
				'n' => $j_m,
				'F' => isset( $months[ $j_m - 1 ] ) ? $months[ $j_m - 1 ] : '',
				'd' => str_pad( (string) $j_d, 2, '0', STR_PAD_LEFT ),
				'j' => $j_d,
				'l' => isset( $days[ $jalali_index ] ) ? $days[ $jalali_index ] : '',
				'D' => isset( $days[ $jalali_index ] ) ? mb_substr( $days[ $jalali_index ], 0, 1 ) : '',
				'H' => gmdate( 'H', $ts ),
				'i' => gmdate( 'i', $ts ),
				's' => gmdate( 's', $ts ),
			);

			$out = '';
			$len = strlen( $format );
			for ( $i = 0; $i < $len; $i++ ) {
				$char = $format[ $i ];
				$out .= isset( $map[ $char ] ) ? $map[ $char ] : $char;
			}
			return $out;
		}

		/**
		 * Gregorian → Jalali conversion.
		 *
		 * @param int $g_y Year.
		 * @param int $g_m Month.
		 * @param int $g_d Day.
		 * @return array
		 */
		public static function gregorian_to_jalali( $g_y, $g_m, $g_d ) {
			$g_days_in_month = array( 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 );
			$j_days_in_month = array( 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29 );

			$gy = (int) $g_y - 1600;
			$gm = (int) $g_m - 1;
			$gd = (int) $g_d - 1;

			$g_day_no = 365 * $gy + (int) ( ( $gy + 3 ) / 4 ) - (int) ( ( $gy + 99 ) / 100 ) + (int) ( ( $gy + 399 ) / 400 );

			for ( $i = 0; $i < $gm; $i++ ) {
				$g_day_no += $g_days_in_month[ $i ];
			}
			if ( $gm > 1 && ( ( $gy % 4 === 0 && $gy % 100 !== 0 ) || ( $gy % 400 === 0 ) ) ) {
				$g_day_no++;
			}
			$g_day_no += $gd;

			$j_day_no  = $g_day_no - 79;
			$j_np      = (int) ( $j_day_no / 12053 );
			$j_day_no  = $j_day_no % 12053;
			$jy        = 979 + 33 * $j_np + 4 * (int) ( $j_day_no / 1461 );
			$j_day_no %= 1461;

			if ( $j_day_no >= 366 ) {
				$jy        += (int) ( ( $j_day_no - 1 ) / 365 );
				$j_day_no  = ( $j_day_no - 1 ) % 365;
			}

			$i = 0;
			for ( $i = 0; $i < 11 && $j_day_no >= $j_days_in_month[ $i ]; $i++ ) {
				$j_day_no -= $j_days_in_month[ $i ];
			}

			return array( $jy, $i + 1, $j_day_no + 1 );
		}

		/**
		 * Persian digits.
		 *
		 * @param string $value Input.
		 * @return string
		 */
		public static function digits( $value ) {
			$western = array( '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' );
			$persian = array( '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹' );
			return str_replace( $western, $persian, (string) $value );
		}
	}
}
