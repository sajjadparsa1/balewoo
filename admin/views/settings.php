<?php
/**
 * Settings view (tabbed).
 *
 * @package BaleWoo
 */

defined( 'ABSPATH' ) || exit;

$tabs = array(
	'general'  => __( 'عمومی', 'balewoo' ),
	'payment'  => __( 'پرداخت', 'balewoo' ),
	'notify'   => __( 'پیام‌رسانی', 'balewoo' ),
	'template' => __( 'قالب پیام', 'balewoo' ),
	'theme'    => __( 'ظاهر', 'balewoo' ),
	'tools'    => __( 'ابزارها', 'balewoo' ),
);

$active  = isset( $_GET['tab'] ) && isset( $tabs[ $_GET['tab'] ] ) ? sanitize_key( $_GET['tab'] ) : 'general';
$cards   = BaleWoo_Settings::cards();
$debug   = BaleWoo_Admin::debug_status();
$webhook_bale = BaleWoo_Settings::webhook_url( 'bale' );
$webhook_tg   = BaleWoo_Settings::webhook_url( 'telegram' );
?>
<div class="balewoo-tabs">
	<?php foreach ( $tabs as $slug => $label ) : ?>
		<a class="balewoo-tab<?php echo $active === $slug ? ' is-active' : ''; ?>" href="<?php echo esc_url( admin_url( 'admin.php?page=balewoo-settings&tab=' . $slug ) ); ?>"><?php echo esc_html( $label ); ?></a>
	<?php endforeach; ?>
</div>

<form class="balewoo-settings-form" id="balewoo-settings-form" onsubmit="return false;">

<?php if ( 'general' === $active ) : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'اتصال بله', 'balewoo' ); ?></h2>
			<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm balewoo-test-connection" data-platform="bale"><?php esc_html_e( 'تست اتصال', 'balewoo' ); ?></button>
		</header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'توکن ربات بله', 'balewoo' ); ?>
				<input type="text" name="settings[bale_token]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_token' ) ); ?>" placeholder="1234567890:AAF..." autocomplete="off">
				<span class="balewoo-hint"><?php esc_html_e( 'توکن را از @botfather در بله دریافت کنید.', 'balewoo' ); ?></span>
			</label>
			<label><?php esc_html_e( 'آدرس API بله', 'balewoo' ); ?>
				<input type="url" name="settings[bale_api_base]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_api_base' ) ); ?>">
			</label>
			<label><?php esc_html_e( 'آیدی مدیر بله (chat_id)', 'balewoo' ); ?>
				<input type="text" name="settings[bale_admin_chat_id]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_admin_chat_id' ) ); ?>">
				<span class="balewoo-hint"><?php esc_html_e( 'اگر خالی باشد، اولین کسی که /start را بزند به عنوان مدیر ثبت می‌شود.', 'balewoo' ); ?></span>
			</label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'اتصال تلگرام (اختیاری)', 'balewoo' ); ?></h2>
			<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm balewoo-test-connection" data-platform="telegram"><?php esc_html_e( 'تست اتصال', 'balewoo' ); ?></button>
		</header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'توکن ربات تلگرام', 'balewoo' ); ?>
				<input type="text" name="settings[telegram_token]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'telegram_token' ) ); ?>" autocomplete="off">
			</label>
			<label><?php esc_html_e( 'آیدی مدیر تلگرام', 'balewoo' ); ?>
				<input type="text" name="settings[telegram_admin_chat_id]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'telegram_admin_chat_id' ) ); ?>">
			</label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'آیدی مدیر و وب‌هوک', 'balewoo' ); ?></h2>
		</header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'شماره همراه مدیر (برای پیامک/سفیر)', 'balewoo' ); ?>
				<input type="text" name="settings[admin_phone]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'admin_phone' ) ); ?>" placeholder="09123456789">
			</label>

			<div class="balewoo-webhook-box">
				<div>
					<span class="balewoo-muted"><?php esc_html_e( 'URL وب‌هوک بله', 'balewoo' ); ?></span>
					<code class="balewoo-webhook-url"><?php echo esc_html( $webhook_bale ); ?></code>
				</div>
				<div class="balewoo-form-actions">
					<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm balewoo-copy" data-copy="<?php echo esc_attr( $webhook_bale ); ?>"><?php esc_html_e( 'کپی', 'balewoo' ); ?></button>
					<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm balewoo-set-webhook" data-platform="bale"><?php esc_html_e( 'ثبت', 'balewoo' ); ?></button>
				</div>
			</div>

			<div class="balewoo-webhook-box">
				<div>
					<span class="balewoo-muted"><?php esc_html_e( 'URL وب‌هوک تلگرام', 'balewoo' ); ?></span>
					<code class="balewoo-webhook-url"><?php echo esc_html( $webhook_tg ); ?></code>
				</div>
				<div class="balewoo-form-actions">
					<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm balewoo-copy" data-copy="<?php echo esc_attr( $webhook_tg ); ?>"><?php esc_html_e( 'کپی', 'balewoo' ); ?></button>
					<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm balewoo-set-webhook" data-platform="telegram"><?php esc_html_e( 'ثبت', 'balewoo' ); ?></button>
				</div>
			</div>

			<label><?php esc_html_e( 'فعال‌سازی شبیه‌ساز سناریو در داشبورد', 'balewoo' ); ?>
				<input type="checkbox" name="settings[enable_scenarios]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'enable_scenarios' ) ); ?>>
			</label>
		</div>
	</section>

