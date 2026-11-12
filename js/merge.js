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


const isNum = (v) => typeof v === 'number' && isFinite(v);
const SUM = (a, b) => (isNum(a) || isNum(b) ? (isNum(a) ? a : 0) + (isNum(b) ? b : 0) : undefined);
const MAXF = (a, b) => (isNum(a) && isNum(b) ? Math.max(a, b) : isNum(a) ? a : b);
/** Combine same-shaped stat objects: additive fields summed, peak fields max, streak from `latest`, derived fields dropped. */
function foldStats(objs, latest) {
  const rows = objs.filter(isObj);
  if (!rows.length) return undefined;
  if (rows.length === 1) return rows[0];
  const out = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) {
    if (!isNum(v)) { if (!(k in out) && v != null && !isObj(v)) out[k] = v; continue; }
    out[k] = /^(bestStreak|pointsPeak|peak)$/.test(k) ? MAXF(out[k], v) : /^(streak)$/.test(k) ? (r === latest ? v : out[k] ?? v) : SUM(out[k], v);
  }
  // The plugin's own combined totals (it knows which rows are mirrored) beat summing; if several regions give one, the larger wins.
  const cw = rows.map((r) => r.combined?.wins ?? r.combinedWins).filter(isNum), cl = rows.map((r) => r.combined?.losses ?? r.combinedLosses).filter(isNum);
  if (cw.length) out.wins = Math.max(...cw);
  if (cl.length) out.losses = Math.max(...cl);
  if ((cw.length || cl.length) && 'games' in out) out.games = (out.wins ?? 0) + (out.losses ?? 0);
  for (const k of ['winrate', 'combined', 'combinedWins', 'combinedLosses']) delete out[k];
  return out;
}

/**
 * Player profile = the COMBINED view of every region (sources[0] = main region).
 * Ranked per kit: the region with the most points (tagged with its region unless it is the main one); overall = sum of those.
 * Games / wins / losses / kills / deaths / playtime are summed, best streak and peak points take the max, streak/online/lastSeen the most recent region.
 */
