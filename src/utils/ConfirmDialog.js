
let _stylesInjected = false;

function _injectStyles () {
	if (_stylesInjected) return;
	_stylesInjected = true;

	const css = `
.potree-confirm-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	z-index: 99999;
	display: flex;
	align-items: center;
	justify-content: center;
	animation: potree-confirm-fadein 0.12s ease;
}
@keyframes potree-confirm-fadein {
	from { opacity: 0; }
	to   { opacity: 1; }
}
.potree-confirm-dialog {
	background: #1a2426;
	border: 1px solid #333;
	border-radius: 6px;
	padding: 24px 28px;
	min-width: 300px;
	max-width: 420px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75);
	animation: potree-confirm-slidein 0.12s ease;
	font-family: Arial, sans-serif;
}
@keyframes potree-confirm-slidein {
	from { transform: translateY(-8px); opacity: 0; }
	to   { transform: translateY(0);    opacity: 1; }
}
.potree-confirm-title {
	font-size: 13px;
	font-weight: bold;
	color: #ddd;
	margin-bottom: 10px;
}
.potree-confirm-body {
	font-size: 12px;
	color: #999;
	margin-bottom: 22px;
	line-height: 1.55;
	word-break: break-word;
}
.potree-confirm-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
.potree-confirm-btn {
	padding: 6px 16px;
	border-radius: 4px;
	font-size: 12px;
	font-family: Arial, sans-serif;
	cursor: pointer;
	border: 1px solid #444;
	outline: none;
	transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.potree-confirm-btn:focus-visible {
	box-shadow: 0 0 0 2px rgba(100, 160, 220, 0.5);
}
.potree-confirm-cancel {
	background: #252f32;
	color: #aaa;
	border-color: #3a4548;
}
.potree-confirm-cancel:hover {
	background: #2e3c40;
	border-color: #4e5d62;
	color: #ccc;
}
.potree-confirm-ok {
	background: #2e1c1c;
	color: #e06060;
	border-color: #5a2e2e;
}
.potree-confirm-ok:hover {
	background: #3d2424;
	border-color: #7a3a3a;
	color: #f07878;
}
.potree-confirm-ok.neutral {
	background: #1c2a38;
	color: #6090c0;
	border-color: #2e4a6a;
}
.potree-confirm-ok.neutral:hover {
	background: #223448;
	border-color: #3a6090;
	color: #80b0e0;
}
`;

	let style = document.createElement('style');
	style.textContent = css;
	document.head.appendChild(style);
}

function _esc (s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Show a custom dark-themed confirmation dialog.
 *
 * @param {object} opts
 * @param {string} opts.title          - Dialog heading
 * @param {string} opts.message        - Body text (plain text, will be HTML-escaped)
 * @param {string} [opts.confirmLabel] - Label for the confirm button (default "Confirm")
 * @param {boolean} [opts.danger]      - True (default) = red confirm button; false = blue
 * @returns {Promise<boolean>}         - Resolves true if confirmed, false if cancelled
 */
export function showConfirmDialog ({ title, message, confirmLabel = 'Confirm', danger = true }) {
	_injectStyles();

	return new Promise(resolve => {
		let overlay = document.createElement('div');
		overlay.className = 'potree-confirm-overlay';
		overlay.innerHTML = `
			<div class="potree-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="potree-confirm-title">
				<div class="potree-confirm-title" id="potree-confirm-title">${_esc(title)}</div>
				<div class="potree-confirm-body">${_esc(message)}</div>
				<div class="potree-confirm-actions">
					<button class="potree-confirm-btn potree-confirm-cancel">Cancel</button>
					<button class="potree-confirm-btn potree-confirm-ok${danger ? '' : ' neutral'}">${_esc(confirmLabel)}</button>
				</div>
			</div>
		`;
		document.body.appendChild(overlay);

		let settled = false;
		const close = (result) => {
			if (settled) return;
			settled = true;
			document.removeEventListener('keydown', onKey);
			overlay.style.opacity = '0';
			overlay.style.transition = 'opacity 0.12s';
			setTimeout(() => overlay.remove(), 130);
			resolve(result);
		};

		const onKey = (e) => {
			if (e.key === 'Escape') { e.preventDefault(); close(false); }
			else if (e.key === 'Enter') { e.preventDefault(); close(true); }
		};
		document.addEventListener('keydown', onKey);

		overlay.querySelector('.potree-confirm-cancel').addEventListener('click', () => close(false));
		overlay.querySelector('.potree-confirm-ok').addEventListener('click',     () => close(true));
		overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

		// Focus cancel by default so Enter-happy users don't accidentally confirm
		overlay.querySelector('.potree-confirm-cancel').focus();
	});
}