<?php elseif ( 'payment' === $active ) : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'روش‌های پرداخت', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<label><input type="checkbox" name="settings[gateway_enabled]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'gateway_enabled' ) ); ?>> <?php esc_html_e( 'فعال‌سازی درگاه‌های بله‌وو', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[bale_pay_enabled]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'bale_pay_enabled' ) ); ?>> <?php esc_html_e( 'پرداخت آنلاین با کیف پول بله', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[card_pay_enabled]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'card_pay_enabled' ) ); ?>> <?php esc_html_e( 'پرداخت کارت به کارت', 'balewoo' ); ?></label>

			<label><?php esc_html_e( 'توکن پرداخت بله (Provider Token)', 'balewoo' ); ?>
				<input type="text" name="settings[bale_provider_token]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_provider_token' ) ); ?>" autocomplete="off">
				<span class="balewoo-hint"><?php esc_html_e( 'از @botfather در بله (بخش Payments) دریافت می‌شود.', 'balewoo' ); ?></span>
			</label>

			<label><?php esc_html_e( 'واحد مبلغ ارسالی به بله', 'balewoo' ); ?>
				<select name="settings[amount_unit]">
					<option value="toman" <?php selected( BaleWoo_Settings::get( 'amount_unit' ), 'toman' ); ?>><?php esc_html_e( 'تومان', 'balewoo' ); ?></option>
					<option value="rial" <?php selected( BaleWoo_Settings::get( 'amount_unit' ), 'rial' ); ?>><?php esc_html_e( 'ریال', 'balewoo' ); ?></option>
				</select>
			</label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head">
			<h2><?php esc_html_e( 'کارت‌های بانکی', 'balewoo' ); ?></h2>
			<button type="button" class="balewoo-btn balewoo-btn-ghost balewoo-btn-sm" id="balewoo-add-card"><?php esc_html_e( 'افزودن کارت جدید', 'balewoo' ); ?></button>
		</header>

		<div class="balewoo-cards" id="balewoo-cards">
			<?php if ( empty( $cards ) ) : ?>
				<?php $cards = array( array( 'number' => '', 'bank' => '', 'holder' => '' ) ); ?>
			<?php endif; ?>
			<?php foreach ( $cards as $index => $card ) : ?>
				<div class="balewoo-card-row">
					<input type="text" name="settings[cards][<?php echo esc_attr( $index ); ?>][number]" value="<?php echo esc_attr( $card['number'] ); ?>" placeholder="<?php esc_attr_e( 'شماره کارت', 'balewoo' ); ?>" inputmode="numeric">
					<input type="text" name="settings[cards][<?php echo esc_attr( $index ); ?>][bank]" value="<?php echo esc_attr( $card['bank'] ); ?>" placeholder="<?php esc_attr_e( 'نام بانک', 'balewoo' ); ?>">
					<input type="text" name="settings[cards][<?php echo esc_attr( $index ); ?>][holder]" value="<?php echo esc_attr( $card['holder'] ); ?>" placeholder="<?php esc_attr_e( 'نام صاحب حساب', 'balewoo' ); ?>">
					<button type="button" class="button balewoo-remove-card">✕</button>
				</div>
			<?php endforeach; ?>
		</div>

		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'شماره شبا', 'balewoo' ); ?>
				<input type="text" name="settings[sheba]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'sheba' ) ); ?>" placeholder="IR000000000000000000000000">
			</label>
			<label><?php esc_html_e( 'مهلت پرداخت (ساعت)', 'balewoo' ); ?>
				<input type="number" min="1" name="settings[payment_deadline_hours]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'payment_deadline_hours' ) ); ?>">
			</label>
			<label><?php esc_html_e( 'وضعیت پس از تأیید', 'balewoo' ); ?>
				<select name="settings[status_after_approval]">
					<option value="processing" <?php selected( BaleWoo_Settings::get( 'status_after_approval' ), 'processing' ); ?>><?php esc_html_e( 'در حال پردازش (processing)', 'balewoo' ); ?></option>
					<option value="completed" <?php selected( BaleWoo_Settings::get( 'status_after_approval' ), 'completed' ); ?>><?php esc_html_e( 'تکمیل شده (completed)', 'balewoo' ); ?></option>
				</select>
			</label>
			<label><?php esc_html_e( 'متن راهنمای پرداخت', 'balewoo' ); ?>
				<textarea name="settings[payment_guide_text]" rows="4"><?php echo esc_textarea( BaleWoo_Settings::get( 'payment_guide_text' ) ); ?></textarea>
			</label>
		</div>
	</section>

