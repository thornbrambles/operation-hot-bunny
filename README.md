# Operation Hot Bunny

**A browser-only creature bracket. Twitch and YouTube chat choose the champion by sending `1` or `2`.**

[Open the app](https://thornbrambles.github.io/operation-hot-bunny/)

No Streamer.bot, Python, server, database, or paid hosting is required to run the app. GitHub Pages serves the HTML, CSS, and JavaScript. The open browser tab connects directly to the platform chat services. Chat connections require one-time OAuth application setup below.

## Use it

1. Open the app in a current desktop browser.
2. Name 2, 4, 8, 16, or 32 competitors. Paste an image into a focused image box, drag in an image **file**, or use **Choose image**.
3. Click **Save lineup & start bracket**. The existing bracket is replaced only after confirmation.
4. Connect Twitch, YouTube, or both; alternatively enable **Demo mode** to try everything without signing in.
5. Click **Start vote**. Chat sends exactly `1` for the left competitor or `2` for the right. Surrounding whitespace is ignored. Each platform account has one vote; sending the other number changes it.
6. Click **End vote & reveal winner**. The winner stays on the stage until the next vote starts. A tie or no votes leaves the bracket unchanged. Use the manual winner buttons if desired.
7. Continue until there is a champion. **Undo last result** restores the previous matchup.

The app combines both platforms. It cannot identify the same person across Twitch and YouTube, so a person with accounts on both can vote once on each platform. Old chat messages, duplicate message IDs, and messages sent before a vote starts are ignored. Closing a vote ignores messages sent after its cutoff. Accounts can change their votes before that cutoff.

## OBS

Use **Window Capture** for the browser window and crop to the cream-colored voting stage at the bottom. Or click **Focus stage for OBS** to hide the controls in that same tab. Press Escape to return. The stage shows the matchup, counts while voting is open, the winning creature, and finally the champion.

Keep the controlling tab open and active while voting. Minimized/background tabs may throttle chat polling. An independently loaded OBS **Browser Source** has a separate browser environment and will not mirror this tab's state. This version intentionally uses window capture so it does not need a relay service.

## Chat connection setup

Client IDs identify an application and are public. **Never paste a client secret, password, or access token into the settings fields or GitHub.** Tokens obtained by sign-in remain in memory; reconnect after a page reload. The app requests read-only chat access and does not send messages, moderate, or create native platform polls.

### Twitch

1. Register an application in the [Twitch developer console](https://dev.twitch.tv/console/apps) with category **Website Integration**.
2. Register this exact OAuth redirect URL: `https://thornbrambles.github.io/operation-hot-bunny/`.
3. This deployment already has its Twitch Client ID configured. Enter the channel's login name, not its display name or full URL. For your own fork, set `TWITCH_CLIENT_ID` in app.js to your registered app's public Client ID.
4. Click **Connect Twitch** and authorize chat reading.

The app uses Twitch's [browser OAuth flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow), validates the token and client ID, requests `chat:read`, and connects to [Twitch IRC over secure WebSocket](https://dev.twitch.tv/docs/chat/irc/). It validates active tokens hourly. A lost connection closes an open vote without advancing a winner; reconnect and start a new vote.

### YouTube

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/), then enable **YouTube Data API v3**.
2. Configure the Google Auth Platform consent screen. For a personal project in testing, add her Google account as a test user. Publishing broadly may require Google's verification process.
3. Create an OAuth client of type **Web application**. Add **Authorized JavaScript origin** `https://thornbrambles.github.io` (origins do not contain a path).
4. This deployment already has its Google Client ID configured. For your own fork, set `GOOGLE_CLIENT_ID` in app.js to your registered app's public client ID ending in `.apps.googleusercontent.com`. No client secret is used.
5. Paste the live YouTube video's URL, click **Connect YouTube**, and authorize read-only YouTube access. The stream needs an active live chat.

The app uses Google's [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) and reads [live chat messages](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list). It discards the initial chat history and polls subsequent pages no faster than every 10 seconds or the API's required interval, whichever is longer. Each chat-list request currently costs 5 quota units. YouTube is therefore slower than Twitch and is subject to your project's daily API quota. A quota error, expired authorization, or ended stream closes the vote without selecting a winner.

**End vote** waits for the final permitted YouTube poll so messages sent before the cutoff can be counted. This normally takes up to the polling interval plus network time. Votes sent after pressing End are excluded. If the final fetch fails, no automatic winner is selected.

For a fork, replace the Twitch redirect and Google origin with your own Pages address. Both public app client IDs are configured in app.js. Replace them with your own registered application IDs when forking. No client secrets or access tokens are committed.

## Pictures, saving, and backups

PNG, JPEG, WebP, and GIF files up to 20 MB are accepted, resized to a maximum side of 800 pixels, and stored as PNG data in this browser's IndexedDB. Animated images become a still frame. Transparency is preserved. Copy the **image**, not its link; dragging from another website may supply only a URL, so save the file first or use Copy image.

Pictures, draft lineup, bracket progress, and undo history stay on the device; they are not uploaded to GitHub or the chat platforms. Editing the draft does not alter the active bracket until you save/start it. Progress saves after each result. Open votes do not resume after reloading.

**Export backup** saves the active bracket, pictures, progress, and undo history. Save the lineup first if you want draft edits in that backup. **Import backup** validates the file and asks before replacing the bracket. Backups exclude chat credentials and voter IDs. Clearing site data, changing browser/profile, or using private browsing can lose the local copy, so export a backup for anything you want to keep. Use one controlling tab at a time.

## Development and checks

Node 22 or later is needed only for local development/testing:

```sh
npm test
npm start
```

The preview opens at `http://127.0.0.1:8790`. For local OAuth, additionally register that exact origin with Google and `http://127.0.0.1:8790/` as a Twitch redirect URL. No packages need installing.

Automated tests cover all supported bracket sizes, undo/import, ties, no votes, combined totals, changing votes, duplicate/reordered/stale messages, IRC parsing, Twitch connection/keepalive events, and YouTube pagination/quota failures using mocked platform responses. Browser QA checks image paste/file selection, demo voting, winner display, reload persistence, and focus mode. **Actual Twitch/YouTube sign-in and a live broadcast still require configured app IDs and the host's account approval; those are not proven by mock tests.**

GitHub Actions runs tests and publishes the static files to Pages. Pages source should be set to **GitHub Actions**.

See [ROADMAP.md](ROADMAP.md) for possible future work.
