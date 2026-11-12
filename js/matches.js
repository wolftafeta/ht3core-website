import { getMatches } from './api.js';
import { $, clear, tabs, mountChrome, syncPreview, empty, skeleton, reveal, mountRegionToggle, failNode } from './ui.js';
import { matchCard } from './matchcard.js';

mountChrome('matches.html');

async function show(type) {
  const box = $('#list'); box.replaceChildren(skeleton(6));
  try {
    const ms = await getMatches(type);
    clear(box);
    if (!ms.length) return box.append(empty('No matches here yet. They show up after the next duel.'));
    ms.forEach((m) => box.append(matchCard(m)));
    reveal(); syncPreview();
  } catch (e) { clear(box).append(failNode(e)); }
}
if ($('#list')) {
  let cur = 'ranked';
  const pick = (t) => { cur = t; show(t); };
  $('#tabs').append(tabs([['ranked', 'Recent Ranked'], ['unranked', 'Recent Unranked']], 'ranked', pick));
  mountRegionToggle(() => show(cur));
  show('ranked');
}

