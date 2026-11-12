// Data layer: live status from mcsrvstat.us, everything else from the plugin's public gist.
// Falls back to data/sample/*.json (flagged as preview) when unset or unreachable.
import { CONFIG } from './config.js';
import { mergeKit, mergeOverall, mergeMatches, mergePlayers } from './merge.js';

let preview = false;

const gistConfigured = () =>
  CONFIG.GIST_USER && CONFIG.GIST_ID && !/^YOUR_/.test(CONFIG.GIST_USER) && !/^YOUR_/.test(CONFIG.GIST_ID);
const feedBase = () => {
  const u = (CONFIG.FEED_URL || '').trim().replace(/\/+$/, '');
  // http:// is only usable when this page is also served over http (e.g. localhost); https pages need an https feed.
  const ok = /^https:\/\//i.test(u) || (/^http:\/\//i.test(u) && location.protocol === 'http:');
  return ok ? u : '';
};
const configured = () => !!(feedBase() || gistConfigured());

/** fetch + JSON with a hard timeout so nothing can hang the page. */
async function getJson(url, ms = 5000) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
  let r;
  try { r = await fetch(url, { cache: 'no-store', signal: ac.signal }); }
  catch (e) { throw new Error(url + (ac.signal.aborted ? ' timed out' : ' failed')); }
  finally { clearTimeout(timer); }
  if (!r.ok) { const e = new Error(url + ' ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

/** Tolerant: returns the array itself or the first array found inside an object. */
export function asList(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  return [];
}

/** gist file name -> plugin HTTP endpoint (docs/web-feed.md). null = gist only. */
function endpoint(file) {
  let m;
  if (file === 'status' || file === 'kits' || file === 'tiers') return '/' + file;
  if ((m = /^ranked-(.+)$/.exec(file))) return `/ranked?kit=${m[1]}&limit=100`;
  if ((m = /^leaderboard-([a-z]+)-(.+)$/.exec(file))) return `/leaderboard?type=${m[1]}&kit=${m[2]}&limit=100`;
  if ((m = /^matches-(ranked|unranked)$/.exec(file))) return `/matches?type=${m[1]}&limit=100`;
  return null;
}

/** Loads one document: plugin API first (if FEED_URL is https), then the gist mirror, then sample data only while unconfigured. */
async function load(file, ms) {
  try { const d = await loadRaw(file, ms); setState(preview ? 'preview' : 'ok'); return d; }
  catch (e) { setState('error'); throw e; }
}
let state = '';
function setState(s) { if (s !== state) { state = s; window.dispatchEvent(new CustomEvent('ht3-data-state', { detail: s })); } }
export const dataState = () => state || (configured() ? '' : 'preview');
async function loadRaw(file, ms = 5000) {
  if (!configured()) {
    preview = true;
    return getJson(`data/sample/${file}.json`, ms);
  }
  const ep = endpoint(file);
  if (feedBase() && ep) {
    try { return await getJson(feedBase() + ep, ms); } catch (e) { if (!gistConfigured()) throw e; }
  }
  if (gistConfigured()) {
    const t = Math.floor(Date.now() / 60000);
    return getJson(`https://gist.githubusercontent.com/${CONFIG.GIST_USER}/${CONFIG.GIST_ID}/raw/${file}.json?t=${t}`, ms);
  }
  throw new Error('no source for ' + file);
}
const safe = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

/** Basic mcsrvstat.us ping of one address (detailed:false). Resolves null on any failure or empty address. */
export const pingStatus = (addr) => !addr ? Promise.resolve(null)
  : getJson('https://api.mcsrvstat.us/3/' + encodeURIComponent(addr), 6000).then((d) => ({
      online: d?.players?.online ?? 0, max: d?.players?.max ?? 0, motd: d?.motd?.clean?.join(' ') || '', version: d?.version || '',
      up: !!d?.online, detailed: false, players: [] })).catch(() => null);

/** Server status. Feed (plugin API or gist) first; mcsrvstat.us only as a basic fallback (detailed:false). */
export async function getStatus() {
  // mcsrvstat.us runs in parallel so the whole call ends within ~6 s whatever happens.
  const l = regions(), mr = l.find((r) => r.id === 'main') || l[0];
  const basic = pingStatus((mr && mr.ping) || CONFIG.SERVER_ADDRESS);
  let feed = null;
  try { feed = await load('status', 3000); } catch (e) { /* next source */ }
  if (feed && typeof feed === 'object' && !Array.isArray(feed)) {
    if (preview) feed = { ...feed, updatedAt: Date.now() - 2 * 60000 };
    const age = feed.updatedAt ? Date.now() - (feed.updatedAt < 1e11 ? feed.updatedAt * 1000 : new Date(feed.updatedAt).getTime()) : 0;
    return { ...feed, players: asList(feed.players), up: !(age > 10 * 60000), detailed: true };
  }
  return (await basic) || { online: 0, max: 0, up: false, unknown: true, detailed: false, players: [] };
}
/** Poll interval: 15 s for the direct plugin API / preview, 2 min for the gist mirror. */
export const refreshMs = () => (feedBase() || !gistConfigured() ? 15000 : 120000);
// ---- Region toggle (ranked / leaderboards / matches): NA = existing sources, others = that region's feed and/or gist only. ----
const REGION_KEY = 'ht3-region';
const mainId = () => (regions().find((r) => r.id === 'main') || regions()[0] || { id: 'main' }).id;
let curRegion = null;
/** [{id,name}] for the toggle. */
export const regionList = () => regions().map((r) => ({ id: r.id, name: r.name }));
export function currentRegion() {
  if (curRegion) return curRegion;
  let v = '';
  try { v = localStorage.getItem(REGION_KEY) || ''; } catch (e) { /* storage blocked */ }
  return (curRegion = regions().some((r) => r.id === v) ? v : mainId());
}
export function setRegion(id) {
  if (!regions().some((r) => r.id === id)) return;
  curRegion = id;
  try { localStorage.setItem(REGION_KEY, id); } catch (e) { /* storage blocked */ }
  memo.clear();
}
const isMainRegion = () => currentRegion() === mainId();
const regionOffline = () => Object.assign(new Error('region data unavailable'), { regionOffline: true });
/** Other region: its feed (https only here) then its own gist (CONFIG.REGIONS[].gistUser/gistId, optional). Never touches the data banner. */
async function loadOther(file, ms = 5000) {
  const r = regions().find((x) => x.id === currentRegion());
  const base = r ? usableFeed(r.feed) : '', ep = endpoint(file);
  const gist = r && /^[A-Za-z0-9_-]+$/.test(r.gistUser) && /^[a-f0-9]+$/i.test(r.gistId);
  if (base && ep) { try { return await getJson(base + '/api' + ep, ms); } catch (e) { if (!gist) throw regionOffline(); } }
  if (gist) {
    try { return await getJson(`https://gist.githubusercontent.com/${r.gistUser}/${r.gistId}/raw/${file}.json?t=${Math.floor(Date.now() / 60000)}`, ms); }
    catch (e) { throw regionOffline(); }
  }
  throw regionOffline();
}
const loadR = (file, ms) => (isMainRegion() ? load(file, ms) : loadOther(file, ms));
export const getKits = async () => asList(await loadR('kits'));
export const getTiers = async () => asList(await load('tiers'));

// ---- Cross-region data: main = existing path above; other CONFIG.REGIONS are read-only extras (4 s, failures ignored). ----
/** Shared REGIONS parser (regions.js imports these): a feed base URL if usable from this page, else ''. */
export const usableFeed = (u) => {
  u = String(u || '').trim().replace(/\/+$/, '');
  if (!u || /EU-ADDRESS|YOUR_/i.test(u)) return '';           // placeholder = offline
  return /^https:\/\//i.test(u) || (/^http:\/\//i.test(u) && location.protocol === 'http:') ? u : '';
};
/** CONFIG.REGIONS read defensively: always a list of {id,name,feed}. */
export function regions() {
  const l = Array.isArray(CONFIG.REGIONS) ? CONFIG.REGIONS.filter((r) => r && typeof r === 'object') : [];
  return l.map((r, i) => ({ id: String(r.id || 'r' + i), name: String(r.name || r.id || 'Region ' + (i + 1)), feed: String(r.feed || ''), address: String(r.address || '').trim(), ping: String(r.ping || '').trim(), gistUser: String(r.gistUser || ''), gistId: String(r.gistId || '') }));
}
/** Join addresses to show: one {name,address} per region that has one, else the single SERVER_ADDRESS. */
export function addresses() {
  const l = regions().filter((r) => r.address).map((r) => ({ name: r.name, address: r.address }));
  return l.length ? l : (CONFIG.SERVER_ADDRESS ? [{ name: '', address: CONFIG.SERVER_ADDRESS }] : []);
}
const mainName = () => { const l = regions(); const m = l.find((r) => r.id === 'main') || l[0]; return m ? m.name : 'NA'; };
function extras() {
  if (!configured()) return [];
  const l = regions();
  const mi = Math.max(0, l.findIndex((r) => r.id === 'main'));
  return l.filter((_, i) => i !== mi).map((r) => ({ name: r.name, base: usableFeed(r.feed) })).filter((r) => r.base);
}
/** [{region, data}] for the extra regions that answered; never throws. */
async function fromExtras(ep) {
  const got = await Promise.all(extras().map(async (r) => {
    try { return { region: r.name, data: await getJson(r.base + '/api' + ep, 4000) }; } catch (e) { return null; }
  }));
  return got.filter(Boolean);
}
/** Main (existing path) + extras in parallel. main is null when it failed; mainErr keeps the error. */
async function fromAll(ep, mainFn) {
  const [m, ex] = await Promise.all([mainFn().then((d) => ({ d }), (e) => ({ e })), extras().length ? fromExtras(ep) : []]);
  return { main: m.e ? null : m.d, mainErr: m.e, ex };
}
const sources = (r, pick) => [...(r.main != null ? [{ region: mainName(), data: r.main }] : []), ...r.ex].map((s) => ({ region: s.region, rows: pick(s.data) }));
const memo = new Map();
const cached = (key, fn) => { const h = memo.get(key); if (h && Date.now() - h.t < 8000) return h.p; const p = fn(); memo.set(key, { t: Date.now(), p }); p.catch(() => memo.delete(key)); return p; };

export const getRanked = (kit = 'overall') => cached(currentRegion() + ':r:' + kit, () => rankedMerged(safe(kit || 'overall')));
async function rankedMerged(kit) {
  if (!isMainRegion()) return asList(await loadOther('ranked-' + kit));
  const r = await fromAll(`/ranked?kit=${kit}&limit=100`, () => load('ranked-' + kit));
  if (!r.ex.length) { if (r.main == null) throw r.mainErr; return asList(r.main); }   // main only: exactly the old behaviour
  const src = sources(r, asList);
  if (src.length < 2) return src[0].rows;
  if (kit !== 'overall') return mergeKit(src);
  let kits = [];
  try { kits = await getKits(); } catch (e) { /* fall back to a max-of-overall merge */ }
  const lists = (await Promise.all(kits.map((k) => getRanked(k.id).catch(() => null)))).filter(Boolean)
    .map((rows) => rows.map((x) => (x && !x.region ? { ...x, region: mainName() } : x)));
  return lists.length ? mergeOverall(src, lists) : mergeKit(src);
}
/** {Bronze:n,...,Champion:n} for the whole ladder of a kit, or null when the feed lacks it. */
export const getLeaderboard = async (type = 'wins', kit = 'all') =>
  asList(await loadR(`leaderboard-${safe(type)}-${safe(kit || 'all')}`));
/** Accepts both {winner,loser,...} and the documented {winners:[{name,uuid,delta}],losers:[...],seconds}. */
export function normMatch(m) {
  const w = m.winner ?? m.winners?.[0]?.name, l = m.loser ?? m.losers?.[0]?.name;
  const wf = m.winners?.[0] || {};
  const d = m.delta ?? wf.delta;
  return { ...m, winner: w, loser: l, winnerUuid: m.winnerUuid ?? wf.uuid, loserUuid: m.loserUuid ?? m.losers?.[0]?.uuid,
    duration: m.duration ?? m.seconds, delta: d != null ? d : (m.eloAfter != null && m.eloBefore != null && m.eloBefore >= 0 ? m.eloAfter - m.eloBefore : undefined) };
}
export const getMatches = async (type = 'ranked') => {
  const t = type === 'unranked' ? 'unranked' : 'ranked';
  if (!isMainRegion()) return asList(await loadOther('matches-' + t)).map(normMatch);
  const r = await fromAll(`/matches?type=${t}&limit=100`, () => load('matches-' + t));
  if (!r.ex.length) { if (r.main == null) throw r.mainErr; return asList(r.main).map(normMatch); }
  const src = sources(r, (d) => asList(d).map(normMatch));
  return src.length < 2 ? src[0].rows : mergeMatches(src);
};

/** Player: main profile + extra regions, merged per kit (better region wins). Main-only when no other region answers. */
export async function getPlayer(name) {
  const ok = /^[A-Za-z0-9_]{1,16}$/.test(String(name));
  const ex = ok && extras().length ? fromExtras('/player/' + encodeURIComponent(name)) : Promise.resolve([]);
  let main = null, err = null;
  try { main = await getPlayerMain(name); } catch (e) { err = e; }
  const have = (await ex).filter((s) => s.data && typeof s.data === 'object' && !Array.isArray(s.data))
    .map((s) => ({ region: s.region, p: { ...s.data, recent: asList(s.data.recentMatches ?? s.data.recent).map(normMatch) } }));
  if (!have.length) { if (err) throw err; return main; }
  const all = [...(main ? [{ region: mainName(), p: main }] : []), ...have];
  return mergePlayers(all);
}
async function getPlayerMain(name) {
  if (configured() && feedBase() && /^[A-Za-z0-9_]{1,16}$/.test(String(name))) {
    try { const p = await getJson(feedBase() + '/player/' + encodeURIComponent(name), 5000); return { ...p, recent: asList(p.recentMatches ?? p.recent).map(normMatch) }; }
    catch (e) { if (e.status === 404 && !gistConfigured()) return null; if (!gistConfigured()) throw e; }
  }
  const all = await load('players');
  const key = String(name || '').toLowerCase();
  let p = all && ((Object.hasOwn(all, key) ? all[key] : null) || Object.values(all).find((x) => x && String(x.name).toLowerCase() === key));
  if (!p && preview && all) p = Object.values(all)[0];
  if (p) p = { ...p, recent: asList(p.recentMatches ?? p.recent).map(normMatch) };
  if (!p) return null;
  // Sample data only contains one profile: show it under the requested name.
  return preview && key !== String(p.name).toLowerCase() ? { ...p, name } : p;
}


