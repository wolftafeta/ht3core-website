// Generates data/sample/*.json (preview data). Run: node tools/make-sample.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sample');
const w = (n, o) => writeFileSync(join(out, n + '.json'), JSON.stringify(o, null, 1));

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const kits = [['sword','Sword'],['axe','Axe'],['mace','Mace'],['spear','Spear'],['netherite_pot','Netherite Pot'],['diamond_pot','Diamond Pot'],['smp','SMP'],['early_game','Early Game'],['late_game','Late Game'],['end_game','End Game']];
const tiers = [
 ['Bronze','#CD7F32','â—‡',0,999,3],['Silver','#C0C0C0','â—‡',1000,1199,3],['Gold','#FFD700','â˜…',1200,1399,3],
 ['Platinum','#5FE3D6','â–',1400,1599,3],['Diamond','#5EB7FF','âœ¦',1600,1799,3],['Master','#B26BFF','âœ¦',1800,1999,3],
 ['Champion','#FF4D6D','â˜…',2000,null,0]];
const ranks = ['Owner','Admin','Helper','VIP','Member'], places = ['In match','Hub','In queue','Hub'];
w('status', { online: 18, max: 100, playing: 8, queued: 3, inRanked: 4, tps: 19.9, uptimeSeconds: 187000, mcVersion: '1.21.11', motd: 'HT3Core - sample MOTD',
  players: Array.from({ length: 18 }, (_, i) => ({ name: 'Player_' + String(i + 1).padStart(2, '0'), uuid: i % 2 ? 'MHF_Alex' : 'MHF_Steve', rank: ranks[i < 1 ? 0 : i < 2 ? 1 : i < 4 ? 2 : i < 8 ? 3 : 4], place: places[i % 4] })),
  version: '1.21.11', serverName: 'HT3Core', updatedAt: Date.now() });
w('kits', kits.map(([id,name]) => ({ id, name, icon: id })));
w('tiers', tiers.map(([name,colour,symbol,min,max,divisions]) => ({ name, colour, symbol, min, ...(max == null ? {} : { max }), divisions })));

const names = Array.from({ length: 20 }, (_, i) => 'Player_' + String(i + 1).padStart(2, '0'));

function tierOf(elo, first) {
  let t = tiers[0];
  for (const x of tiers) if (elo >= x[3] && x[0] !== 'Champion') t = x;   // Champion = #1 only, no ELO minimum
  if (first) t = tiers[6];
  const span = t[4] == null ? 1 : (t[4] - t[3] + 1) / t[5];
  const idx = Math.min(Math.max(t[5], 1) - 1, Math.floor((elo - t[3]) / span));
  return { tier: t[0], division: t[5] === 0 ? 0 : t[5] - idx, colour: t[1], symbol: t[2] };
}
function board(kitSeed) {
  const list = []; let elo = 2050 + Math.floor(rnd() * 150) + kitSeed;
  names.forEach((name, i) => {
    elo -= Math.floor(25 + rnd() * 110);
    const games = 60 + Math.floor(rnd() * 400), wins = Math.floor(games * (0.78 - i * 0.02));
    list.push({ pos: i + 1, uuid: i % 2 ? 'MHF_Alex' : 'MHF_Steve', name, elo, ...tierOf(elo, i === 0), games, wins, losses: games - wins, champion: i === 0 });
  });
  return list;
}
kits.forEach(([id], i) => w('ranked-' + id, board(i * 15)));
w('ranked-overall', board(40));
// Whole-ladder tier counts (feed: /ranked-tiers?kit=, gist ranked-<kit>-tiers.json)
for (const id of ['overall', ...kits.map((k) => k[0])]) {
  w('ranked-' + id + '-tiers', { tierCounts: { Bronze: 140 + Math.floor(rnd() * 60), Silver: 220 + Math.floor(rnd() * 80), Gold: 130 + Math.floor(rnd() * 50),
    Platinum: 70 + Math.floor(rnd() * 30), Diamond: 30 + Math.floor(rnd() * 20), Master: 8 + Math.floor(rnd() * 8), Champion: 1 } });
}

