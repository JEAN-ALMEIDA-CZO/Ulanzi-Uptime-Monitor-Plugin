import WebSocket    from 'ws';
import EventEmitter from 'events';
import { Events, SocketErrors } from './constants.js';
import Utils from './utils.js';

class UlanzideckApi extends EventEmitter {
  constructor() {
    super();
    this.key = ''; this.uuid = ''; this.actionid = ''; this.websocket = null;
  }

  connect(uuid, port = 3906, address = '127.0.0.1') {
    const [argv_address, argv_port] = process.argv.splice(2);
    this.address = argv_address || address;
    this.port    = argv_port    || port;
    this.uuid    = uuid;

    if (this.websocket) { this.websocket.close(); this.websocket = null; }

    const isMain = uuid.split('.').length === 4;
    this.websocket = new WebSocket(`ws://${this.address}:${this.port}`);

    this.websocket.onopen = () => {
      this.websocket.send(JSON.stringify({ code: 0, cmd: Events.CONNECTED, uuid }));
      this.emit(Events.CONNECTED, {});
    };

    this.websocket.onerror = (evt) => {
      const msg = `[ULANZIDECK] WS ERROR: ${JSON.stringify(evt)}, ${SocketErrors.DEFAULT}`;
      Utils.warn(msg);
      this.emit(Events.ERROR, msg);
    };

    this.websocket.onclose = () => {
      Utils.warn('[ULANZIDECK] WS CLOSED');
      this.emit(Events.CLOSE);
    };

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

  encodeContext(jsn) { return `${jsn.uuid}___${jsn.key}___${jsn.actionid}`; }
  decodeContext(ctx) { const [uuid, key, actionid] = ctx.split('___'); return { uuid, key, actionid }; }

  send(cmd, params) {
    this.websocket?.send(JSON.stringify({ cmd, uuid: this.uuid, key: this.key, actionid: this.actionid, ...params }));
  }

  sendParamFromPlugin(settings, context) {
    const { uuid, key, actionid } = context ? this.decodeContext(context) : {};
    this.send(Events.PARAMFROMPLUGIN, {
      uuid: uuid || this.uuid, key: key || this.key, actionid: actionid || this.actionid, param: settings
    });
  }

  setBaseDataIcon(context, data, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 1, data, textData: text || '', showtext: !!text }] } });
  }

  setPathIcon(context, path, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 2, path, textData: text || '', showtext: !!text }] } });
  }

  setStateIcon(context, state, text) {
    const { uuid, key, actionid } = this.decodeContext(context);
    this.send(Events.STATE, { param: { statelist: [{ uuid, key, actionid, type: 0, state, textData: text || '', showtext: !!text }] } });
  }

  toast(msg)            { this.send(Events.TOAST,        { msg }); }
  openUrl(url, local)   { this.send(Events.OPENURL,      { url, local: !!local }); }

  onConnected(fn)      { this.on(Events.CONNECTED,       fn); return this; }
  onClose(fn)          { this.on(Events.CLOSE,           fn); return this; }
  onError(fn)          { this.on(Events.ERROR,           fn); return this; }
  onAdd(fn)            { this.on(Events.ADD,             fn); return this; }
  onParamFromApp(fn)   { this.on(Events.PARAMFROMAPP,    fn); return this; }
  onParamFromPlugin(fn){ this.on(Events.PARAMFROMPLUGIN, fn); return this; }
  onRun(fn)            { this.on(Events.RUN,             fn); return this; }
  onSetActive(fn)      { this.on(Events.SETACTIVE,       fn); return this; }
  onClear(fn)          { this.on(Events.CLEAR,           fn); return this; }
  onSelectdialog(fn)   { this.on(Events.SELECTDIALOG,    fn); return this; }
}

export default UlanzideckApi;
