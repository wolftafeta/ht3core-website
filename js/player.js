import { getPlayer, getKits } from './api.js';
import { el, $, clear, body, tierBadge, mountChrome, syncPreview, empty, num, pct, fmtPlay, reveal, tabs, regionChip } from './ui.js';
import { lineChart, donut, tierNameOf } from './chart.js';
import { matchCard } from './matchcard.js';

mountChrome('player.html');
const root = $('#player');
const name = new URLSearchParams(location.search).get('name') || '';

let kitNames = {};
const isHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);
// Tier order (best first): HT1 > MT1 > LT1 > HT2 > MT2 > LT2 > ... > LT6 > ST6. Lower score = better.
const tierParse = (t) => /^([HMLS])T?\s*([1-6])$/i.exec(String(t || '').trim());
const tierRank = (t) => {
  const m = tierParse(t);
  return m ? (Number(m[2]) - 1) * 3 + 'HMLS'.indexOf(m[1].toUpperCase()) : 99;
};
// One hue per tier number (so LT3 is clearly above HT4); H brightest, then M, L, S dimmer.
const TIER_HUE = { 1: [255, 210, 74], 2: [240, 138, 60], 3: [160, 116, 240], 4: [63, 197, 192], 5: [151, 160, 178], 6: [108, 116, 135] };
const LETTER_DIM = { H: 1, M: 0.88, L: 0.76, S: 0.66 };
const tierCol = (t) => {
  const m = tierParse(t);
  if (!m) return '#97A0B2';
  const f = LETTER_DIM[m[1].toUpperCase()];
  return '#' + TIER_HUE[m[2]].map((v) => Math.round(v * f).toString(16).padStart(2, '0')).join('');
};
function rankedCard(label, r) {
  const placed = r && r.tier && !r.unranked;
  // The Overall number is the SUM of the played kits' ELO; label it Combined so the big
  // number next to a (average-based) tier badge reads as intended.
  const unit = /overall/i.test(String(label)) ? ' Points ' : ' Points ';
  const card = el('div', { class: 'card rv' + (r && r.champion ? ' champion' : '') }, el('div', { class: 'kitname' }, label));
  if (!placed) {
    // Fresh players start at 0 points: an unplayed kit shows 0, not an empty card.
    card.append(el('span', { class: 'tier', style: '--c:#97A0B2' }, 'Unranked'), el('div', { class: 'elo' }, '0' + unit.trimEnd()));
  } else {
    card.append(tierBadge(r), el('div', { class: 'elo' }, num(r.points ?? r.elo) + unit, regionChip(r.region)));
    if (r.pos) card.append(el('div', { class: 'muted' }, '#' + r.pos));
  }
  return card;
}

/**
 * ELO points for one kit, oldest first: [{y, t, delta}]. Uses p.eloHistory[kit] when the feed has it (array of
 * {t, elo} or plain numbers); otherwise rebuilt from the ranked matches in p.recent (eloBefore/eloAfter of this player).
 */
function eloSeries(p, kit) {
  const h = p.eloHistory?.[kit];
  if (Array.isArray(h) && h.length) {
    return h.map((x, i) => (typeof x === 'number' ? { y: x } : { y: x.elo ?? x.y, t: x.t ?? x.time, delta: x.delta ?? (i && x.elo != null ? x.elo - (h[i - 1].elo ?? h[i - 1]) : undefined) }));
  }
  const me = String(p.name).toLowerCase();
  const reg = p.eloRegion?.[kit];   // cross-region profile: only the region with the higher ELO feeds the chart
  const rows = (p.recent || []).filter((m) => m.kit === kit && (m.type || 'ranked') === 'ranked' && (!reg || !m.region || m.region === reg)).sort((a, b) => (a.time || 0) - (b.time || 0));
  const out = [];
  for (const m of rows) {
    const side = [...(m.winners || []), ...(m.losers || [])].find((x) => String(x.name).toLowerCase() === me);
    if (!side || side.eloBefore == null || side.eloAfter == null) continue;
    if (!out.length) out.push({ y: side.eloBefore, t: m.time ? m.time - (m.seconds || 0) * 1000 : undefined });
    out.push({ y: side.eloAfter, t: m.time, delta: side.eloAfter - side.eloBefore });
  }
  return out;
}

