import { el, head, playerLink, timeAgo, fmtDur, regionChip } from './ui.js';

/** Shared with the player page. */
export function matchCard(m, me) {
  const ranked = m.delta != null || m.eloAfter != null;
  const d = m.delta ?? (m.eloAfter != null ? m.eloAfter - m.eloBefore : null);
  const side = (name, uuid, win) => el('div', { class: 'side ' + (win ? 'win' : 'lose') }, head({ name, uuid }, 48, 'head'), playerLink(name), el('small', {}, win ? 'Winner' : 'Loser'));
  return el('article', { class: 'card match rv' + (me ? (m.winner === me ? ' won' : ' lost') : '') },
    el('div', { class: 'mtop' }, el('span', {}, el('span', { class: 'kitchip' }, m.kitName || m.kit), m.region ? ' ' : null, regionChip(m.region)), el('span', { class: 'muted' }, timeAgo(m.time))),
    el('div', { class: 'vs' }, side(m.winner, m.winnerUuid, true), el('div', { class: 'score' }, m.score || 'vs'), side(m.loser, m.loserUuid, false)),
    el('div', { class: 'mbot' }, m.duration ? el('span', { class: 'muted' }, 'Duration ' + fmtDur(m.duration)) : el('span'),
      ranked && d != null ? el('span', { class: 'delta ' + (d >= 0 ? 'up' : 'down') }, (d >= 0 ? '+' : '') + d + ' ELO') : null));
}


