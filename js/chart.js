// Tiny dependency-free SVG charts (CSP: no CDN libs). lineChart, barChart, donut. Sized from the container, redrawn on resize.
import { el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) n.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};
let uid = 0;

/** Tier floors/names/colours, same as the plugin's RankedManager (Champion is rank based, so it has no band). */
export const TIER_BANDS = [
  { name: 'Bronze', min: 0, max: 1000, colour: '#CD7F32' }, { name: 'Silver', min: 1000, max: 1200, colour: '#C0C0C0' },
  { name: 'Gold', min: 1200, max: 1400, colour: '#FFD700' }, { name: 'Platinum', min: 1400, max: 1600, colour: '#5FE3D6' },
  { name: 'Diamond', min: 1600, max: 1800, colour: '#5EB7FF' }, { name: 'Master', min: 1800, max: 100000, colour: '#B26BFF' },
];
export const tierNameOf = (elo) => (TIER_BANDS.find((b) => elo >= b.min && elo < b.max) || TIER_BANDS[0]).name;

/** Frame: titled figure with a tooltip layer; draw(width, tip) is called now and on every resize. */
function frame(title, desc, draw, cls = '') {
  const id = 'ch' + ++uid;
  const tip = el('div', { class: 'ch-tip', role: 'status', hidden: '' });
  const holder = el('div', { class: 'ch-holder' });
  const box = el('figure', { class: 'chart ' + cls }, el('figcaption', { class: 'ch-title', id: id + 't' }, title),
    desc ? el('p', { class: 'ch-desc muted', id: id + 'd' }, desc) : null, holder, tip);
  const show = (x, y, html) => {
    tip.replaceChildren(...html); tip.hidden = false;
    const w = box.clientWidth, tw = tip.offsetWidth, hr = holder.offsetTop;
    tip.style.left = Math.max(4, Math.min(w - tw - 4, x - tw / 2)) + 'px';
    tip.style.top = Math.max(0, y + hr - tip.offsetHeight - 10) + 'px';
  };
  const hide = () => { tip.hidden = true; };
  let last = 0;
  const render = () => {
    const w = Math.floor(holder.clientWidth || box.clientWidth);
    if (w < 80 || w === last) return;
    last = w; hide();
    holder.replaceChildren(draw(w, { show, hide, id }));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(render).observe(holder);
  else window.addEventListener('resize', render);
  queueMicrotask(render); setTimeout(render, 60);
  return box;
}
const ariaFor = (svg, id, title, summary) => {
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', title + '. ' + summary);
  return svg;
};
const dateText = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const line = (a, b) => el('div', {}, el('b', {}, a), b ? ' ' + b : '');

/**
 * ELO line. points: [{y, t?, label?, delta?}] oldest first. opts: {title, peak, tiers (tier name in tooltip), desc}.
 * Marks the current value and the peak.
 */
export function lineChart(points, opts = {}) {
  const pts = points.filter((p) => Number.isFinite(p.y));
  const title = opts.title || 'Rating over time';
  if (!pts.length) return frame(title, opts.desc, () => el('p', { class: 'empty' }, 'No data yet.'), 'ch-line-box');
  const ys = pts.map((p) => p.y);
  const peakY = Math.max(opts.peak ?? -Infinity, ...ys);
  const summary = pts.length ? `${pts.length} points, from ${pts[0].y} to ${pts[pts.length - 1].y}, peak ${peakY}.` : 'No data.';
  return frame(title, opts.desc, (W, tip) => {
    const H = W < 460 ? 220 : 280, m = { l: 44, r: 12, t: 12, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const lo0 = Math.min(...ys), hi0 = peakY, pad = Math.max(40, (hi0 - lo0) * 0.15);
    const lo = Math.floor((lo0 - pad) / 50) * 50, hi = Math.ceil((hi0 + pad) / 50) * 50;
    const X = (i) => m.l + (pts.length < 2 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const Y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ch-svg', tabindex: 0 });
    ariaFor(svg, tip.id, title, summary);
    const step = (hi - lo) / 4;
    for (let i = 0; i <= 4; i++) {
      const v = Math.round(lo + step * i);
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'ch-grid' }), s('text', { x: m.l - 6, y: Y(v) + 4, class: 'ch-axis', 'text-anchor': 'end' }, v));
    }
    const timed = pts.length > 1 && pts.every((p) => p.t);
    const ticks = Math.min(pts.length, W < 460 ? 3 : 5);
    for (let k = 0; k < ticks && pts.length > 1; k++) {
      const i = Math.round((k / (ticks - 1)) * (pts.length - 1));
      svg.append(s('text', { x: X(i), y: H - 8, class: 'ch-axis', 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' }, timed ? dateText(pts[i].t) : pts[i].label || '#' + (i + 1)));
    }
    if (!pts.length) return svg;
    svg.append(s('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(''), class: 'ch-line' }));
    const pi = ys.lastIndexOf(Math.max(...ys));
    const showPeak = opts.peak == null || opts.peak <= peakY;
    const last = pts.length - 1;
    svg.append(s('circle', { cx: X(last), cy: Y(pts[last].y), r: 5, class: 'ch-now' }));
    svg.append(s('text', { x: Math.min(X(last), W - m.r - 2), y: Y(pts[last].y) - 10, class: 'ch-mark', 'text-anchor': 'end' }, 'Now ' + pts[last].y));
    if (showPeak && pi !== last) {
      svg.append(s('circle', { cx: X(pi), cy: Y(peakY), r: 4, class: 'ch-peak' }), s('text', { x: X(pi), y: Y(peakY) - 8, class: 'ch-mark gold', 'text-anchor': 'middle' }, 'Peak ' + peakY));
    }
    const cursor = s('circle', { r: 5, class: 'ch-cur', visibility: 'hidden' });
    svg.append(cursor);
    let sel = last;
    const focus = (i) => {
      sel = Math.max(0, Math.min(last, i));
      const p = pts[sel];
      cursor.setAttribute('cx', X(sel)); cursor.setAttribute('cy', Y(p.y)); cursor.setAttribute('visibility', 'visible');
      tip.show(X(sel), Y(p.y), [line(p.y + ' rating', tierNameOf(p.y)),
        p.delta != null ? line((p.delta > 0 ? '+' : '') + p.delta, 'this match') : null, p.t ? el('div', { class: 'muted' }, dateText(p.t)) : null].filter(Boolean));
    };
    const at = (e) => { const r = svg.getBoundingClientRect(); return pts.length < 2 ? 0 : Math.round(((e.clientX - r.left) * (W / r.width) - m.l) / iw * last); };
    svg.addEventListener('pointermove', (e) => focus(at(e)));
    svg.addEventListener('pointerdown', (e) => focus(at(e)));
    svg.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); tip.hide(); });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); focus(sel + (e.key === 'ArrowLeft' ? -1 : 1)); }
    });
    svg.addEventListener('blur', () => { cursor.setAttribute('visibility', 'hidden'); tip.hide(); });
    return svg;
  }, 'ch-line-box');
}