function modesOf(d) {
  if (!d || typeof d !== 'object') return [];
  const m = d.modes ?? d.gamemodes ?? d.tiers ?? d;
  // Feed format: {tier:1-5, pos:0 (HT) | 1 (LT), peak_tier, peak_pos (null = same as current), retired}. Plain strings like "HT3" also accepted.
  const label = (t, pos) => (t == null || t === '' ? '' : typeof t === 'number' ? (pos === 1 ? 'LT' : 'HT') + t : String(t));
  const pretty = (k) => (kitNames[k] || String(k).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  const norm = (k, v) => {
    if (typeof v === 'string') return { mode: pretty(k), tier: label(v) };
    const tier = label(v.tier ?? v.code ?? v.current ?? v.rank, v.pos);
    const pk = label(v.peak_tier ?? v.peak ?? v.peakTier, v.peak_pos ?? v.pos);
    return { mode: pretty(v.mode ?? v.gamemode ?? v.name ?? k), tier, peak: pk && tierRank(pk) < tierRank(tier) ? pk : '', retired: !!v.retired };
  };
  if (Array.isArray(m)) return m.map((x, i) => norm(String(i), x)).filter((x) => x.mode);
  return Object.entries(m).filter(([k, v]) => !['url', 'profileUrl', 'link', 'name', 'uuid', 'status', 'overall', 'points', 'message'].includes(k) && (typeof v === 'string' || (v && typeof v === 'object')))
    .map(([k, v]) => norm(k, v));
}


/** state: 'pending' = still loading, 'final' = gave up waiting. headInfo = {code, points, max} overrides the computed best tier. */
function tierList(title, data, state, headInfo, link) {
  const box = tierListBody(title, data, state, headInfo);
  if (link && isHttps(link.href)) box.append(el('a', { class: 'tlink', href: link.href, target: '_blank', rel: 'noopener noreferrer' }, link.label));
  return box;
}
function tierListBody(title, data, state, headInfo) {
  const modes = (data == null ? [] : modesOf(data)).sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.mode.localeCompare(b.mode));
  const bestMode = modes.find((m) => m.tier && !m.retired) || modes.find((m) => m.tier);
  const code = String(headInfo?.code || bestMode?.tier || '').toUpperCase();
  const pts = headInfo?.points != null ? `${num(headInfo.points)}${headInfo.max != null ? '/' + num(headInfo.max) : ''} pts` : '';
  const badge = code ? el('span', { class: 'bigtier', style: '--c:' + tierCol(code) }, code, pts ? el('small', {}, ' \u00b7 ' + pts) : null) : null;
  const box = el('div', { class: 'card tlist' }, el('div', { class: 'sh' }, el('h3', {}, title), badge));
  if (!modes.length) {
    if (state === 'pending') {
      box.append(el('p', { class: 'muted' }, 'Loading tiers\u2026'), el('div', { class: 'chips' }, Array.from({ length: 6 }, () => el('span', { class: 'tchip skelchip' }))));
    } else box.append(el('p', { class: 'muted' }, state === 'notmc' ? 'Not on MCPVP.' : state === 'mcerr' ? "MCPVP didn't respond, try again later." : data == null && !state ? 'Not loaded yet.' : 'Not tiered.'));
    return box;
  }
  const chips = el('div', { class: 'chips' });
  for (const m of modes) {
    const has = !!m.tier;
    chips.append(el('span', { class: 'tchip' + (has ? '' : ' none') + (m.retired ? ' retired' : ''), style: '--c:' + (has ? tierCol(m.tier) : '#5A6275') },
      el('em', {}, m.mode), el('b', {}, has ? String(m.tier).toUpperCase() : 'Not tiered'),
      m.peak ? el('small', {}, 'Peak ' + String(m.peak).toUpperCase()) : null, m.retired ? el('small', {}, 'Retired') : null));
  }
  box.append(chips);
  return box;
}

