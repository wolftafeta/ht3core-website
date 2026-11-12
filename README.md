# HT3Core Website

Static site (plain HTML/CSS/JS, no build step) for the HT3Core Minecraft PvP server: home with champions, ranked ladder, ranks, matches, leaderboards and player pages.

## Data sources (both use the same parsing, see the plugin's docs/web-feed.md)
1. **Plugin HTTP API** (`FEED_URL` in `js/config.js`, e.g. `https://api.example.com/api`; the live setting is `http://ht3core.com:8095/api`, port 8095): used first when set. On GitHub Pages it must be **HTTPS**: browsers block calls from an HTTPS page to plain `http://ip:8095`, so put the plugin's port behind a domain with a reverse proxy or Cloudflare. For testing on localhost (page served over http) a plain `http://` URL works; on an https page an http URL is ignored. The plugin needs `web-feed.enabled: true` and the port opened in Pterodactyl; set `web-feed.cors-origin` to your site's origin.
2. **GitHub gist mirror** (`GIST_USER` + `GIST_ID`): used when `FEED_URL` is empty or fails. The plugin publishes the same documents about every 2 minutes as `status`, `kits`, `tiers`, `ranked-overall`, `ranked-<kit>`, `leaderboard-<type>-<kit|all>`, `matches-ranked`, `matches-unranked`, `players` (see docs/web-feed.md for the endpoint to file mapping). Until you have an HTTPS API, this is the source.
3. **mcsrvstat.us fallback**: `https://api.mcsrvstat.us/3/<SERVER_ADDRESS>` gives only a basic online count and is used only when the plugin feed/gist status is unavailable.

If neither `FEED_URL` nor the gist is configured the site shows `data/sample/*.json` with a **Showing sample data** banner. Once a source is configured it never falls back to sample data; failed loads show "Couldn't load right now".

## Settings: `js/config.js`
`SERVER_ADDRESS`, `FEED_URL`, `GIST_USER`, `GIST_ID`, `STORE_URL` (empty = "Store coming soon"), `DISCORD_URL`, `REGIONS` (list of `{id, name, feed}`; `id: 'main'` is the primary feed, e.g. NA, plus extra regions such as EU. `feed` is the plugin base URL WITHOUT `/api`; status, ranked, matches and player pages merge all regions, leaderboards show the main region only). Add the origin of every region feed to `connect-src` in the html files. Everything is public; no secrets here.

## Pictures
`assets/logo.png` (nav, hero, footer, favicon). The hero and page banners use `assets/hub-banner.jpg` (one CSS variable, `--banner-img` in `css/style.css`), a HUD-free crop of the raw screenshot `assets/hub.png`. To use a new screenshot: overwrite `assets/hub.png` and run `powershell -File tools/make-banner.ps1` (optional `-X -Y -W -H` crop rectangle in source pixels).

## Preview locally
`file://` blocks `fetch`, so use a tiny server in this folder:

    python -m http.server 8080      (or: npx serve .)

Open http://localhost:8080. Sample data is regenerated with `node tools/make-sample.mjs`.

## Deploy on GitHub Pages
1. Push this folder to a GitHub repository (branch `main`).
2. Simple way: Settings > Pages > Source "Deploy from a branch" > `main` / `(root)`.
3. Or with Actions: Settings > Pages > Source "GitHub Actions"; `.github/workflows/pages.yml` deploys on every push.
4. Optional custom domain: Settings > Pages > Custom domain.

The gist mirror is enabled in the plugin config (`web-feed.github`); its token stays on the server only, never in this repo.

## Structure
`index.html, ranked.html, ranks.html, matches.html, leaderboards.html, player.html?name=X` - `css/style.css` - `js/` (`config.js`, `api.js` incl. the shared REGIONS parser, `regions.js`, `merge.js`, `ui.js`, `statuscard.js`, `matchcard.js`, `chart.js`, one module per page plus a `*-boot.js` cache-guard loader for home/status/matches/leaderboards/ranks/ranked/player) - `data/sample/` - `tools/make-sample.mjs`.
All feed text is rendered with `textContent` (never `innerHTML`).

## Securing the site (owner checklist)
- **Licence:** `LICENSE` = all rights reserved. The footer and `legal.html` (terms and privacy) say the same.
- **CSP:** every page has a strict Content-Security-Policy via `<meta>` (no inline scripts or inline styles; only this site, the stats sources, mc-heads/crafatar/minotar and Google Fonts). If you change `FEED_URL`, add its origin to `connect-src` in every html file. `frame-ancestors` (clickjacking protection) cannot be set with a meta tag; GitHub Pages does not allow custom headers, so to get it (and HSTS etc.) put the site behind Cloudflare and add a response header `Content-Security-Policy: frame-ancestors 'none'`.
- **GitHub account:** enable 2FA, keep the repository under the owner's account or organisation, and limit who has write access.
- **Branch protection:** Settings > Branches > rule for `main`: block force pushes and deletion, require a pull request before merging.
- **Custom domain:** add it only after verifying it (Settings > Pages > Verified domains, or your account's Pages settings) so nobody can take over a dangling domain. Then tick **Enforce HTTPS**.
- **No secrets in the repo:** this site is public and contains only the server address, the Discord invite and public stats. Never put tokens, passwords or plugin config in it. The gist token lives only in the plugin's config on the server: make it a fine-grained token with only **Gists: read and write**, and rotate it immediately if it ever leaks.
- `.well-known/security.txt` (and a copy in `assets/.well-known/`) and `robots.txt` are included.
## Link previews (og:image)
Every html file has <meta property="og:image" content="https://SITE_URL/assets/hub-banner.jpg">. Replace `SITE_URL` with your final address (e.g. `youruser.github.io/repo` or your domain) in all html files; social sites need an absolute URL (meta tags cannot read `js/config.js`).
