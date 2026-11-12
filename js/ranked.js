import { getKits, getRanked } from './api.js';
import { el, $, clear, head, body, playerLink, tierBadge, tabs, mountChrome, syncPreview, empty, skeleton, num, reveal, regionChip, mountRegionToggle, failNode } from './ui.js';

mountChrome('ranked.html');

function podium(top) {
  const box = clear($('#podium'));
  if (!top.length) return;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  for (const e of order) {
    box.append(el('div', { class: `pod p${e.pos} rv` + (e.champion ? ' champion' : '') },
      body(e, 'body'), el('div', { class: 'medal' }, '#' + e.pos),
      playerLink(e.name, 'cname'), tierBadge(e), el('div', { class: 'elo' }, num(e.elo) + ' ELO ', regionChip(e.region))));
  }
}
function table(list) {
  const box = clear($('#table'));
  if (!list.length) return box.append(empty('No ranked players for this kit yet. Play ranked matches to appear here.'));
  const rows = list.map((e) => el('tr', { class: e.champion ? 'champion' : '' },
    el('td', { class: 'pos' }, e.pos), el('td', {}, el('span', { class: 'who' }, head(e, 32, 'head sm'), playerLink(e.name))),
    el('td', {}, tierBadge(e)), el('td', { class: 'num strong' }, num(e.elo), e.region ? ' ' : null, regionChip(e.region)),
    el('td', { class: 'num hide-s' }, `${e.wins ?? 0} / ${e.losses ?? 0}`), el('td', { class: 'num hide-s' }, e.games ?? '')));
  box.append(el('div', { class: 'tablewrap rv' }, el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {}, ['#', 'Player', 'Tier', 'ELO', 'W / L', 'Games'].map((h, i) => el('th', { class: i > 2 ? 'num' + (i > 3 ? ' hide-s' : '') : '' }, h)))),
    el('tbody', {}, rows))));
}
let token = 0;
async function show(kit, label = 'Overall') {
  const mine = ++token;
  $('#table').replaceChildren(skeleton(8)); clear($('#podium'));
  let list;
  try {
    list = await getRanked(kit);
    if (mine !== token) return;
    podium(list.slice(0, 3));
    if (list.length > 3 || !list.length) table(list.slice(3)); else clear($('#table'));
    reveal(); syncPreview();
  } catch (e) { if (mine === token) clear($('#table')).append(failNode(e)); return; }
}
async function init() {
  let kits = [];
  try { kits = await getKits(); } catch (e) { /* tabs still work with Overall */ }
  const items = [['overall', 'Overall'], ...kits.map((k) => [k.id, k.name])];
  const labelOf = (id) => (items.find((i) => i[0] === id) || [id, id])[1];
  const start = (location.hash || '').slice(1) || 'overall';
  clear($('#tabs')).append(tabs(items, items.some((i) => i[0] === start) ? start : 'overall', (id) => { history.replaceState(null, '', '#' + id); show(id, labelOf(id)); }));
  const first = items.some((i) => i[0] === start) ? start : 'overall';
  show(first, labelOf(first));
}
mountRegionToggle(() => { clear($('#podium')); init(); });
init();




