
let _stylesInjected = false;

function _injectStyles () {
	if (_stylesInjected) return;
	_stylesInjected = true;

	const css = `
.potree-saveosm-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	z-index: 99999;
	display: flex;
	align-items: center;
	justify-content: center;
	animation: potree-saveosm-fadein 0.12s ease;
}
@keyframes potree-saveosm-fadein {
	from { opacity: 0; }
	to   { opacity: 1; }
}
.potree-saveosm-dialog {
	background: #1a2426;
	border: 1px solid #333;
	border-radius: 6px;
	padding: 24px 28px;
	min-width: 320px;
	max-width: 460px;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75);
	animation: potree-saveosm-slidein 0.12s ease;
	font-family: Arial, sans-serif;
}
@keyframes potree-saveosm-slidein {
	from { transform: translateY(-8px); opacity: 0; }
	to   { transform: translateY(0);    opacity: 1; }
}
.potree-saveosm-title {
	font-size: 13px;
	font-weight: bold;
	color: #ddd;
	margin-bottom: 10px;
}
.potree-saveosm-body {
	font-size: 12px;
	color: #999;
	margin-bottom: 22px;
	line-height: 1.55;
	word-break: break-word;
}
.potree-saveosm-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
.potree-saveosm-btn {
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
.potree-saveosm-btn:focus-visible {
	box-shadow: 0 0 0 2px rgba(100, 160, 220, 0.5);
}
.potree-saveosm-cancel {
	background: #252f32;
	color: #aaa;
	border-color: #3a4548;
}
.potree-saveosm-cancel:hover {
	background: #2e3c40;
	border-color: #4e5d62;
	color: #ccc;
}
.potree-saveosm-new {
	background: #252f32;
	color: #aaa;
	border-color: #3a4548;
}
.potree-saveosm-new:hover {
	background: #2e3c40;
	border-color: #4e5d62;
	color: #ccc;
}
.potree-saveosm-existing {
	background: #1c2a38;
	color: #6090c0;
	border-color: #2e4a6a;
}
.potree-saveosm-existing:hover {
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
 * Show a custom dialog asking where to save the OSM file.
 *
 * @param {string} fileName - The name of the currently imported OSM file.
 * @returns {Promise<'existing'|'new'|null>}
 *   'existing' → save/overwrite the imported file
 *   'new'      → download as a new file
 *   null       → cancelled
 */
export function showSaveOSMDialog (fileName) {
	_injectStyles();

	return new Promise(resolve => {
		let overlay = document.createElement('div');
		overlay.className = 'potree-saveosm-overlay';
		overlay.innerHTML = `
			<div class="potree-saveosm-dialog" role="dialog" aria-modal="true" aria-labelledby="potree-saveosm-title">
				<div class="potree-saveosm-title" id="potree-saveosm-title">Save LineStrings</div>
				<div class="potree-saveosm-body">Where do you want to save?</div>
				<div class="potree-saveosm-actions">
					<button class="potree-saveosm-btn potree-saveosm-cancel">Cancel</button>
					<button class="potree-saveosm-btn potree-saveosm-new">Create new file</button>
					<button class="potree-saveosm-btn potree-saveosm-existing">Save to ${_esc(fileName)}</button>
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

		overlay.querySelector('.potree-saveosm-cancel').addEventListener('click',   () => close(null));
		overlay.querySelector('.potree-saveosm-new').addEventListener('click',      () => close('new'));
		overlay.querySelector('.potree-saveosm-existing').addEventListener('click', () => close('existing'));
		overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });

		overlay.querySelector('.potree-saveosm-cancel').focus();
	});
}
