import { getTiers } from './api.js';
import { el, $, clear, tierBadge, mountChrome, syncPreview, empty, reveal } from './ui.js';

mountChrome('ranks.html');
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
(async () => {
  const box = clear($('#ladder'));
  try {
    const isChamp = (t) => /champion/i.test(t.name);
    const tiers = (await getTiers()).slice().sort((a, b) => (isChamp(b) - isChamp(a)) || b.min - a.min);   // Champion first
    for (const t of tiers) {
      const champ = /champion/i.test(t.name);
      const range = champ ? 'Top player' : t.max == null ? `${t.min}+` : t.min === 0 || t.min == null ? `Below ${t.max + 1}` : `${t.min} - ${t.max}`;
      const divs = el('div', { class: 'divs' });
      const n = t.divisions || 1;
      if (n > 1 && t.max != null) {
        const span = (t.max - t.min + 1) / n;
        for (let i = n - 1; i >= 0; i--) divs.append(el('span', { class: 'div' }, `${ROMAN[n - i - 1]} `, el('em', {}, `${Math.round(t.min + span * i)}+`)));
      }
      box.append(el('div', { class: 'card tierrow rv' + (champ ? ' champion' : ''), style: `--c:${/^#[0-9a-f]{3,8}$/i.test(t.colour) ? t.colour : '#55ffff'}` },
        tierBadge({ tier: t.name, colour: t.colour, symbol: t.symbol, champion: champ }),
        el('div', { class: 'range' }, champ ? range : range + ' Points'),
        champ ? el('p', { class: 'muted' }, 'The #1 player of each kit, plus one overall.') : divs));
    }
    reveal(); syncPreview();
  } catch (e) { box.append(empty("Couldn't load right now.")); }
})();
