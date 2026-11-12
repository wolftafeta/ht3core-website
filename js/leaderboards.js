import { getKits, getLeaderboard } from './api.js';
import { el, $, clear, head, playerLink, tabs, mountChrome, syncPreview, empty, skeleton, num, reveal } from './ui.js';

mountChrome('leaderboards.html');
const TYPES = [['wins', 'Wins'], ['kills', 'Kills'], ['streak', 'Win streak'], ['winrate', 'Win rate']];
let type = 'wins', kit = 'all';

const KIT_TYPES = ['wins', 'winrate'];
function syncKits() {
  const ok = KIT_TYPES.includes(type);
  if (!ok) kit = 'all';
  $('#kits').hidden = !ok;
  $('#kits').replaceChildren(tabsFor());
}
let kitList = [];
const tabsFor = () => tabs([['all', 'All kits'], ...kitList.map((k) => [k.id, k.name])], kit, (id) => { kit = id; show(); });
async function show() {
  const box = $('#table'); box.replaceChildren(skeleton(8));
  try {
    const list = await getLeaderboard(type, kit);
    clear(box);
    if (!list.length) return box.append(empty('Nothing here yet. Check back after a few matches.'));
    const label = TYPES.find((t) => t[0] === type)[1];
    box.append(el('div', { class: 'tablewrap rv' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Player'), el('th', { class: 'num' }, label))),
      el('tbody', {}, list.map((e, i) => el('tr', { class: i === 0 ? 'champion' : '' },
        el('td', { class: 'pos' }, e.pos ?? i + 1), el('td', {}, el('span', { class: 'who' }, head(e, 32, 'head sm'), playerLink(e.name))),
        el('td', { class: 'num strong' }, type === 'winrate' ? num(e.value) + '%' : num(e.value))))))));
    reveal(); syncPreview();
  } catch (e) { clear(box).append(empty("Couldn't load right now. Please try again in a minute.")); }
}
(async () => {
  $('#tabs').append(tabs(TYPES, type, (id) => { type = id; syncKits(); show(); }));
  try { kitList = await getKits(); } catch (e) { /* only "All kits" */ }
  $('#kits').classList.add('subtabs');
  syncKits();
  show();
})();