<?php elseif ( 'notify' === $active ) : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'تنظیمات ارسال اعلان', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<h3><?php esc_html_e( 'اعلان به مشتری', 'balewoo' ); ?></h3>
			<label><input type="checkbox" name="settings[notify_customer_bale]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'notify_customer_bale' ) ); ?>> <?php esc_html_e( 'ارسال از طریق بله', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[notify_customer_telegram]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'notify_customer_telegram' ) ); ?>> <?php esc_html_e( 'ارسال از طریق تلگرام', 'balewoo' ); ?></label>

			<h3><?php esc_html_e( 'اعلان به مدیر', 'balewoo' ); ?></h3>
			<label><input type="checkbox" name="settings[notify_admin_bale]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'notify_admin_bale' ) ); ?>> <?php esc_html_e( 'ارسال از طریق بله', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[notify_admin_telegram]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'notify_admin_telegram' ) ); ?>> <?php esc_html_e( 'ارسال از طریق تلگرام', 'balewoo' ); ?></label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'سفیر بله (ارسال با شماره تلفن)', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<p class="balewoo-hint"><?php esc_html_e( 'سفیر بله اجازه می‌دهد به کاربران بله با شماره تلفن پیام بفرستید — حتی اگر ربات را start نکرده باشند.', 'balewoo' ); ?></p>
			<label><?php esc_html_e( 'API Access Key', 'balewoo' ); ?>
				<input type="text" name="settings[safir_key]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'safir_key' ) ); ?>" autocomplete="off">
			</label>
			<label><?php esc_html_e( 'Bot ID', 'balewoo' ); ?>
				<input type="text" name="settings[safir_bot_id]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'safir_bot_id' ) ); ?>">
			</label>
			<label><input type="checkbox" name="settings[safir_enabled]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'safir_enabled' ) ); ?>> <?php esc_html_e( 'فعال‌سازی سفیر', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[safir_to_customer]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'safir_to_customer' ) ); ?>> <?php esc_html_e( 'ارسال پیام بله به مشتری از طریق سفیر', 'balewoo' ); ?></label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'پیامک (ملی پیامک)', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'نام کاربری ملی پیامک', 'balewoo' ); ?>
				<input type="text" name="settings[sms_username]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'sms_username' ) ); ?>" autocomplete="off">
			</label>
			<label><?php esc_html_e( 'رمز عبور', 'balewoo' ); ?>
				<input type="password" name="settings[sms_password]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'sms_password' ) ); ?>" autocomplete="new-password">
			</label>
			<label><?php esc_html_e( 'شماره فرستنده', 'balewoo' ); ?>
				<input type="text" name="settings[sms_from]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'sms_from' ) ); ?>">
			</label>
			<label><?php esc_html_e( 'آدرس وب‌سرویس', 'balewoo' ); ?>
				<input type="url" name="settings[sms_endpoint]" value="<?php echo esc_attr( BaleWoo_Settings::get( 'sms_endpoint' ) ); ?>">
			</label>
			<label><input type="checkbox" name="settings[sms_enabled]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'sms_enabled' ) ); ?>> <?php esc_html_e( 'فعال‌سازی پیامک', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[sms_flash]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'sms_flash' ) ); ?>> <?php esc_html_e( 'پیامک فلش', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[sms_to_customer]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'sms_to_customer' ) ); ?>> <?php esc_html_e( 'ارسال پیامک به مشتری', 'balewoo' ); ?></label>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'اولویت کانال‌ها', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<ol class="balewoo-priority">
				<li><strong><?php esc_html_e( 'ربات بله/تلگرام', 'balewoo' ); ?></strong> — <?php esc_html_e( 'رایگان (اگر کاربر متصل باشد)', 'balewoo' ); ?></li>
				<li><strong><?php esc_html_e( 'سفیر بله', 'balewoo' ); ?></strong> — <?php esc_html_e( 'با شماره تلفن (پرداختی)', 'balewoo' ); ?></li>
				<li><strong><?php esc_html_e( 'SMS', 'balewoo' ); ?></strong> — <?php esc_html_e( 'با شماره تلفن (پرداختی)', 'balewoo' ); ?></li>
			</ol>
			<?php $priority = BaleWoo_Settings::get( 'channel_priority', array( 'bale_bot', 'safir', 'sms' ) ); ?>
			<input type="hidden" name="settings[channel_priority][]" value="">
			<label><input type="checkbox" name="settings[channel_priority][]" value="bale_bot" <?php checked( in_array( 'bale_bot', (array) $priority, true ) ); ?>> <?php esc_html_e( 'ربات بله', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[channel_priority][]" value="telegram" <?php checked( in_array( 'telegram', (array) $priority, true ) ); ?>> <?php esc_html_e( 'ربات تلگرام', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[channel_priority][]" value="safir" <?php checked( in_array( 'safir', (array) $priority, true ) ); ?>> <?php esc_html_e( 'سفیر', 'balewoo' ); ?></label>
			<label><input type="checkbox" name="settings[channel_priority][]" value="sms" <?php checked( in_array( 'sms', (array) $priority, true ) ); ?>> <?php esc_html_e( 'پیامک', 'balewoo' ); ?></label>
		</div>
	</section>

<?php elseif ( 'template' === $active ) : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'قالب‌های پیام به مشتری', 'balewoo' ); ?></h2></header>
		<div class="balewoo-placeholders">
			<?php foreach ( BaleWoo_Templates::placeholders() as $key => $label ) : ?>
				<code title="<?php echo esc_attr( $label ); ?>"><?php echo esc_html( $key ); ?></code>
			<?php endforeach; ?>
		</div>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'پیام ثبت سفارش', 'balewoo' ); ?>
				<textarea name="settings[tpl_customer_new]" rows="7"><?php echo esc_textarea( BaleWoo_Settings::get( 'tpl_customer_new' ) ); ?></textarea>
			</label>
			<label><?php esc_html_e( 'پیام تأیید پرداخت', 'balewoo' ); ?>
				<textarea name="settings[tpl_customer_paid]" rows="5"><?php echo esc_textarea( BaleWoo_Settings::get( 'tpl_customer_paid' ) ); ?></textarea>
			</label>
			<label><?php esc_html_e( 'پیام رد پرداخت', 'balewoo' ); ?>
				<textarea name="settings[tpl_customer_reject]" rows="5"><?php echo esc_textarea( BaleWoo_Settings::get( 'tpl_customer_reject' ) ); ?></textarea>
			</label>
			<label><?php esc_html_e( 'پیام سفارش جدید (به مدیر)', 'balewoo' ); ?>
				<textarea name="settings[tpl_admin_new]" rows="6"><?php echo esc_textarea( BaleWoo_Settings::get( 'tpl_admin_new' ) ); ?></textarea>
			</label>
		</div>
	</section>

