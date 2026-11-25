// html`...` : a tagged template for innerHTML. Every interpolated value is HTML-escaped unless it is explicitly trusted with raw()
// (or is itself the result of html`...`). Arrays are joined after each item gets the same treatment. null/undefined/false become ''.
// Use it for anything that can contain a nickname, chat text, a word or any server value.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
export const raw = s => s instanceof Raw ? s : new Raw(String(s));
const one = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(one).join('') : v == null || v === false ? '' : esc(v);
export const html = (strings, ...vals) => new Raw(strings.reduce((o, s, i) => o + s + (i < vals.length ? one(vals[i]) : ''), ''));
export const isRaw = v => v instanceof Raw;