/** MCPVP card. data = tiers.mcpvp = {modes:[{mode,code}], overall:{code,points}} */
function mcpvpLink(q, mc) {
  const ok = (u) => isHttps(u) && /^https:\/\/(www\.)?mcpvp\.com\//i.test(u);
  const id = String(q.uuid || '').replace(/-/g, '');
  const href = [mc?.profileUrl, q.mcpvpUrl].find(ok) || (/^[0-9a-f]{32}$/i.test(id) ? 'https://www.mcpvp.com/profile/' + id : '');
  return href ? { href, label: 'Open MCPVP profile' } : null;
}
function mcpvpCard(data, state, link) {
  const o = data && typeof data.overall === 'object' ? data.overall : null;
  const st = data ? String(data.status || 'OK').toUpperCase() : '';
  const eff = state === 'final' ? state : st === 'PENDING' ? 'pending' : st === 'ERROR' ? 'mcerr' : st === 'NOT_TIERED' ? 'notmc' : state;
  return tierList('MCPVP', data == null ? null : { modes: data.modes || [] }, eff, o ? { code: o.code, points: o.points, max: o.maxPoints ?? o.max } : null, link);
}
const isPending = (q) => !!q.tiersPending || String(q.tiers?.mcpvp?.status || '').toUpperCase() === 'PENDING';
const stat = (v, l) => el('div', { class: 'stat' }, el('b', {}, v), el('span', {}, l));
const date = (d) => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); };

