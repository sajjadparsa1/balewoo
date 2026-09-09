/**
 * BaleWoo — front-end scripts
 */
(function ($) {
	'use strict';

	var config = window.balewooFront || {};
	var i18n = config.i18n || {};

	/**
	 * بررسی وضعیت پرداخت از طریق REST.
	 */
	function checkStatus($el, redirect) {
		var orderId = $el.data('order');
		var key = $el.data('key');

		if (!orderId) { return; }

		$.ajax({
			url: config.rest ? config.rest + orderId : (config.ajax || ''),
			type: 'GET',
			dataType: 'json',
			data: { key: key },
			success: function (response) {
				if (!response) { return; }

				if (response.failed) {
					$el.find('.balewoo-pay-status-text, .balewoo-pay-status').text(i18n.failed || 'پرداخت ناموفق بود.');
					$el.addClass('is-failed');
					window.clearInterval(window.balewooTimer);
					return;
				}

				if (response.paid) {
					$el.addClass('is-paid')
						.find('.balewoo-pay-status-text, .balewoo-pay-status').text(i18n.paid || 'پرداخت تأیید شد.');
					window.clearInterval(window.balewooTimer);
					if (redirect !== false && response.redirect) {
						window.location.href = response.redirect;
					}
				}
			}
		});
	}

	$(function () {
		var $status = $('#balewoo-pay-status');

		if ($status.length) {
			checkStatus($status, false);
			window.balewooTimer = window.setInterval(function () {
				checkStatus($status, true);
			}, 5000);

			$('#balewoo-pay-check').on('click', function () {
				checkStatus($status, true);
			});
		}

		/* کپی شماره کارت */
		$(document).on('click', '.balewoo-copy-card', function () {
			var $row = $(this).closest('li');
			var number = $row.find('.balewoo-card-number').data('card');

			if (navigator.clipboard && number) {
				navigator.clipboard.writeText(String(number));
				$(this).text(i18n.copied || 'کپی شد ✓');
				var $btn = $(this);
				setTimeout(function () { $btn.text('کپی'); }, 1800);
			}
		});

		/* ارسال رسید */
		$(document).on('submit', '.balewoo-receipt-form', function (event) {
			event.preventDefault();

			var $form = $(this);
			var $message = $form.find('.balewoo-receipt-message');
			var formData = new FormData($form[0]);
			formData.append('action', 'balewoo_upload_receipt');

			$message.removeClass('is-error is-ok').text(i18n.upload || 'در حال ارسال…');

			$.ajax({
				url: config.ajax || ajaxurl,
				type: 'POST',
				data: formData,
				processData: false,
				contentType: false,
				success: function (response) {
					if (response && response.success) {
						$message.addClass('is-ok').text(response.data.message);
						setTimeout(function () { window.location.reload(); }, 1600);
					} else {
						$message.addClass('is-error').text((response && response.data && response.data.message) || 'خطا در ارسال رسید.');
					}
				},
				error: function () {
					$message.addClass('is-error').text('خطا در ارتباط با سرور.');
				}
			});
		});
	});
})(jQuery);
