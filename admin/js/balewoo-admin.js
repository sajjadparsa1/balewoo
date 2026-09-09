/**
 * BaleWoo — admin scripts
 */
(function ($) {
	'use strict';

	var BaleWoo = {
		ajax: window.balewooAdmin ? window.balewooAdmin.ajax : ajaxurl,
		nonce: window.balewooAdmin ? window.balewooAdmin.nonce : '',
		i18n: window.balewooAdmin ? window.balewooAdmin.i18n : {}
	};

	function toast(message, type) {
		$('.balewoo-toast').remove();
		var $el = $('<div class="balewoo-toast ' + (type ? 'is-' + type : '') + '"></div>').text(message);
		$('body').append($el);
		setTimeout(function () { $el.fadeOut(200, function () { $(this).remove(); }); }, 3200);
	}

	function post(action, data, onDone) {
		data = $.extend({ action: action, nonce: BaleWoo.nonce }, data || {});
		return $.post(BaleWoo.ajax, data).done(function (response) {
			if (response && response.success) {
				if (typeof onDone === 'function') { onDone(response.data); }
			} else {
				var msg = (response && response.data && response.data.message) ? response.data.message : BaleWoo.i18n.error;
				toast(msg, 'error');
			}
		}).fail(function () {
			toast(BaleWoo.i18n.error, 'error');
		});
	}

	/* ------------------------------------------------------------------ */
	/* تنظیمات                                                             */
	/* ------------------------------------------------------------------ */

	$(document).on('click', '.balewoo-save-settings', function () {
		var $btn = $(this);
		var $form = $btn.closest('form');
		var raw = $form.length ? $form.serializeArray() : [];
		var settings = {};
		var keys = [];

		$.each(raw, function (_, field) {
			var match = field.name.match(/^settings\[([\w-]+)\](?:\[\])?(?:\[(\w+)\])?$/);
			if (!match) { return; }
			var key = match[1];
			if (keys.indexOf(key) === -1) { keys.push(key); }
			if (match[2] !== undefined) {
				// settings[cards][0][number]
				var indexMatch = field.name.match(/settings\[cards\]\[(\d+)\]\[(\w+)\]/);
				if (indexMatch) {
					settings.cards = settings.cards || {};
					settings.cards[indexMatch[1]] = settings.cards[indexMatch[1]] || {};
					settings.cards[indexMatch[1]][indexMatch[2]] = field.value;
				}
				return;
			}
			if (field.name.indexOf('[]') > -1) {
				if (!field.value) { return; }
				settings[key] = settings[key] || [];
				settings[key].push(field.value);
				return;
			}
			settings[key] = field.value;
		});

		// تبدیل کارت‌ها به آرایه
		if (settings.cards) {
			settings.cards = Object.keys(settings.cards).map(function (i) { return settings.cards[i]; });
		}

		// فقط کلیدهای همین فرم به‌روزرسانی شوند (چک‌باکس‌های تیک‌نخورده خاموش می‌شوند).
		settings._keys = keys.join(',');

		$btn.prop('disabled', true);
		post('balewoo_save_settings', { settings: settings }, function (data) {
			toast(data.message || BaleWoo.i18n.saved, 'success');
			$('.balewoo-save-result').text(data.message || BaleWoo.i18n.saved);
		}).always(function () { $btn.prop('disabled', false); });
	});

	$(document).on('click', '#balewoo-add-card', function () {
		var index = $('#balewoo-cards .balewoo-card-row').length;
		var row = '<div class="balewoo-card-row">' +
			'<input type="text" name="settings[cards][' + index + '][number]" placeholder="شماره کارت" inputmode="numeric">' +
			'<input type="text" name="settings[cards][' + index + '][bank]" placeholder="نام بانک">' +
			'<input type="text" name="settings[cards][' + index + '][holder]" placeholder="نام صاحب حساب">' +
			'<button type="button" class="button balewoo-remove-card">✕</button></div>';
		$('#balewoo-cards').append(row);
	});

	$(document).on('click', '.balewoo-remove-card', function () {
		$(this).closest('.balewoo-card-row').remove();
	});

	$(document).on('click', '.balewoo-copy', function () {
		var text = $(this).data('copy');
		if (navigator.clipboard) {
			navigator.clipboard.writeText(text);
			toast(BaleWoo.i18n.copied, 'success');
		}
	});

	/* ------------------------------------------------------------------ */
	/* تست‌ها                                                              */
	/* ------------------------------------------------------------------ */

	$(document).on('click', '.balewoo-test-connection', function () {
		var $btn = $(this);
		var platform = $btn.data('platform');
		var token = $btn.closest('.balewoo-card').find('input[name="settings[' + platform + '_token]"]').val();

		$btn.prop('disabled', true).text(BaleWoo.i18n.testing);
		post('balewoo_test_connection', { platform: platform, token: token }, function (data) {
			toast(data.message, 'success');
		}).always(function () { $btn.prop('disabled', false).text('تست اتصال'); });
	});

	$(document).on('click', '.balewoo-set-webhook', function () {
		var $btn = $(this);
		$btn.prop('disabled', true);
		post('balewoo_set_webhook', { platform: $btn.data('platform') }, function (data) {
			toast(data.message, 'success');
		}).always(function () { $btn.prop('disabled', false); });
	});

	$(document).on('click', '#balewoo-test-message', function () {
		post('balewoo_test_message', {
			platform: $('#balewoo-test-platform').val(),
			chat_id: $('#balewoo-test-chat').val(),
			message: $('#balewoo-test-text').val()
		}, function (data) { toast(data.message, 'success'); });
	});

	$(document).on('click', '#balewoo-test-webhook', function () {
		var $box = $('#balewoo-webhook-response');
		$box.text('…');
		post('balewoo_webhook_test', {
			platform: $('#balewoo-hook-platform').val(),
			type: $('#balewoo-hook-type').val(),
			order_id: $('#balewoo-hook-order').val()
		}, function (data) {
			$box.text((data.status || 200) + ' · ' + JSON.stringify(data.response));
			toast(data.message, 'success');
		});
	});

	$(document).on('click', '#balewoo-send-report, #balewoo-send-report-weekly', function () {
		var days = $(this).data('days');
		post('balewoo_send_report', { days: days }, function (data) { toast(data.message, 'success'); });
	});

	/* ------------------------------------------------------------------ */
	/* تراکنش‌ها                                                            */
	/* ------------------------------------------------------------------ */

	function loadTransactions(page) {
		var $form = $('#balewoo-filter-form');
		var data = {
			status: $form.find('[name="status"]').val(),
			platform: $form.find('[name="platform"]').val(),
			from: $form.find('[name="from"]').val(),
			to: $form.find('[name="to"]').val(),
			search: $form.find('[name="search"]').val(),
			per_page: 20,
			paged: page || 1
		};

		post('balewoo_transactions', data, function (response) {
			$('#balewoo-transactions-body').html(response.html);
			$('#balewoo-total-count').text(response.total + ' مورد');
			$('#balewoo-current-page').val(page || 1);
			$('#balewoo-total-pages').val(response.pages);
			$('#balewoo-prev').data('page', Math.max(1, (page || 1) - 1)).prop('disabled', (page || 1) <= 1);
			$('#balewoo-next').data('page', (page || 1) + 1).prop('disabled', (page || 1) >= response.pages);
		});
	}

	$(document).on('click', '#balewoo-filter-apply', function () { loadTransactions(1); });
	$(document).on('click', '#balewoo-filter-reset', function () {
		$('#balewoo-filter-form').find('input, select').val('');
		loadTransactions(1);
	});
	$(document).on('click', '#balewoo-prev, #balewoo-next', function () {
		loadTransactions($(this).data('page'));
	});

	$(document).on('click', '.balewoo-order-action', function () {
		var $btn = $(this);
		$btn.prop('disabled', true);
		post('balewoo_order_action', {
			order_id: $btn.data('order'),
			order_action: $btn.data('action')
		}, function (data) {
			toast(data.message, 'success');
			setTimeout(function () { window.location.reload(); }, 900);
		}).always(function () { $btn.prop('disabled', false); });
	});

	/* ------------------------------------------------------------------ */
	/* ارسال گروهی                                                         */
	/* ------------------------------------------------------------------ */

	function updatePreview() {
		var $form = $('#balewoo-broadcast-form');
		if (!$form.length) { return; }
		post('balewoo_broadcast_preview', {
			title: $form.find('[name="title"]').val(),
			body: $form.find('[name="body"]').val(),
			audience: $form.find('[name="audience"]').val()
		}, function (data) {
			$('#balewoo-broadcast-preview').html(data.preview);
			$('#balewoo-broadcast-count').text(data.recipients + ' گیرنده');
		});
	}

	$(document).on('input', '#balewoo-broadcast-form input, #balewoo-broadcast-form textarea', debounce(updatePreview, 400));
	$(document).on('change', '#balewoo-broadcast-form select', updatePreview);

	$(document).on('click', '#balewoo-broadcast-send, #balewoo-broadcast-test', function () {
		var $btn = $(this);
		var isTest = $btn.attr('id') === 'balewoo-broadcast-test';
		var $form = $('#balewoo-broadcast-form');

		$btn.prop('disabled', true).text(BaleWoo.i18n.sending);
		post('balewoo_send_broadcast', {
			audience: $form.find('[name="audience"]').val(),
			platform: $form.find('[name="platform"]').val(),
			title: $form.find('[name="title"]').val(),
			body: $form.find('[name="body"]').val(),
			test: isTest ? 1 : 0
		}, function (data) {
			toast(data.message, 'success');
			if (!isTest) { setTimeout(function () { window.location.reload(); }, 1200); }
		}).always(function () {
			$btn.prop('disabled', false).text(isTest ? 'ارسال تست' : 'ارسال');
		});
	});

	/* ------------------------------------------------------------------ */
	/* سناریو                                                              */
	/* ------------------------------------------------------------------ */

	function pushMessage(side, text, keyboard) {
		var $target = side === 'admin' ? $('#balewoo-chat-admin') : $('#balewoo-chat-customer');
		$target.find('.balewoo-muted').remove();
		var $msg = $('<div class="balewoo-msg"></div>').text(text);
		if (keyboard) {
			$msg.append('<div style="margin-top:6px;font-size:11px;opacity:.8">[✅ تأیید] [❌ رد] [↩️ بازگشت]</div>');
		}
		if (side === 'system') {
			$('<div class="balewoo-msg is-system"></div>').text(text).appendTo('#balewoo-chat-admin');
		}
		$target.append($msg);
		$target.scrollTop($target[0].scrollHeight);
	}

	$(document).on('click', '[data-scenario]', function () {
		var step = $(this).data('scenario');
		var orderId = $('#balewoo-scenario-status').data('order');

		if (step === 'reset') {
			$('#balewoo-chat-customer, #balewoo-chat-admin').empty();
			$('#balewoo-scenario-status').text('').removeData('order');
		}

		post('balewoo_scenario', { step: step, order_id: orderId || 0 }, function (data) {
			if (data.events) {
				$.each(data.events, function (_, event) {
					pushMessage(event.side, event.text, event.keyboard);
				});
			}
			if (data.order_id) {
				$('#balewoo-scenario-status').data('order', data.order_id).text('سفارش #' + data.order_id + ' — ' + data.status);
			}
		});
	});

	/* ------------------------------------------------------------------ */
	/* مدیر و متفرقه                                                        */
	/* ------------------------------------------------------------------ */

	$(document).on('click', '#balewoo-save-manager', function () {
		var $form = $(this).closest('form');
		var chatId = $form.find('[name="bale_admin_chat_id"]').val();
		post('balewoo_set_manager', { platform: 'bale', chat_id: chatId }, function (data) {
			toast(data.message, 'success');
		});
		post('balewoo_save_settings', { settings: { bale_admin_chat_id: chatId, _keys: 'bale_admin_chat_id' } });
	});

	$(document).on('click', '#balewoo-set-manager', function () {
		var chatId = window.prompt('آیدی مدیر (chat_id) را وارد کنید:', '');
		if (!chatId) { return; }
		post('balewoo_set_manager', { platform: 'bale', chat_id: chatId }, function (data) {
			toast(data.message, 'success');
			setTimeout(function () { window.location.reload(); }, 800);
		});
	});

	$(document).on('click', '#balewoo-clear-logs', function () {
		if (!window.confirm(BaleWoo.i18n.confirm)) { return; }
		post('balewoo_clear_logs', {}, function (data) {
			toast(data.message, 'success');
			$('.balewoo-logs').html('<p class="balewoo-empty">لاگی ثبت نشده است.</p>');
		});
	});

	$(document).on('change', '#balewoo-log-level', function () {
		var level = $(this).val();
		var url = window.location.href.split('&level=')[0];
		window.location.href = url + (level ? '&level=' + level : '');
	});

	$(document).on('click', '#balewoo-toggle-dark', function () {
		$('.balewoo-wrap').toggleClass('balewoo-dark');
		post('balewoo_save_settings', { settings: { dark_mode: $('.balewoo-wrap').hasClass('balewoo-dark') ? 'yes' : 'no', _keys: 'dark_mode' } });
	});

	$(document).on('click', '.balewoo-notice .notice-dismiss', function () {
		post('balewoo_dismiss_notice', {});
	});

	function debounce(fn, wait) {
		var timeout;
		return function () {
			var context = this, args = arguments;
			clearTimeout(timeout);
			timeout = setTimeout(function () { fn.apply(context, args); }, wait);
		};
	}
})(jQuery);
