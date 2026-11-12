import { CONFIG } from './config.js';
import { getStatus, refreshMs, getKits, getRanked, getMatches } from './api.js';
import { getRegionStatuses, regionCards, mergedOnline } from './regions.js';
import { renderPanel, headsRow, updatedText } from './statuscard.js';
import { el, icon, $, clear, head, playerLink, addressRows, skeleton, storeButton, mountChrome, syncPreview, empty, timeAgo, reveal, regionChip } from './ui.js';

mountChrome('index.html');
$('#ip').append(el('span', { class: 'play-label' }, 'Play'), addressRows('addr-rows hero-addr'));
$('#store-slot').append(storeButton());
$('#discord').href = CONFIG.DISCORD_URL; $('#discord').append(icon('discord'), 'Discord');

async function refreshStatus() {
  const box = $('#status');
  try {
    const mainP = getStatus();
    mainP.catch(() => {});
    const regP = getRegionStatuses(mainP.catch(() => ({ unknown: true }))).catch(() => []);
    const s = await mainP;
    const rl = await regP;
    const c = regionCards(rl);
    if (c) box.replaceChildren(c, headsRow({ ...s, ...mergedOnline(rl, s) }, 12));   // compact region cards + heads row only
    else renderPanel(box, s, { limit: 12, noAddr: true });
    $('#upd').textContent = updatedText(s);
    syncPreview();
  } catch (e) { renderPanel(box, { unknown: true }, { noAddr: true }); }
}
box0();
function box0() { $('#status').replaceChildren(skeleton(3)); }refreshStatus();
setInterval(refreshStatus, refreshMs());
async function champions() {
  const box = clear($('#champs'));
  try {
    const kits = await getKits();
    const boards = await Promise.all(kits.map((k) => getRanked(k.id).catch(() => [])));
    kits.forEach((k, i) => {
      const c = boards[i].find((e) => e.champion);
      const card = el('div', { class: 'card champ-card rv' }, el('div', { class: 'kitname' }, k.name));
      if (c) card.append(head(c, 72, 'head big'), playerLink(c.name, 'cname'), el('div', { class: 'elo' }, c.elo + ' ELO ', regionChip(c.region)));
      else card.append(el('div', { class: 'vacant' }, 'Vacant'), el('div', { class: 'muted' }, 'Win ranked games and take #1'));
      box.append(card);
    });
    reveal(); syncPreview();
  } catch (e) { box.append(empty("Couldn't load right now.")); }
}
async function ticker() {
  const box = clear($('#ticker'));
  try {
    const ms = (await getMatches('ranked')).slice(0, 5);
    if (!ms.length) return box.append(empty('No ranked matches have been played yet.'));
    for (const m of ms) {
      box.append(el('div', { class: 'tick' }, head({ name: m.winner, uuid: m.winnerUuid }, 24, 'head sm'), playerLink(m.winner), ' beat ', playerLink(m.loser),
        el('span', { class: 'kitchip' }, m.kitName || m.kit), m.delta != null ? el('span', { class: 'delta up' }, '+' + m.delta) : null, regionChip(m.region), el('span', { class: 'muted' }, timeAgo(m.time))));
    }
    syncPreview();
  } catch (e) { box.append(empty("Couldn't load right now.")); }
}
champions(); ticker();
