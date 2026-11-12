// All site settings live here. Fill in the placeholders, commit, push.
// Data order: FEED_URL (if https) -> gist mirror. Both unset = sample Preview data.
// While GIST_USER / GIST_ID are unset (or unreachable) the site shows sample "Preview data".
export const CONFIG = {
  SITE_NAME: 'HT3Core',
  SERVER_ADDRESS: 'ht3core.com',         // shown + used for live status (mcsrvstat.us)
  FEED_URL: 'http://na.ht3core.com:8095/api',                          // plugin HTTP API, e.g. 'https://api.example.com/api'. http:// works only when testing on localhost (optional)
  GIST_USER: 'wolftafeta',                      // owner of the public gist the plugin publishes to
  GIST_ID: '694356acbdae715baf25f7b1f4af953d',  // id from the gist URL
  // Regions (STATUS only; stats/leaderboards use FEED_URL). feed = plugin web-feed base WITHOUT /api.
  REGIONS: [
    { id: 'main', name: 'NA', address: 'na.ht3core.com', ping: 'na.ht3core.com', feed: 'http://na.ht3core.com:8095' },
    { id: 'eu', name: 'EU', address: 'eu.ht3core.com', ping: 'eu.ht3core.com', feed: 'http://euht3corecom.blockworlds.io:25384', gistUser: 'wolftafeta', gistId: '578e7a6db1b50613b748a4e36fd86e86' },
  ],
  STORE_URL: '',                                // empty = "Store coming soon"
  DISCORD_URL: 'https://discord.gg/FfxzUrbYCQ',
  STATUS_REFRESH_MS: 60000,
  GIST_REFRESH_MS: 60000,
};


