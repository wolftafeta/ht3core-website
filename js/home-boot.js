// Loads the home page; refreshes the module files in the HTTP cache first, so a stale cached
// module (e.g. an old statuscard.js without newer exports) can't break the whole import graph.
Promise.all(['config', 'api', 'ui', 'statuscard', 'regions', 'merge', 'chart', 'matchcard', 'home'].map((m) => fetch(new URL('./' + m + '.js', import.meta.url), { cache: 'reload' }).catch(() => null))).then(() => import('./home.js')).catch((e) => {
  console.error(e);
  const r = document.querySelector('main') || document.body;
  const p = document.createElement('p'); p.className = 'empty'; p.textContent = "Couldn't load this page. Please hard refresh (Ctrl+F5) or try again in a minute.";
  r.replaceChildren(p);
});