export function mergePlayers(sources) {
  const list = sources.filter((s) => s && isObj(s.p));
  if (list.length < 2) return list.length ? list[0].p : null;
  const homeRegion = list[0].region;
  const tag = (row, region) => { const r = { ...row }; if (region !== homeRegion) r.region = region; else delete r.region; return r; };
  const latest = list.reduce((a, s) => (tms(s.p.lastSeen) > tms(a.p.lastSeen) ? s : a), list[0]);
  const out = { ...list[0].p };
  out.recent = [];
  const seenIds = new Set();
  for (const m of mergeMatches(list.map((s) => ({ region: s.region, rows: s.p.recent || [] })))) {
    if (m.id != null) { if (seenIds.has(m.id)) continue; seenIds.add(m.id); }   // the same match published by both regions
    out.recent.push(m);
  }
  const ids = new Set();
  for (const s of list) for (const k of [...Object.keys(s.p.ranked?.perKit || {}), ...Object.keys(s.p.stats?.perKit || {})]) ids.add(k);
  const perKit = {}, stats = {}, hist = {}, eloRegion = {};
  let sum = 0, placed = 0, usePts = false;
  const kitRows = [];
  for (const k of ids) {
    let best = null;
    const rows = list.map((s) => ({ s, e: s.p.ranked?.perKit?.[k] })).filter((x) => isObj(x.e));
    for (const x of rows) if (!best || eloOf(x.e) > eloOf(best.e)) best = x;
    if (best) {
      const row = tag(best.e, best.s.region);
      for (const f of ['games', 'wins', 'losses']) { const v = rows.reduce((a, x) => SUM(a, x.e[f]), undefined); if (v !== undefined) row[f] = v; }
      for (const f of ['bestStreak', 'pointsPeak', 'peak']) { const v = rows.reduce((a, x) => MAXF(a, x.e[f]), undefined); if (v !== undefined) row[f] = v; }
      perKit[k] = row; kitRows.push(row);
      if (eloOf(best.e) >= 0) { sum += ptsOf(best.e); placed++; if (typeof best.e.points === 'number') usePts = true; }
    }
    const st = foldStats(list.map((s) => s.p.stats?.perKit?.[k]), latest.p.stats?.perKit?.[k]);
    if (st) stats[k] = st;
    // Chart: the region that really has history for this kit (best-points region first), else one with ranked matches of it.
    const order = best ? [best.s, ...list.filter((s) => s !== best.s)] : list;
    const hRegion = order.find((s) => Array.isArray(s.p.eloHistory?.[k]) && s.p.eloHistory[k].length)
      || order.find((s) => out.recent.some((m) => m.kit === k && (m.type || 'ranked') === 'ranked' && m.region === s.region));
    if (hRegion && hRegion.p.eloHistory?.[k]?.length) hist[k] = hRegion.p.eloHistory[k];
    eloRegion[k] = (hRegion || order[0]).region;
  }
  const ovRows = list.filter((s) => isObj(s.p.ranked?.overall));
  let overall = null;
  if (ovRows.length) {
    const top = [...ovRows].sort((a, b) => eloOf(b.p.ranked.overall) - eloOf(a.p.ranked.overall))[0];
    overall = tag(top.p.ranked.overall, top.region);
    for (const f of ['games', 'wins', 'losses']) { const v = ovRows.reduce((a, s) => SUM(a, s.p.ranked.overall[f]), undefined); if (v !== undefined) overall[f] = v; }
    for (const f of ['bestStreak', 'pointsPeak']) { const v = ovRows.reduce((a, s) => MAXF(a, s.p.ranked.overall[f]), undefined); if (v !== undefined) overall[f] = v; }
  } else if (placed) overall = { placed: true };
  if (overall && placed) {
    if (ptsOf(overall) !== sum) delete overall.pos;
    setPts(overall, sum, usePts || typeof overall.points === 'number');
    // Tier styling follows the merged points: an exact match wins (Champion included), else the nearest non-champion rung at or below.
    const cand = [...kitRows, ...ovRows.map((s) => s.p.ranked.overall)].filter((r) => r.tier != null && ptsOf(r) >= 0);
    let d = cand.find((r) => ptsOf(r) === sum);
    if (!d) for (const r of cand.filter((r) => !r.champion).sort((a, b) => ptsOf(a) - ptsOf(b))) if (ptsOf(r) <= sum) d = r;
    for (const k of ['tier', 'symbol', 'colour', 'color', 'division']) { if (d && k in d) overall[k] = d[k]; else delete overall[k]; }
    overall.champion = !!(d && d.champion);
    overall.unranked = false;
    delete overall.region;
  }
  out.ranked = { ...(list[0].p.ranked || {}), perKit, ...(overall ? { overall } : {}) };
  const so = foldStats(list.map((s) => s.p.stats?.overall), latest.p.stats?.overall);
  if (Object.keys(stats).length || so) out.stats = { ...(out.stats || {}), ...(so ? { overall: so } : {}), perKit: stats };
  if (Object.keys(hist).length) out.eloHistory = hist; else delete out.eloHistory;
  out.eloRegion = eloRegion;
  delete out.regionOf;
  // Profile header: most recent region's rank / lastSeen; online if online anywhere; playtime summed; earliest join.
  for (const f of ['rank', 'lastSeen']) if (latest.p[f] != null) out[f] = latest.p[f];
  out.online = list.some((s) => s.p.online);
  const pm = list.reduce((a, s) => SUM(a, s.p.playtimeMinutes), undefined), ps = list.reduce((a, s) => SUM(a, s.p.playtime), undefined);
  if (pm !== undefined) out.playtimeMinutes = pm; else if (ps !== undefined) out.playtime = ps;
  const fj = list.map((s) => s.p.firstJoin ?? s.p.firstJoined).filter(isNum);
  if (fj.length) { out.firstJoin = Math.min(...fj); out.firstJoined = out.firstJoin; }
  const pn = [...new Set(list.flatMap((s) => s.p.previousNames || []))];
  if (pn.length) out.previousNames = pn;
  return out;
}
