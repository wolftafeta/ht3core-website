// Loads the ranked page; shows a message instead of a blank page if the module chain fails.
// Refresh the module files in the HTTP cache first, so a stale cached api.js/ui.js can't cause a link error.
Promise.all(['config','api','merge','ui','chart','matchcard','ranked'].map((m) => fetch(new URL('./' + m + '.js', import.meta.url), { cache: 'reload' }).catch(() => null))).then(() => import('./ranked.js')).catch((e) => {
  console.error(e);
  const r = document.getElementById('table') || document.querySelector('main') || document.body;
  const p = document.createElement('p'); p.className = 'empty'; p.textContent = "Couldn't load this page. Please hard refresh (Ctrl+F5) or try again in a minute.";
  r.replaceChildren(p);
});