(async () => {
  if (!name) return root.append(el('h1', { class: 'ph' }, 'Find a player'), empty('Use the search box in the top bar.'));
  root.append(el('div', { class: 'skel big' }));
  try {
    const [p, kits] = await Promise.all([getPlayer(name), getKits().catch(() => [])]);
    clear(root); syncPreview();
    if (!p) return root.append(el('h1', { class: 'ph' }, name), empty('Player not found. They may not have played yet, or the profile has not been published yet.'));
    document.title = p.name + ' - HT3Core';
    kitNames = Object.fromEntries(kits.map((k) => [k.id, k.name]));
    const kitName = (id) => (kits.find((k) => k.id === id) || {}).name || id;
    const o = p.stats?.overall || {};
    const w = o.wins ?? 0, g = o.games ?? (w + (o.losses ?? 0));
    // Basic entry (known player, no match data): header + friendly empty state instead of zeroed stats.
    const hasMatches = (o.games ?? 0) > 0 || (o.wins ?? 0) > 0 || Object.keys(p.stats?.perKit || {}).length > 0 || Object.keys(p.ranked?.perKit || {}).length > 0 || !!p.ranked?.overall || (p.recent || []).length > 0;
    const noStats = !hasMatches;
    const pt = p.playtimeMinutes ? p.playtimeMinutes * 60 : p.playtime;

    root.append(el('div', { class: 'phead rv' }, body(p, 'body hero-body'),
      el('div', { class: 'pinfo' },
        el('h1', {}, p.name), el('div', { class: 'prow' },
          p.rank ? el('span', { class: 'kitchip' }, p.rank) : null,
          el('span', { class: 'onl' }, el('i', { class: 'dot ' + (p.online ? 'on' : 'off') }), p.online ? 'Online' : 'Offline')),
        p.previousNames?.length ? el('p', { class: 'muted' }, 'Previously: ' + p.previousNames.join(', ')) : null,
        el('p', { class: 'muted' }, [(p.firstJoin ?? p.firstJoined) ? 'Joined ' + date(p.firstJoin ?? p.firstJoined) : '', pt ? 'Playtime ' + fmtPlay(pt) : ''].filter(Boolean).join(' \u00b7 ')),
        noStats ? null : el('div', { class: 'stats' }, stat(num(g), 'games'), stat(num(w), 'wins'), stat(o.winrate != null ? o.winrate + '%' : pct(w, g), 'win rate'),
          stat(num(o.kills), 'kills'), stat(num(o.deaths), 'deaths'), stat(num(o.streak), 'streak'), stat(num(o.bestStreak), 'best streak')))));

    if (noStats) { root.append(empty('No matches yet \u2014 stats appear after their first game.')); reveal(); return; }

    // Ranked: every kit (kits without a ranked game show Unranked), plus overall.
    const rkMap = p.ranked?.perKit || {};
    const ids = kits.length ? kits.map((k) => k.id) : Object.keys(rkMap);
    const cards = ids.map((id) => [kitName(id), rkMap[id]]);
    if (p.ranked?.overall) cards.unshift(['Overall', p.ranked.overall]);
    root.append(el('h2', {}, 'Ranked'));
    root.append(cards.length ? el('div', { class: 'grid tiers' }, cards.map(([label, r]) => rankedCard(label, r))) : empty('No ranked data yet.'));

    // ELO charts: per-kit history (feed field eloHistory, else rebuilt from recentMatches) + win/loss donut.
    const series = {};
    for (const id of ids) { const sr = eloSeries(p, id); if (sr.length > 1) series[id] = sr; }
    const chartIds = Object.keys(series);
    if (chartIds.length) {
      const box = el('div', { class: 'rv' });
      // Combined ELO: at every point in time, the sum of the latest ELO of each kit that has started by then.
      const events = chartIds.flatMap((id) => series[id].filter((x) => x.t).map((x, j) => ({ id, t: x.t, y: x.y, delta: x.delta, note: kitName(id) + (x.delta == null ? ' started' : j === 1 ? ', first game' : '') }))).sort((a, b) => a.t - b.t);
      const latest = {};
      const combined = events.map((e) => { latest[e.id] = e.y; return { t: e.t, y: Object.values(latest).reduce((a, b) => a + b, 0), delta: e.delta, note: e.note }; });
      const tile = (v, l) => el('div', { class: 'etile' }, el('b', {}, v), el('span', {}, l));
      const draw = (id) => {
        const all = id === 'overall';
        const sr = all ? combined : series[id], r = rkMap[id] || {};
        // Ranked record only: an ELO rise is a win, a fall a loss (exact for eloHistory; old data falls back to ranked recent matches).
        const res = (all ? events.filter((e) => e.delta != null).map((e) => e.delta) : sr.slice(1).map((x, i) => x.y - sr[i].y)).filter((d) => d !== 0);
        let w = 0, l = 0, run = 0, bestStreak = 0;
        for (const d of res) { if (d > 0) { w++; run++; bestStreak = Math.max(bestStreak, run); } else { l++; run = 0; } }
        // Explicit ranked fields from the plugin win when fully tracked (wins + losses = games); otherwise the derived values above.
        const ex = all ? p.ranked?.overall : r;
        if (ex && ex.wins != null && ex.losses != null && ex.wins + ex.losses === (ex.games ?? -1)) { w = ex.wins; l = ex.losses; bestStreak = ex.bestStreak ?? bestStreak; }
        const none = w + l === 0;
        const now = sr[sr.length - 1].y, peak = Math.max(...sr.map((x) => x.y), all ? 0 : r.peak ?? 0);
        // Points tiles: feed points / pointsPeak first, then the history-derived values (older feeds).
        const nn = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
        const curPts = nn(ex?.points) ?? now;
        const peakPts = nn(ex?.pointsPeak) ?? Math.max(curPts, nn(ex?.points) != null ? 0 : peak);
        const name = all ? 'Combined rating' : kitName(id) + ' rating';
        box.querySelector('.elo-grid')?.remove();
        box.append(el('div', { class: 'elo-grid' },
          lineChart(sr, { title: name + ' over time', peak: all ? undefined : r.peak, tiers: !all,
            desc: `Current ${num(now)}${all ? ' (sum of every kit)' : ' rating'}. Hover, tap or use the arrow keys to read a point.` }),
          el('div', { class: 'elo-side' },
            donut([{ label: 'Wins', value: w, colour: '#4CC38A' }, { label: 'Losses', value: l, colour: '#E5646E' }],
              { title: 'Ranked wins and losses', big: none ? '\u2014' : pct(w, w + l), small: 'win rate' }),
            el('div', { class: 'etiles' }, tile(num(curPts), all ? 'Combined Points' : 'Current Points'), tile(num(peakPts), 'Peak Points'),
              tile(none ? '\u2014' : num(w + l), 'Ranked games'), all ? tile(none ? '\u2014' : num(bestStreak), 'Best ranked streak') : tile(tierNameOf(now), 'Tier')))));
      };
      root.append(el('h2', {}, 'Rating history'), box);
      const tabItems = chartIds.map((id) => [id, kitName(id)]);
      if (combined.length > 1) tabItems.unshift(['overall', 'Overall']);
      box.append(tabs(tabItems, tabItems[0][0], draw));
      draw(tabItems[0][0]);
    }

    root.append(el('h2', {}, 'External tier lists'));
    const tiersBox = el('div', {});
    root.append(tiersBox);
    const drawTiers = (q, state) => {
      const t = q.tiers || {};
      const pvp = t.pvptiers ?? q.pvptiers ?? q.pvpTiers, mct = t.mctiers ?? q.mctiers ?? q.mcTiers, mc = t.mcpvp ?? q.mcpvp;
      const has = (d) => d != null && modesOf(d).length > 0;
      // Each card is "loading" only while its own source is still missing.
      const st = (loaded) => (state === 'final' ? 'final' : q.tiersPending && !loaded ? 'pending' : '');
      const mcSt = String(mc?.status || '').toUpperCase();
      const mcState = state === 'final' ? 'final' : mcSt === 'PENDING' || (q.tiersPending && !mc) ? 'pending' : '';
      clear(tiersBox).append(el('div', { class: 'grid tlists' },
        tierList('PvPTiers', pvp, st(has(pvp)), null, { href: 'https://pvptiers.com/ranking/overall', label: 'Open PvPTiers' }),
        tierList('MCTiers', mct, st(has(mct)), null, { href: 'https://mctiers.net/rankings/overall', label: 'Open MCTiers' }),
        mcpvpCard(mc ?? null, mcState, mcpvpLink(q, mc))));
    };
    drawTiers(p, '');
    if (isPending(p)) {   // the plugin is still fetching tiers: re-fetch quickly, redrawing every card as soon as its data arrives
      const delays = [1500, 2000, 3000, 4000, 5000, 5000, 5000, 5000];   // ~30 s in total
      let i = 0;
      const again = async () => {
        let q = null;
        try { q = await getPlayer(name); } catch (e) { /* keep waiting */ }
        if (q) drawTiers(q, '');
        if (q && !isPending(q)) return;
        if (++i >= delays.length) return drawTiers(q || p, 'final');
        setTimeout(again, delays[i]);
      };
      setTimeout(again, delays[0]);
    }
    const pk = Object.entries(p.stats?.perKit || {});
    if (pk.length) {
      root.append(el('h2', {}, 'Kit stats'), el('div', { class: 'tablewrap rv' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Kit', 'Games', 'Wins', 'Losses', 'Win rate'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', {}, pk.map(([id, s]) => el('tr', {}, el('td', {}, kitName(id), p.regionOf?.[id] ? ' ' : null, regionChip(p.regionOf?.[id])), el('td', { class: 'num' }, num(s.games ?? (s.wins ?? 0) + (s.losses ?? 0))), el('td', { class: 'num' }, num(s.wins)),
          el('td', { class: 'num' }, num(s.losses)), el('td', { class: 'num' }, pct(s.wins, s.games ?? (s.wins ?? 0) + (s.losses ?? 0)))))))));
    }
    const cols = window.innerWidth >= 960 ? 3 : window.innerWidth >= 640 ? 2 : 1;
    const rec = (p.recent || []).filter((m) => (m.type || 'ranked') === 'ranked').slice(0, cols * 3);
    root.append(el('h2', {}, 'Recent ranked matches'));
    root.append(rec.length ? el('div', { class: 'grid matches m3' }, rec.map((m) => matchCard(m, p.name))) : empty('No ranked games yet.'));
    reveal();
  } catch (e) { clear(root).append(el('h1', { class: 'ph' }, name), empty("Couldn't load right now. Please try again in a minute.")); }
})();




