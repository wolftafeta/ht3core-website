// Shared render helpers + page chrome. Feed text is only ever set via textContent.
import { CONFIG } from './config.js';
import { dataState, addresses, regionList, currentRegion, setRegion } from './api.js';

/** Only relative, http(s) and (for src) data:image URLs may reach href/src. */
const safeUrl = (u, k) => {
  const s = u.trim().replace(/[\u0000- ]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!m) return true;
  const p = m[1].toLowerCase();
  return p === 'http' || p === 'https' || (k === 'src' && p === 'data' && /^data:image\//i.test(s));
};
/** el('div', {class:'x', onclick:fn}, 'text', childNode) - strings become text nodes. */
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (/^on/i.test(k) && typeof v !== 'function') continue;                       // never create string event-handler attributes
    if ((k === 'href' || k === 'src') && !safeUrl(String(v), k)) continue;         // drops javascript:/data:text URLs from feed data
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;   // CSSOM (not the style attribute) so a strict CSP is satisfied
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const ICONS = {
  copy: 'M9 9h10v10H9zM5 15V5h10',
  discord: 'M7 8c3-1.5 7-1.5 10 0 1.5 2.5 2.3 5 2.2 8-1.2.9-2.5 1.5-3.8 1.8l-.9-1.5M7 8c-1.5 2.5-2.3 5-2.2 8 1.2.9 2.5 1.5 3.8 1.8l.9-1.5M9 14.5c2 .8 4 .8 6 0',
  cart: 'M3 4h2l2 11h11l2-8H7M10 20h.01M17 20h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
};
/** Inline SVG icon (stroke, currentColor). */
export function icon(name, size = 16) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ico' })) s.setAttribute(k, v);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name]); s.append(p);
  return s;
}
export const clear = (n) => { n.replaceChildren(); return n; };
export const $ = (s, r = document) => r.querySelector(s);

const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#16233f"/><rect x="2" y="1" width="4" height="4" fill="#55ffff"/><rect x="1" y="5" width="6" height="3" fill="#5599ff"/></svg>');
/** Real Mojang UUIDs are version 4. Offline-mode UUIDs (version 3) have no skin on skin services, so those players are looked up by name. */
function skinKeys(p) {
  const raw = String((p && p.uuid) || '').replace(/-/g, '');
  const name = String((p && p.name) || '').replace(/[^A-Za-z0-9_]/g, '');
  const real = /^[0-9a-f]{12}4[0-9a-f]{3}[0-9a-f]{16}$/i.test(raw);
  const sample = /^MHF_/i.test(raw);   // placeholder skins used by the sample data only
  const safeRaw = /^[A-Za-z0-9_]+$/.test(raw) ? raw : '';
  const key = encodeURIComponent(real || sample ? raw : name || safeRaw || 'Steve');
  return { key, uuid: real ? raw : '', name: encodeURIComponent(name) };
}

/** <img> that walks a list of URLs on error, ending in a local placeholder. */
function img(urls, cls, alt, dims) {
  const list = [...urls.filter(Boolean), FALLBACK];
  let n = 0;
  const i = el('img', { src: list[0], class: cls, alt: alt || '', loading: 'lazy', decoding: 'async', width: dims && dims[0], height: dims && dims[1] });
  i.addEventListener('error', () => { if (++n < list.length) i.src = list[n]; });
  return i;
}
export function head(p, size = 40, cls = 'head') {
  const k = skinKeys(p), px = size * 2;
  return img([`https://mc-heads.net/avatar/${k.key}/${px}`, k.uuid && `https://crafatar.com/avatars/${k.uuid}?size=${px}&overlay`, k.name && `https://minotar.net/helm/${k.name}/${px}.png`], cls, (p && p.name) || '', [size, size]);
}
export function body(p, cls = 'body') {
  const k = skinKeys(p);
  return img([`https://mc-heads.net/body/${k.key}/right`, k.uuid && `https://crafatar.com/renders/body/${k.uuid}?overlay&scale=6`, k.name && `https://minotar.net/armor/body/${k.name}/200.png`], cls, (p && p.name) || '', [150, 304]);
}
export function playerLink(name, cls) {
  return el('a', { href: 'player.html?name=' + encodeURIComponent(name || ''), class: cls || 'plink' }, name || '?');
}

