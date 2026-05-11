
let _stylesInjected = false;

function _injectStyles () {
	if (_stylesInjected) return;
	_stylesInjected = true;

	const css = `
.potree-connect-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	z-index: 99999;
	display: flex;
	align-items: center;
	justify-content: center;
	animation: potree-connect-fadein 0.12s ease;
}
@keyframes potree-connect-fadein {
	from { opacity: 0; }
	to   { opacity: 1; }
}
.potree-connect-dialog {
	background: #1a2426;
	border: 1px solid #333;
	border-radius: 6px;
	padding: 24px 28px;
	min-width: 320px;
	max-width: 460px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75);
	animation: potree-connect-slidein 0.12s ease;
	font-family: Arial, sans-serif;
}
@keyframes potree-connect-slidein {
	from { transform: translateY(-8px); opacity: 0; }
	to   { transform: translateY(0);    opacity: 1; }
}
.potree-connect-title {
	font-size: 13px;
	font-weight: bold;
	color: #ddd;
	margin-bottom: 10px;
}
.potree-connect-body {
	font-size: 12px;
	color: #999;
	margin-bottom: 22px;
	line-height: 1.55;
	word-break: break-word;
}
.potree-connect-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
.potree-connect-btn {
	padding: 6px 16px;
	border-radius: 4px;
	font-size: 12px;
	font-family: Arial, sans-serif;
	cursor: pointer;
	border: 1px solid #444;
	outline: none;
	transition: background 0.1s, border-color 0.1s, color 0.1s;
	white-space: nowrap;
}
.potree-connect-btn:focus-visible {
	box-shadow: 0 0 0 2px rgba(100, 160, 220, 0.5);
}
.potree-connect-cancel {
	background: #252f32;
	color: #aaa;
	border-color: #3a4548;
}
.potree-connect-cancel:hover {
	background: #2e3c40;
	border-color: #4e5d62;
	color: #ccc;
}
.potree-connect-junction {
	background: #1c2a38;
	color: #6090c0;
	border-color: #2e4a6a;
}
.potree-connect-junction:hover {
	background: #223448;
	border-color: #3a6090;
	color: #80b0e0;
}
.potree-connect-merge {
	background: #1c3828;
	color: #60b080;
	border-color: #2e6a4a;
}
.potree-connect-merge:hover {
	background: #224834;
	border-color: #3a9060;
	color: #80d0a0;
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
 * Show a dialog asking how to connect two linestrings.
 *
 * @param {{ labelA: string, labelB: string }} opts
 * @returns {Promise<'merge'|'junction'|null>}
 *   'merge'    → join into a single linestring
 *   'junction' → share the endpoint node ID, keep as two separate ways
 *   null       → cancelled
 */
export function showConnectDialog ({ labelA, labelB }) {
	_injectStyles();

	return new Promise(resolve => {
		let overlay = document.createElement('div');
		overlay.className = 'potree-connect-overlay';
		overlay.innerHTML = `
			<div class="potree-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="potree-connect-title">
				<div class="potree-connect-title" id="potree-connect-title">Connect LineStrings</div>
				<div class="potree-connect-body">Connect <strong>${_esc(labelA)}</strong> and <strong>${_esc(labelB)}</strong>?</div>
				<div class="potree-connect-actions">
					<button class="potree-connect-btn potree-connect-cancel">Cancel</button>
					<button class="potree-connect-btn potree-connect-junction">Link endpoints</button>
					<button class="potree-connect-btn potree-connect-merge">Merge into one</button>
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
			if (e.key === 'Escape') { e.preventDefault(); close(null); }
		};
		document.addEventListener('keydown', onKey);

		overlay.querySelector('.potree-connect-cancel').addEventListener('click',   () => close(null));
		overlay.querySelector('.potree-connect-junction').addEventListener('click', () => close('junction'));
		overlay.querySelector('.potree-connect-merge').addEventListener('click',    () => close('merge'));
		overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

		overlay.querySelector('.potree-connect-cancel').focus();
	});
}
