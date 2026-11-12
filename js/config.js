// All site settings live here. Fill in the placeholders, commit, push.
// Data order: FEED_URL (if https) -> gist mirror. Both unset = sample Preview data.
// While GIST_USER / GIST_ID are unset (or unreachable) the site shows sample "Preview data".
export const CONFIG = {
  SITE_NAME: 'HT3Core',
  SERVER_ADDRESS: 'ht3core.com',         // shown + used for live status (mcsrvstat.us)
  FEED_URL: 'http://ht3core.com:8095/api',                             // plugin HTTP API, e.g. 'https://api.example.com/api'. http:// works only when testing on localhost (optional)
  GIST_USER: 'YOUR_GITHUB_USER',                // owner of the public gist the plugin publishes to
  GIST_ID: 'YOUR_GIST_ID',                      // id from the gist URL
  // Regions (STATUS only; stats/leaderboards use FEED_URL). feed = plugin web-feed base WITHOUT /api.
  REGIONS: [
    { id: 'main', name: 'NA', address: 'ht3core.com', ping: 'na.ht3core.com', feed: 'http://ht3core.com:8095' },
    { id: 'eu', name: 'EU', address: 'euht3corecom.blockworlds.io', ping: 'eu.ht3core.com', feed: 'http://euht3corecom.blockworlds.io:25384' },
  ],
  STORE_URL: '',                                // empty = "Store coming soon"
  DISCORD_URL: 'https://discord.gg/FfxzUrbYCQ',
  STATUS_REFRESH_MS: 60000,
  GIST_REFRESH_MS: 60000,
};