/** Donut. parts: [{label, value, colour}]. centre: {big, small}. */
export function donut(parts, opts = {}) {
  const title = opts.title || 'Chart';
  const total = parts.reduce((a, p) => a + p.value, 0);
  const summary = parts.map((p) => `${p.label} ${p.value}`).join(', ');
  return frame(title, opts.desc, (W, tip) => {
    const size = Math.min(160, W), r = size / 2 - 10, c = size / 2, sw = 16, circ = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ch-svg ch-donut' });
    ariaFor(svg, tip.id, title, summary);
    svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', class: 'ch-ring', 'stroke-width': sw }));
    let off = 0;
    for (const p of parts) {
      if (!(p.value > 0)) continue;
      const len = (p.value / total) * circ;
      const seg = s('circle', { cx: c, cy: c, r, fill: 'none', stroke: p.colour, 'stroke-width': sw, 'stroke-dasharray': `${len} ${circ - len}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})`, tabindex: 0, 'aria-label': `${p.label}: ${p.value}` });
      const open = () => tip.show(c, c, [line(String(p.value), p.label), el('div', { class: 'muted' }, Math.round((p.value / total) * 100) + '%')]);
      seg.addEventListener('pointerenter', open); seg.addEventListener('focus', open); seg.addEventListener('pointerdown', open);
      seg.addEventListener('pointerleave', tip.hide); seg.addEventListener('blur', tip.hide);
      svg.append(seg); off += len;
    }
    svg.append(s('text', { x: c, y: c + 2, class: 'ch-big', 'text-anchor': 'middle' }, opts.big ?? ''), s('text', { x: c, y: c + 18, class: 'ch-axis', 'text-anchor': 'middle' }, opts.small ?? ''));
    const legend = el('ul', { class: 'ch-legend' }, parts.map((p) => el('li', {}, el('i', { class: 'sw', style: 'background:' + p.colour }), `${p.label} ${p.value}`)));
    return el('div', { class: 'ch-donutbox' }, svg, legend);
  }, 'ch-donutwrap');
}