<?php elseif ( 'theme' === $active ) : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'انتخاب تم رنگی', 'balewoo' ); ?></h2></header>
		<div class="balewoo-theme-picker">
			<?php
			$themes = array(
				'blue'      => array( 'آبی بله', '#0d6efd', '#0b5ed7' ),
				'green'     => array( 'سبز مشکی', '#198754', '#146c43' ),
				'purple'    => array( 'بنفش آبی', '#6f42c1', '#563d7c' ),
				'orange'    => array( 'نارنجی سفید', '#fd7e14', '#e8590c' ),
				'red'       => array( 'قرمز مشکی', '#dc3545', '#b02a37' ),
				'gold'      => array( 'طلایی مشکی', '#d4a017', '#b8860b' ),
				'turquoise' => array( 'فیروزه‌ای آبی', '#0dcaf0', '#0aa2c0' ),
			);
			foreach ( $themes as $slug => $theme ) :
				?>
				<label class="balewoo-theme-option">
					<input type="radio" name="settings[theme]" value="<?php echo esc_attr( $slug ); ?>" <?php checked( BaleWoo_Settings::get( 'theme' ), $slug ); ?>>
					<span class="balewoo-theme-swatch" style="background:linear-gradient(135deg, <?php echo esc_attr( $theme[1] ); ?>, <?php echo esc_attr( $theme[2] ); ?>)"></span>
					<span><?php echo esc_html( $theme[0] ); ?></span>
				</label>
			<?php endforeach; ?>
		</div>
		<div class="balewoo-form balewoo-block-form">
			<label><input type="checkbox" name="settings[dark_mode]" value="yes" <?php checked( BaleWoo_Settings::is_on( 'dark_mode' ) ); ?>> <?php esc_html_e( 'حالت تاریک', 'balewoo' ); ?></label>
		</div>
	</section>

