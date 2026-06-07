class UlanziUtils {
	getFormValue(form) {
		if (typeof form === 'string') form = document.querySelector(form);
		const elements = form ? form.elements : '';
		if (!elements) console.error('Could not find form!');
		const formData = new FormData(form);
		let formValue = {};
		formData.forEach((value, key) => {
			if (!Reflect.has(formValue, key)) { formValue[key] = value; return; }
			if (!Array.isArray(formValue[key])) formValue[key] = [formValue[key]];
			formValue[key].push(value);
		});
		return formValue;
	}

	setFormValue(jsn, form) {
		if (!jsn) return;
		if (typeof form === 'string') form = document.querySelector(form);
		const elements = form ? form.elements : '';
		if (!elements) return;
		Array.from(elements).filter(e => e?.name).forEach(element => {
			const { name, type } = element;
			const value = name in jsn ? jsn[name] : null;
			if (value === null) return;
			const isCheckOrRadio = type === 'checkbox' || type === 'radio';
			if (isCheckOrRadio) {
				const isSingle = value === element.value;
				if (isSingle || (Array.isArray(value) && value.includes(element.value))) element.checked = true;
				else element.checked = false;
			} else {
				element.value = value !== undefined ? value : '';
			}
		});
	}

	debounce(fn, wait = 150) {
		let timeoutId = null;
		return (...args) => { window.clearTimeout(timeoutId); timeoutId = window.setTimeout(() => fn.apply(null, args), wait); };
	}

	getQueryParams(param) { return new URLSearchParams(window.location.search).get(param); }

	getLanguage() {
		let lang = navigator.languages?.length ? navigator.languages[0] : (navigator.language || 'en');
		return this.adaptLanguage(lang);
	}

	adaptLanguage(ln) {
		if (ln.startsWith('zh')) return ln.includes('CN') ? 'zh_CN' : 'zh_HK';
		if (ln.startsWith('en')) return 'en';
		return ln.replace(/-/g, '_');
	}

	parseJson(jsonString) {
		if (typeof jsonString === 'object') return jsonString;
		try { const o = JSON.parse(jsonString); if (o && typeof o === 'object') return o; } catch(e) {}
		return false;
	}

	async readJson(path) {
		return new Promise((resolve, reject) => {
			const req = new XMLHttpRequest();
			req.onerror = reject;
			req.overrideMimeType('application/json');
			req.open('GET', path, true);
			req.onreadystatechange = (response) => {
				if (req.readyState === 4) {
					const str = response?.target?.response || '';
					if (str) { try { resolve(JSON.parse(str)); } catch(e) { reject(); } } else reject();
				}
			};
			req.send();
		});
	}

	getPluginPath() {
		const p = location.pathname;
		const sep = p.includes('\\') ? '\\' : '/';
		const parts = p.split(sep);
		const idx = parts.findIndex(f => f.endsWith('ulanziPlugin'));
		return parts.slice(0, idx + 1).join('/');
	}

	joinTimestamp() { return { _t: new Date().getTime() }; }
	log(...msg)   { console.warn(`[${new Date().toLocaleString()}]`, ...msg); }
	warn(...msg)  { console.warn(`[${new Date().toLocaleString()}]`, ...msg); }
	error(...msg) { console.error(`[${new Date().toLocaleString()}]`, ...msg); }
}

const Utils = new UlanziUtils();
