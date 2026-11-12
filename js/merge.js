// Pure cross-region merge rules (no DOM, no fetch). Sources are listed main first; ties keep the earlier source.
/** Points when the feed has them, else the old elo field (works with both feed versions). */
export const ptsOf = (r) => (r ? (typeof r.points === 'number' ? r.points : typeof r.elo === 'number' ? r.elo : undefined) : undefined);
const eloOf = (r) => (r && typeof ptsOf(r) === 'number' && !r.unranked ? ptsOf(r) : -1);
const setPts = (r, v, usePoints) => { if (usePoints) { r.points = v; delete r.elo; } else { r.elo = v; delete r.points; } return r; };
const tms = (t) => (typeof t === 'number' ? (t < 1e11 ? t * 1000 : t) : new Date(t).getTime() || 0);
const isObj = (r) => r && typeof r === 'object';

/** Identity lookup: uuid first, name as fallback. */
function ident() {
  const byU = new Map(), byN = new Map();
  const keys = (r) => [r.uuid ? 'u' + String(r.uuid).toLowerCase().replace(/-/g, '') : '', r.name ? String(r.name).toLowerCase() : ''];
  return {
    find(r) { const [u, n] = keys(r); return (u && byU.get(u)) || (n && byN.get(n)) || null; },
    set(r, v) { const [u, n] = keys(r); if (u) byU.set(u, v); if (n) byN.set(n, v); },
  };
}
function rank(rows, champOk) {
  rows.sort((a, b) => (ptsOf(b) ?? 0) - (ptsOf(a) ?? 0) || String(a.name).localeCompare(String(b.name)));
  rows.forEach((r, i) => { r.pos = i + 1; if (r.champion && !(i === 0 && champOk(r))) r.champion = false; });
  return rows;
}

/** One kit: per player the row with the MAX elo (tagged with its region), re-ranked. sources = [{region, rows}] */
export function mergeKit(sources) {
  const id = ident(), ents = [];
  for (const { region, rows } of sources) for (const r of rows || []) {
    if (!isObj(r)) continue;
    const cur = id.find(r);
    if (!cur) { const e = { row: { ...r, region } }; ents.push(e); id.set(r, e); }
    else if (eloOf(r) > eloOf(cur.row)) { cur.row = { ...r, region }; id.set(r, cur); }
  }
  return rank(ents.map((e) => e.row), () => true);
}

/** Overall = sum of the per-kit maxes. kitLists = mergeKit() outputs; overallSources supplies names, W/L and tier styling. */
export function mergeOverall(overallSources, kitLists) {
  const id = ident(), ents = [];
  const entry = (r) => {
    let e = id.find(r);
    if (!e) { e = { sum: 0, tally: {}, kits: 0, metas: [] }; ents.push(e); }
    id.set(r, e);
    return e;
  };
  for (const rows of kitLists) for (const r of rows) {
    if (!isObj(r) || !(ptsOf(r) >= 0)) continue;
    const e = entry(r); e.sum += ptsOf(r); e.kits++; if (typeof r.points === 'number') e.usePoints = true; e.tally[r.region] = (e.tally[r.region] || 0) + 1;
    e.ident = e.ident || r;
  }
  const donors = [];
  for (const { region, rows } of overallSources) for (const r of rows || []) {
    if (!isObj(r)) continue;
    const e = entry(r); e.metas.push({ region, row: r }); donors.push(r);
  }
  const order = overallSources.map((s) => s.region);
  const out = ents.map((e) => {
    e.metas.sort((a, b) => eloOf(b.row) - eloOf(a.row));
    const meta = e.metas[0], base = meta ? meta.row : e.ident;
    let region = meta ? meta.region : e.ident.region;
    if (e.kits) region = Object.keys(e.tally).sort((a, b) => e.tally[b] - e.tally[a] || order.indexOf(a) - order.indexOf(b))[0];
    const mine = e.metas.find((m) => m.region === region) || meta;
    const src = mine ? mine.row : base;
    const elo = e.kits ? e.sum : eloOf(src);
    const up = e.kits ? !!e.usePoints : typeof src.points === 'number';
    return setPts({ ...src, name: src.name || base.name, uuid: src.uuid || base.uuid, region, _same: eloOf(src) === elo }, elo, up);
  });
  const ladder = donors.filter((d) => !d.champion && d.tier != null).sort((a, b) => eloOf(a) - eloOf(b));
  for (const r of out) {
    if (!r._same) {   // summed ELO no longer matches the source row: borrow tier styling from the nearest ladder row at or below it
      let d = null; for (const x of ladder) if (eloOf(x) <= ptsOf(r)) d = x;
      for (const k of ['tier', 'symbol', 'colour', 'color', 'division']) { if (d && k in d) r[k] = d[k]; else delete r[k]; }
      r.champion = false;
    }
    delete r._same;
  }
  return rank(out, () => true);
}

/** Matches of every region, newest first, tagged with the region. */
export function mergeMatches(sources) {
  const all = [];
  for (const { region, rows } of sources) for (const m of rows || []) if (isObj(m)) all.push({ ...m, region });
  return all.sort((a, b) => tms(b.time) - tms(a.time));
}

/** Player profiles: per kit the better region's ranked entry (ELO/W/L never summed), chart history from that region. */
export function mergePlayers(sources) {
  const list = sources.filter((s) => s && isObj(s.p));
  if (list.length < 2) return list.length ? list[0].p : null;
  const out = { ...list[0].p };
  const ids = new Set();
  for (const s of list) for (const k of [...Object.keys(s.p.ranked?.perKit || {}), ...Object.keys(s.p.stats?.perKit || {})]) ids.add(k);
  const perKit = {}, stats = {}, hist = {}, eloRegion = {}, regionOf = {};
  let sum = 0, placed = 0, usePts = false;
  for (const k of ids) {
    let best = null;
    for (const s of list) {
      const e = s.p.ranked?.perKit?.[k];
      if (isObj(e) && (!best || eloOf(e) > eloOf(best.e))) best = { s, e };
    }
    const home = best ? best.s : list.find((s) => s.p.stats?.perKit?.[k]) || list[0];
    if (best) { perKit[k] = { ...best.e, region: home.region }; if (eloOf(best.e) >= 0) { sum += ptsOf(best.e); placed++; if (typeof best.e.points === 'number') usePts = true; } }
    const st = home.p.stats?.perKit?.[k] || list.map((s) => s.p.stats?.perKit?.[k]).find(Boolean);
    if (st) stats[k] = st;
    if (home.p.eloHistory?.[k]) hist[k] = home.p.eloHistory[k];
    eloRegion[k] = home.region; regionOf[k] = home.region;
  }
  const ovs = list.filter((s) => isObj(s.p.ranked?.overall)).sort((a, b) => eloOf(b.p.ranked.overall) - eloOf(a.p.ranked.overall));
  const overall = ovs.length ? { ...ovs[0].p.ranked.overall, region: ovs[0].region } : null;
  if (overall && placed) { if (ptsOf(overall) !== sum) delete overall.pos; setPts(overall, sum, usePts || typeof overall.points === 'number'); }
  out.ranked = { ...(list[0].p.ranked || {}), perKit, ...(overall ? { overall } : {}) };
  if (Object.keys(stats).length) out.stats = { ...(out.stats || {}), perKit: stats };
  if (Object.keys(hist).length) out.eloHistory = hist; else delete out.eloHistory;
  out.eloRegion = eloRegion; out.regionOf = regionOf;
  out.recent = mergeMatches(list.map((s) => ({ region: s.region, rows: s.p.recent || [] })));
  return out;
}