/** Tiny gray region tag; null when the data is not cross-region (single source). */
export const regionChip = (r) => (r ? el('span', { class: 'rgtag', title: r + ' region' }, r) : null);

export function tierBadge(e) {
  const t = el('span', { class: 'tier' + (e.champion ? ' champ' : ''), style: `--c:${/^#[0-9a-f]{3,8}$/i.test(e.colour) ? e.colour : '#55ffff'}` },
    el('span', { class: 'sym', 'aria-hidden': 'true' }, e.symbol || '◆'), ' ', e.champion ? 'Champion' : (e.tier || '?'), (typeof e.division === 'number' ? ['', 'I', 'II', 'III'][e.division] : e.division) ? ' ' + (typeof e.division === 'number' ? ['', 'I', 'II', 'III'][e.division] : e.division) : '');
  return t;
}

export function timeAgo(t) {
  const ms = typeof t === 'number' && t < 1e11 ? t * 1000 : new Date(t).getTime();
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const u = [[86400, 'd'], [3600, 'h'], [60, 'min']];
  for (const [n, l] of u) if (s >= n) return Math.floor(s / n) + ' ' + l + ' ago';
  return '';
}
export const fmtDur = (s) => (s ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '');
export const fmtPlay = (s) => (s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' : Math.floor((s || 0) / 60) + 'm');
export const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : n ?? '-');
export const pct = (w, g) => (g ? Math.round((w / g) * 100) + '%' : '-');

export function empty(msg) { return el('p', { class: 'empty' }, msg); }
export function skeleton(n = 5) { return el('div', { class: 'skel-wrap' }, Array.from({ length: n }, () => el('div', { class: 'skel' }))); }

export function copyButton(text, label) {
  const b = el('button', { class: 'ip-btn', type: 'button', 'aria-label': 'Copy server IP ' + text },
    el('span', { class: 'ip-text' }, text), el('span', { class: 'ip-hint' }, icon('copy', 14), el('span', {}, label || 'Click to copy')));
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
    }
    const h = $('.ip-hint span', b); h.textContent = 'Copied'; b.classList.add('copied');
    setTimeout(() => { h.textContent = label || 'Click to copy'; b.classList.remove('copied'); }, 1800);
  });
  return b;
}

/** Compact address rows: region label + address + copy button (label omitted for a single address). */
export function addressRows(cls = 'addr-rows') {
  return el('div', { class: cls }, addresses().map((a) => el('div', { class: 'addr-row' }, a.name ? el('b', { class: 'addr-rg' }, a.name) : null, copyButton(a.address, 'Copy'))));
}
export function storeButton(cls = '') {
  const url = (CONFIG.STORE_URL || '').trim();
  return url
    ? el('a', { class: 'btn store ' + cls, href: url, target: '_blank', rel: 'noopener' }, icon('cart', 16), 'Store')
    : el('span', { class: 'btn store soon ' + cls, 'aria-disabled': 'true' }, 'Store coming soon');
}

const PAGES = [['index.html', 'Home'], ['ranked.html', 'Ranked'], ['ranks.html', 'Ranks'], ['matches.html', 'Matches'], ['leaderboards.html', 'Leaderboards'], ['status.html', 'Status']];

