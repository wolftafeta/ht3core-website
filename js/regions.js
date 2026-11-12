// Per-region server status (status only; stats/leaderboards keep reading the main feed).
import { regions, usableFeed, pingStatus } from './api.js';
import { el } from './ui.js';
import { playerCount, renderPanel } from './statuscard.js';

export { regions };

/** Feed first; if it fails, the basic mcsrvstat ping (started in parallel) decides online/offline. */
async function fetchOne(r) {
  const ping = pingStatus(r.ping || r.address);
  const feed = await fetchFeed(r);
  if (feed.detailed) return feed;
  return (await ping) || { up: false };
}

async function fetchFeed(r, ms = 4000) {
  const base = usableFeed(r.feed);
  if (!base) return { up: false };
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(base + '/api/status', { cache: 'no-store', signal: ac.signal });
    if (!res.ok) return { up: false };
    const d = await res.json();
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { up: false };
    const age = d.updatedAt ? Date.now() - (d.updatedAt < 1e11 ? d.updatedAt * 1000 : new Date(d.updatedAt).getTime()) : 0;
    return { ...d, players: Array.isArray(d.players) ? d.players : [], detailed: true, up: !(age > 10 * 60000), online: d.online ?? 0, max: d.max, version: d.mcVersion || d.version || '' };
  } catch (e) { return { up: false }; }
  finally { clearTimeout(t); }
}

/**
 * Status for every region, each with its own error handling.
 * mainStatus (optional promise/value of getStatus()) is reused for the region with id "main" so the main feed is not fetched twice.
 */
export function getRegionStatuses(mainStatus) {
  return Promise.all(regions().map(async (r) => {
    try {
      if (r.id === 'main' && mainStatus) {
        const s = await mainStatus;
        return { ...s, ...r, up: s.up !== false && !s.unknown, online: s.online, max: s.max, version: s.mcVersion || s.version || '' };
      }
      return { ...r, ...(await fetchOne(r)) };
    } catch (e) { return { ...r, up: false }; }
  }));
}

/**
 * Online players of every region that answered with a detailed status (main first), de-duplicated by uuid/name.
 * Players carry .region (the region name) only when 2+ regions are configured. Returns {players, detailed}.
 */
export function mergedOnline(list, fallback) {
  const regs = Array.isArray(list) ? list : [];
  if (regs.length < 2) return { players: fallback?.players || [], detailed: !!fallback?.detailed };
  const seen = new Set(), players = [];
  let detailed = false;
  for (const r of regs) {
    if (!r || !r.up || !r.detailed) continue;
    detailed = true;
    for (const p of Array.isArray(r.players) ? r.players : []) {
      if (!p || typeof p !== 'object') continue;
      const keys = [p.uuid && 'u' + String(p.uuid).toLowerCase(), p.name && 'n' + String(p.name).toLowerCase()].filter(Boolean);
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      players.push({ ...p, region: r.name });
    }
  }
  return { players, detailed };
}

/** Full per-region panels for the status page (name + the usual tiles); a failed region is a clean Offline panel. */
export function regionPanels(list) {
  return el('div', { class: 'rpanels' }, list.map((r) => {
    const box = el('section', { class: 'rpanel' }, el('h2', {}, r.name));
    const slot = el('div', {});
    if (r.up) renderPanel(slot, r, { noAddr: true });
    else slot.append(el('div', { class: 'spanel' }, el('div', { class: 'shead' }, el('i', { class: 'dot off' }), el('b', {}, 'Offline'))));
    box.append(slot);
    return box;
  }));
}

/** Region cards (text via textContent only). Returns null when fewer than two regions are configured. */
export function regionCards(list) {
  if (!list || list.length < 2) return null;
  return el('div', { class: 'regions' }, list.map((r) => el('div', { class: 'card region' },
    el('div', { class: 'rg-h' }, el('i', { class: 'dot ' + (r.up ? 'on' : 'off') }), el('b', {}, r.name)),
    r.up
      ? el('div', { class: 'rg-b' }, el('span', { class: 'bigcount' }, playerCount(r)), el('span', { class: 'muted' }, 'players'),
          r.version ? el('span', { class: 'muted rg-v' }, r.version) : null)
      : el('div', { class: 'rg-b' }, el('span', { class: 'muted' }, 'Offline')))));
}