<?php else : ?>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'تست ارسال پیام', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?>
				<select id="balewoo-test-platform">
					<option value="bale"><?php esc_html_e( 'بله', 'balewoo' ); ?></option>
					<option value="telegram"><?php esc_html_e( 'تلگرام', 'balewoo' ); ?></option>
				</select>
			</label>
			<label><?php esc_html_e( 'آیدی گیرنده (chat_id)', 'balewoo' ); ?>
				<input type="text" id="balewoo-test-chat" value="<?php echo esc_attr( BaleWoo_Settings::get( 'bale_admin_chat_id' ) ); ?>">
			</label>
			<label><?php esc_html_e( 'متن پیام', 'balewoo' ); ?>
				<textarea id="balewoo-test-text" rows="3"><?php echo esc_textarea( __( 'این یک پیام تست از بله‌وو است ✅', 'balewoo' ) ); ?></textarea>
			</label>
			<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm" id="balewoo-test-message"><?php esc_html_e( 'ارسال', 'balewoo' ); ?></button>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'تست وب‌هوک', 'balewoo' ); ?></h2></header>
		<div class="balewoo-form balewoo-block-form">
			<label><?php esc_html_e( 'پلتفرم', 'balewoo' ); ?>
				<select id="balewoo-hook-platform">
					<option value="bale"><?php esc_html_e( 'بله', 'balewoo' ); ?></option>
					<option value="telegram"><?php esc_html_e( 'تلگرام', 'balewoo' ); ?></option>
				</select>
			</label>
			<label><?php esc_html_e( 'نوع تست', 'balewoo' ); ?>
				<select id="balewoo-hook-type">
					<option value="payment"><?php esc_html_e( 'شبیه‌سازی پرداخت موفق', 'balewoo' ); ?></option>
					<option value="approve"><?php esc_html_e( 'شبیه‌سازی callback تأیید', 'balewoo' ); ?></option>
					<option value="reject"><?php esc_html_e( 'شبیه‌سازی callback رد', 'balewoo' ); ?></option>
					<option value="start"><?php esc_html_e( 'شبیه‌سازی /start', 'balewoo' ); ?></option>
					<option value="receipt"><?php esc_html_e( 'شبیه‌سازی آپلود رسید', 'balewoo' ); ?></option>
				</select>
			</label>
			<label><?php esc_html_e( 'شماره سفارش', 'balewoo' ); ?>
				<input type="number" id="balewoo-hook-order" placeholder="<?php esc_attr_e( 'خالی = آخرین سفارش', 'balewoo' ); ?>">
			</label>
			<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-btn-sm" id="balewoo-test-webhook"><?php esc_html_e( 'اجرای تست', 'balewoo' ); ?></button>
			<div class="balewoo-webhook-response" id="balewoo-webhook-response">200 OK · { "ok": true, "result": "processed" }</div>
		</div>
	</section>

	<section class="balewoo-card">
		<header class="balewoo-card-head"><h2><?php esc_html_e( 'دیباگ وضعیت تنظیمات', 'balewoo' ); ?></h2></header>
		<pre class="balewoo-debug">=== BaleWoo Settings Status ===
<?php foreach ( $debug['rows'] as $row ) : ?>
<?php echo esc_html( $row['key'] . ': ' . $row['value'] ); ?>
<?php endforeach; ?>

<?php echo $debug['ready'] ? esc_html__( 'همه تنظیمات ضروری درست هستند', 'balewoo' ) : esc_html__( 'برخی تنظیمات ضروری ناقص است', 'balewoo' ); ?></pre>
	</section>

<?php endif; ?>

	<div class="balewoo-form-actions balewoo-sticky-actions">
		<button type="button" class="balewoo-btn balewoo-btn-primary balewoo-save-settings"><?php esc_html_e( 'ذخیره تنظیمات', 'balewoo' ); ?></button>
		<span class="balewoo-save-result"></span>
	</div>
</form>