/** Builds nav + footer; call once per page. active = file name. */
export function mountChrome(active) {
  const links = el('div', { class: 'links', id: 'links' }, PAGES.map(([h, l]) => el('a', { href: h, class: h === active ? 'on' : '' }, l)), storeButton('small menu-store'));
  const input = el('input', { type: 'search', name: 'name', placeholder: 'Find a player', 'aria-label': 'Search player', maxlength: '16', autocomplete: 'off' });
  const form = el('form', { class: 'search', role: 'search' }, icon('search', 15), input);
  form.addEventListener('click', () => input.focus());
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (v) location.href = 'player.html?name=' + encodeURIComponent(v); });
  const burger = el('button', { class: 'burger', type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false' }, el('span'), el('span'), el('span'));
  burger.addEventListener('click', () => { const o = document.body.classList.toggle('menu-open'); burger.setAttribute('aria-expanded', o); });
  const nav = el('nav', { class: 'nav' }, el('div', { class: 'wrap navin' },
    el('a', { href: 'index.html', class: 'brand' }, el('img', { src: 'assets/logo.png', alt: '', width: 32, height: 32 }), el('span', {}, 'HT3Core')),
    links, el('div', { class: 'navr' }, form, storeButton('small nav-store')), burger));
  document.body.prepend(nav);

  const foot = el('footer', { class: 'foot' }, el('div', { class: 'wrap' },
    el('div', { class: 'fbrand' }, el('img', { src: 'assets/logo.png', alt: '', width: 28, height: 28 }), el('strong', {}, 'HT3Core'), el('span', { class: 'muted' }, addresses().map((a) => (a.name ? a.name + ' ' : '') + a.address).join(' \u00b7 '))),
    el('div', { class: 'muted' }, '\u00a9 2026 HT3Core. All rights reserved. Not affiliated with Mojang or Microsoft.'),
    el('div', { class: 'muted' }, el('a', { href: 'legal.html' }, 'Terms and privacy'), ' \u00b7 Skins by mc-heads.net')));
  document.body.append(foot);
  banner(dataState());
}

const PREVIEW_TEXT = 'Showing sample data - live stats connect soon.';
// A feed outage shows as Offline on the status cards: players never see a technical error banner.
function banner(s) {
  let b = document.getElementById('data-banner');
  if (s !== 'preview') return b && b.remove();
  if (!b) { b = el('div', { id: 'data-banner', class: 'banner', role: 'status' }); document.body.prepend(b); }
  b.textContent = PREVIEW_TEXT;
}
/** Kept for page scripts; the banner follows the data state automatically. */
export const syncPreview = () => banner(dataState());
window.addEventListener('ht3-data-state', (e) => banner(e.detail));

export function tabs(items, current, onPick) {
  const wrap = el('div', { class: 'tabs', role: 'tablist' });
  const draw = (cur) => {
    clear(wrap);
    for (const [id, label] of items) {
      const b = el('button', { type: 'button', role: 'tab', class: 'tab' + (id === cur ? ' on' : ''), 'aria-selected': String(id === cur) }, label);
      b.addEventListener('click', () => { draw(id); onPick(id); });
      wrap.append(b);
    }
  };
  draw(current);
  return wrap;
}

/** NA | EU pills placed before the page's #tabs; onChange runs after the region is saved. */
export function mountRegionToggle(onChange) {
  const items = regionList().map((r) => [r.id, r.name]);
  if (items.length < 2) return;
  const t = tabs(items, currentRegion(), (id) => { setRegion(id); onChange(id); });
  t.classList.add('rgtabs');
  const host = el('div', { class: 'regionbar' }, t);
  const anchor = $('#tabs'); if (anchor) anchor.before(host);
}
/** Friendly message for a failed load: EU-style "no data source yet" or the generic one. */
export function failNode(e) {
  return empty(e && e.regionOffline
    ? 'EU data needs the EU mirror - coming soon. Switch to NA to see live stats.'
    : "Couldn't load right now. Please try again in a minute.");
}

/** Entrance animation on scroll. */
export function reveal() {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.05 });
  document.querySelectorAll('.rv:not(.in)').forEach((n) => io.observe(n));
}