for (const type of ['wins','kills','streak','winrate']) for (const kid of ['all', ...kits.map(k => k[0])]) {
  w('leaderboard-' + type + '-' + kid, names.map((name, i) => {
    const v = type === 'winrate' ? +(82 - i * 2.1 - rnd() * 2).toFixed(1) : Math.floor((type === 'streak' ? 30 : 900) * (1 - i * 0.07) * (0.9 + rnd() * 0.1));
    return { pos: i + 1, uuid: i % 2 ? 'MHF_Alex' : 'MHF_Steve', name, value: v };
  }));
}

function matches(rankedMode) {
  const now = Date.now();
  return Array.from({ length: 16 }, (_, i) => {
    const [kit, kitName] = kits[i % kits.length];
    const a = names[(i * 3) % 20], b = names[(i * 3 + 5) % 20];
    const delta = 8 + Math.floor(rnd() * 20), before = 1200 + Math.floor(rnd() * 600);
    const m = { id: (rankedMode ? 'r' : 'u') + i, time: now - (i + 1) * 4.5 * 60000, type: rankedMode ? 'ranked' : 'unranked', kit, kitName,
      score: ['5-2','5-3','3-1','5-4','3-0'][i % 5], seconds: 60 + Math.floor(rnd() * 240),
      winners: [{ name: a, ...(rankedMode ? { eloBefore: before, eloAfter: before + delta, delta } : {}) }],
      losers: [{ name: b, ...(rankedMode ? { eloBefore: before, eloAfter: before - delta, delta: -delta } : {}) }] };
    return m;
  });
}
w('matches-ranked', matches(true));
w('matches-unranked', matches(false));

const perKit = {}, rk = {};
kits.forEach(([id], i) => {
  const g = 40 + i * 13, wn = Math.floor(g * 0.6), elo = 900 + i * 170 + Math.floor(rnd() * 60);
  perKit[id] = { wins: wn, losses: g - wn };
  const rw = Math.floor(g * 0.55);
  rk[id] = { elo, games: g, wins: rw, losses: g - rw, bestStreak: 3 + (i % 5), champion: false, ...tierOf(elo, false) };
});
const swap = (m, i) => {
  if (i % 3 === 0) return { ...m, winners: [{ ...m.winners[0], name: 'Player_01' }] };
  return { ...m, losers: [{ ...m.losers[0], name: 'Player_01' }] };
};
const P = { name: 'Player_01', uuid: 'MHF_Steve', rank: 'Owner', online: true, previousNames: ['Example_Old'],
  stats: { overall: { wins: 262, losses: 176, kills: 524, deaths: 380, streak: 4, bestStreak: 17, duelWins: 40, duelLosses: 22, partyWins: 9, partyLosses: 6 }, perKit },
  ranked: { overall: { elo: 1620, games: Object.values(rk).reduce((a, x) => a + x.games, 0), wins: Object.values(rk).reduce((a, x) => a + x.wins, 0), losses: Object.values(rk).reduce((a, x) => a + x.losses, 0), bestStreak: Math.max(...Object.values(rk).map((x) => x.bestStreak)), champion: false, ...tierOf(1620, false) }, perKit: rk },
  tiers: { pvptiers: { sword: { tier: 3, pos: 0, peak_tier: 2, peak_pos: 0, retired: false }, axe: { tier: 2, pos: 1, peak_tier: null, peak_pos: null, retired: false }, mace: { tier: 4, pos: 1, peak_tier: 3, peak_pos: 1, retired: true } }, mctiers: {}, mcpvp: { modes: [{ mode: 'sword', code: 'MT2' }, { mode: 'axe', code: 'HT3' }, { mode: 'mace', code: 'LT3' }], overall: { code: 'MT4', points: 30.5 } } },
  recentMatches: matches(true).slice(0, 8).map(swap) };
// Proposed feed field: eloHistory[kit] = [{t, elo}] oldest first (ranked games only, one point per game), plus ranked.perKit[kit].peak.
P.eloHistory = {};
for (const [id] of kits.slice(0, 5)) {
  const n = 24 + Math.floor(rnd() * 16), pts = []; let e = 1000;
  for (let i = 0; i < n; i++) { e += Math.round((rnd() < 0.56 ? 1 : -1) * (8 + rnd() * 18)); pts.push(e); }
  const shift = rk[id].elo - e; // end exactly at the current ELO
  P.eloHistory[id] = pts.map((v, i) => ({ t: Date.now() - (n - i) * 86400000 * 0.8, elo: v + shift }));
  rk[id].peak = Math.max(...P.eloHistory[id].map((x) => x.elo));
}
w('players', { player_01: P });





