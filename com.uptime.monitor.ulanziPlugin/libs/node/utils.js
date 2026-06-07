class UlanziUtils {
  getPluginPath() {
    const p = process.argv[1];
    const sep = p.includes('\\') ? '\\' : '/';
    const parts = p.split(sep);
    const idx = parts.findIndex(f => f.endsWith('ulanziPlugin'));
    return parts.slice(0, idx + 1).join('/');
  }
  log(...msg)   { console.log(`[${new Date().toLocaleString()}]`, ...msg); }
  warn(...msg)  { console.warn(`[${new Date().toLocaleString()}]`, ...msg); }
  error(...msg) { console.error(`[${new Date().toLocaleString()}]`, ...msg); }
}

const Utils = new UlanziUtils();
export default Utils;
