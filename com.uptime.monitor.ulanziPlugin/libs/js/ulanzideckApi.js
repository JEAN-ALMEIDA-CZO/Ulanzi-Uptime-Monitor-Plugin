/// <reference path="eventEmitter.js"/>
/// <reference path="utils.js"/>

class UlanziStreamDeck {
  constructor(){
    this.key = ''; this.uuid = ''; this.actionid = ''; this.websocket = null;
    this.language = 'en'; this.localization = null;
    this.on = EventEmitter.on;
    this.emit = EventEmitter.emit;
    this.isMain = false;
  }

  connect(uuid) {
    this.port     = Utils.getQueryParams('port')     || 3906;
    this.address  = Utils.getQueryParams('address')  || '127.0.0.1';
    this.actionid = Utils.getQueryParams('actionId') || '';
    this.key      = Utils.getQueryParams('key')      || '';
    this.language = Utils.adaptLanguage(Utils.getQueryParams('language') || Utils.getLanguage() || 'en');
    this.uuid     = uuid || Utils.getQueryParams('uuid') || '';

    if (this.websocket) { this.websocket.close(); this.websocket = null; }

    const isMain = this.uuid.split('.').length === 4;
    this.isMain  = isMain;
    this.websocket = new WebSocket(`ws://${this.address}:${this.port}`);

    this.websocket.onopen = () => {
      this.websocket.send(JSON.stringify({ code: 0, cmd: Events.CONNECTED, actionid: this.actionid, key: this.key, uuid: this.uuid }));
      this.emit(Events.CONNECTED, {});
      if (!isMain) this.localizeUI();
    };

    this.websocket.onerror  = (evt) => { const e = `WS ERROR: ${evt}, ${SocketErrors.DEFAULT}`; Utils.warn(e); this.emit(Events.ERROR, e); };
    this.websocket.onclose  = ()    => { Utils.warn('WS CLOSED'); this.emit(Events.CLOSE); };

    this.websocket.onmessage = (evt) => {
      const data = evt?.data ? JSON.parse(evt.data) : null;
      if (!data || (typeof data.code !== 'undefined' && data.cmdType !== 'REQUEST')) return;

      if (!this.key      && data.uuid === this.uuid && data.key)      this.key      = data.key;
      if (!this.actionid && data.uuid === this.uuid && data.actionid) this.actionid = data.actionid;

      if (isMain) this.send(data.cmd, { code: 0, ...data });

      if (data.cmd === 'clear') {
        if (data.param) data.param.forEach(p => { p.context = this.encodeContext(p); });
      } else {
        data.context = this.encodeContext(data);
      }
      this.emit(data.cmd, data);
    };
  }

  async localizeUI() {
    const el = document.querySelector('.udpi-wrapper');
    if (!el) return;
    if (!this.localization) {
      try {
        const json = await Utils.readJson(`${Utils.getPluginPath()}/${this.language}.json`);
        this.localization = json['Localization'] || null;
      } catch(e) {
        Utils.warn('No locale file for', this.language);
      }
    }
    if (!this.localization) return;
    el.querySelectorAll('[data-localize]').forEach(e => {
      const s  = e.innerText?.trim();
      const dl = e.dataset.localize;
      if (e.placeholder?.length) e.placeholder = this.localization[dl || e.placeholder] || e.placeholder;
      if (e.title?.length)       e.title        = this.localization[dl || e.title]       || e.title;
      if (e.label)               e.label        = this.localization[dl || e.label]       || e.label;
      if (e.textContent)         e.textContent  = this.localization[dl || e.textContent?.trim()] || e.textContent;
      if (s)                     e.innerHTML    = this.localization[dl || s] || e.innerHTML;
    });
  }

  t(key) { return this.localization?.[key] || key; }

  encodeContext(jsn) { return `${jsn.uuid}___${jsn.key}___${jsn.actionid}`; }
  decodeContext(ctx) { const [uuid, key, actionid] = ctx.split('___'); return { uuid, key, actionid }; }

  send(cmd, params) {
    this.websocket?.send(JSON.stringify({ cmd, uuid: this.uuid, key: this.key, actionid: this.actionid, ...params }));
  }

  sendParamFromPlugin(settings, context) {
    const { uuid, key, actionid } = context ? this.decodeContext(context) : {};
    this.send(Events.PARAMFROMPLUGIN, { uuid: uuid||this.uuid, key: key||this.key, actionid: actionid||this.actionid, param: settings });
  }

  setBaseDataIcon(context, data, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 1, data, textData: text||'', showtext: !!text }] } });
  }

  setPathIcon(context, path, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 2, path, textData: text||'', showtext: !!text }] } });
  }

  setStateIcon(context, state, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 0, state, textData: text||'', showtext: !!text }] } });
  }

  toast(msg)          { this.send(Events.TOAST,   { msg }); }
  openUrl(url, local) { this.send(Events.OPENURL, { url, local: !!local }); }

  onConnected(fn)       { this.on(Events.CONNECTED,       fn); return this; }
  onClose(fn)           { this.on(Events.CLOSE,           fn); return this; }
  onError(fn)           { this.on(Events.ERROR,           fn); return this; }
  onAdd(fn)             { this.on(Events.ADD,             fn); return this; }
  onParamFromApp(fn)    { this.on(Events.PARAMFROMAPP,    fn); return this; }
  onParamFromPlugin(fn) { this.on(Events.PARAMFROMPLUGIN, fn); return this; }
  onRun(fn)             { this.on(Events.RUN,             fn); return this; }
  onSetActive(fn)       { this.on(Events.SETACTIVE,       fn); return this; }
  onClear(fn)           { this.on(Events.CLEAR,           fn); return this; }
  onSelectdialog(fn)    { this.on(Events.SELECTDIALOG,    fn); return this; }
}

const $UD = new UlanziStreamDeck();
