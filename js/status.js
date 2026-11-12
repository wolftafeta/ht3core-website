import { getStatus, refreshMs } from './api.js';
import { CONFIG } from './config.js';
import { el, $, clear, head, mountChrome, skeleton, syncPreview, empty, addressRows, regionChip } from './ui.js';
import { getRegionStatuses, regionPanels, mergedOnline } from './regions.js';
import { renderPanel, updatedText } from './statuscard.js';

mountChrome('status.html');
let players = [], filter = '';

const ORDER = ['owner', 'co-owner', 'admin', 'developer', 'dev', 'manager', 'moderator', 'mod', 'helper', 'builder', 'media', 'youtuber', 'booster', 'vip'];
const weight = (p) => {
  if (typeof p.weight === 'number') return -p.weight;
  const i = ORDER.indexOf(String(p.rank || '').toLowerCase());
  return i < 0 ? 99 : i;
};

let detailed = false;
function drawPlayers() {
  const box = clear($('#players'));
  $('#plcount').textContent = detailed ? `Players online (${players.length})` : 'Players online';
  const list = players.filter((p) => !filter || String(p.name).toLowerCase().includes(filter))
    .sort((a, b) => weight(a) - weight(b) || String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));
  if (!detailed) return box.append(empty('Live player list unavailable.'));
  if (!list.length) return box.append(empty(players.length ? 'No player matches your search.' : 'No one online right now.'));
  for (const p of list) {
    box.append(el('a', { class: 'pcard', href: 'player.html?name=' + encodeURIComponent(p.name) }, head(p, 40, 'head sm'),
      el('div', { class: 'pc-t' }, el('b', {}, p.name), el('span', { class: 'muted' }, p.rank || '', p.region ? ' ' : null, regionChip(p.region))),
      p.place ? el('span', { class: 'kitchip' }, p.place) : null));
  }
}

async function refresh() {
  const mainP = getStatus().catch(() => ({ unknown: true, detailed: false, players: [] }));
  const regP = getRegionStatuses(mainP).catch(() => []);
  const s = await mainP;
  const list = await regP;
  const mo = mergedOnline(list, s);
  players = mo.players; detailed = mo.detailed;
  if (list.length >= 2) {
    // Per-region panels replace the single panel; the server address card is shown once.
    $('#top').replaceChildren(el('div', { class: 'sip card' }, el('span', { class: 'muted' }, 'Server address'), addressRows()), regionPanels(list));
  } else renderPanel($('#top'), s);
  $('#mc').replaceChildren();
  $('#upd').textContent = updatedText(s);
  drawPlayers();
  syncPreview();
}

$('#top').replaceChildren(skeleton(3));
$('#players').replaceChildren(skeleton(4));
$('#filter').addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); drawPlayers(); });
refresh();
setInterval(refresh, refreshMs());