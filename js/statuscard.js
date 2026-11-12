// Shared status rendering for the home card and the status page. Text only via textContent.
import { CONFIG } from './config.js';
import { el, head, addressRows, timeAgo } from './ui.js';

export function fmtUptime(sec) {
  if (!(sec > 0)) return '';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
export const tpsClass = (t) => (t >= 19 ? 'good' : t >= 15 ? 'warn' : 'bad');

const cell = (value, label, cls) => el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, el('b', {}, value), el('span', {}, label));

/** "12 / 100" with a sane max, just "12" when the max is absurd (hosts often set max-players to 100000). */
export const playerCount = (s) => {
  const online = s.online ?? 0;
  const max = Number(s.max);
  return max > 0 && max <= 1000 ? `${online} / ${max}` : `${online}`;
};

/** Stat tiles for the status. s = result of getStatus(). */
export function statRow(s) {
  const row = el('div', { class: 'tiles' });
  if (s.unknown) return row;
  row.append(cell(playerCount(s), 'players'));
  if (s.detailed) {
    if (s.playing != null) row.append(cell(s.playing, 'in matches'));
    if (s.queued != null) row.append(cell(s.queued, 'in queue'));
    if (s.inRanked != null) row.append(cell(s.inRanked, 'in ranked'));
    if (typeof s.tps === 'number') row.append(cell(s.tps.toFixed(1), 'TPS', 'tps ' + tpsClass(s.tps)));
    const u = fmtUptime(s.uptimeSeconds);
    if (u) row.append(cell(u, 'uptime'));
  }
  return row;
}

/** Full status panel: state header, tiles, address card, optional first N player heads. Always ends in a real state. */
export function renderPanel(box, s, opts = {}) {
  box.replaceChildren();
  const up = s.up !== false && !s.unknown;
  const title = s.unknown ? 'Status unavailable' : up ? 'Online' : 'Offline';
  box.append(el('div', { class: 'spanel' },
    el('div', { class: 'shead' }, el('i', { class: 'dot ' + (up ? 'on' : 'off') }), el('b', {}, title),
      !s.unknown ? el('span', { class: 'bigcount' }, `${playerCount(s)} players`) : null,
      el('span', { class: 'muted' }, s.mcVersion || s.version || '')),
    el('div', { class: 'srow' }, s.unknown ? el('p', { class: 'muted' }, 'Could not reach the server or the stats feed right now. Please try again in a minute.') : statRow(s),
      opts.noAddr ? null : el('div', { class: 'sip card' }, el('span', { class: 'muted' }, 'Server address'), addressRows()))));
  if (opts.limit) box.append(headsRow(s, opts.limit));
}
/** "Online now" heads row (or a short unavailable note). */
export function headsRow(s, limit = 12) {
  if (!s.detailed) return el('p', { class: 'muted' }, 'Live details unavailable. ', el('a', { href: 'status.html' }, 'Status page'));
  const ps = (s.players || []).slice(0, limit);
  const wrap = el('div', { class: 'spanel heads' }, el('div', { class: 'sh' }, el('h3', {}, 'Online now'), el('a', { href: 'status.html' }, 'View all')));
  if (!ps.length) wrap.append(el('p', { class: 'muted' }, 'No one online right now.'));
  else wrap.append(el('div', { class: 'headrow' }, ps.map((p) => el('a', { href: 'player.html?name=' + encodeURIComponent(p.name), title: p.name + (p.region ? ` (${p.region})` : '') }, head(p, 40, 'head sm')))));
  return wrap;
}
export const updatedText = (s) => (s.detailed ? (s.updatedAt ? 'Updated ' + timeAgo(s.updatedAt) : '') : 'Live details unavailable');
