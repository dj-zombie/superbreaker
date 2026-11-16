# CrazyGames

How the game is built and submitted for [crazygames.com](https://crazygames.com). Their rules are
at [docs.crazygames.com](https://docs.crazygames.com); this page is only what applies here.

CrazyGames launches a game in two stages. **Basic Launch** puts it in front of a limited audience
for 7 to 21 days with monetization switched off, and needs no platform-specific work. If the
engagement metrics hold up, the game is invited to **Full Launch**, which needs the SDK wired in
properly and turns on revenue share. The SDK is already wired in, so the same bundle serves both
stages; see [Promoting to Full Launch](#promoting-to-full-launch) for the one flag that changes.

## Building the upload

```sh
pnpm crazy:pack      # builds dist-crazygames/ and zips it into release/
pnpm crazy:preview   # serves the built bundle on localhost for a last look
```

`scripts/pack-crazygames.mjs` writes `release/superbreaker-crazygames.zip` with `index.html` at the
root, which is the shape their uploader wants. It drops the files other targets need and this one
does not — Cloudflare's `_headers` and the PWA and app-store icons — then measures the bundle
against their hard limits and fails the build if any is breached:

| Limit                         | Theirs | Ours                         |
| ----------------------------- | ------ | ---------------------------- |
| Total size                    | 250MB  | 32.6MB                       |
| File count                    | 1500   | 291                          |
| Initial download              | 50MB   | 19.9MB desktop, 14.9MB phone |
| Initial download, mobile home | 20MB   | 14.9MB, so eligible          |

The initial download is what the player fetches between the page opening and the first
`gameplayStart` event, which this game reports when a level scene opens. Everything in
`AUDIO_ASSETS` and `IMAGE_ASSETS` preloads before the title screen, but backdrop art does not:
`ParallaxBackdrop.preload` pulls one world at one resolution from the Play scene, and phones take
the smaller set. That is why the figure differs by device, and why the packer reports both.

Keeping the phone figure under 20MB is what makes the game eligible for their mobile home page, so
it is worth watching when assets are added.

## What the build changes

`vite build --mode crazygames` differs from the web build in three ways, all because the game runs
in an iframe on their domain off their CDN:

- No service worker. `vite.config.ts` disables the PWA plugin, and `main.ts` skips registration.
- The SDK is loaded and initialized before anything else, so the save store has account storage to
  read from on its first call.
- No game-owned fullscreen, and no rotate prompt. Their page frame owns both, and a game that
  brings its own fullscreen button is rejected for interfering with their ads.

Paths stay relative because `base` is already `'./'`; absolute paths fail to load in their bundle.

## SDK integration

`src/platform/crazygames.ts` is the whole bridge. Outside this build `IS_CRAZYGAMES` is false, so
`initCrazyGames` never loads the script and every other call returns immediately — the module still
ships in the other bundles, it just does nothing there. Nothing in it throws either: the SDK is
disabled on any domain that is not theirs, and a blocked script must not take the game down.

| Their module                    | Where it is used                                                        |
| ------------------------------- | ----------------------------------------------------------------------- |
| `loadingStart/Stop`             | `main.ts` on boot, `Preload` once the assets are in                     |
| `gameplayStart`                 | `Play.create`, and on scene resume. Guarded so a resume can't double it |
| `gameplayStop`                  | `Play.requestPause`, `showResults` and `shutdown`                       |
| `data`                          | `platform/storage.ts`, via `crazyStorage`                               |
| `game.settings`                 | `onPlatformMute` into `audio.setPlatformMute`                           |
| `happytime`                     | `Play.win`, on a world finale only                                      |
| `reportGameCompletedPercentage` | `Preload` on load and `Play.win` on every clear                         |
| `ad`                            | `Results.adBreak`, between levels. Off until Full Launch                |

The first `gameplayStart` is what they measure the initial download against, so it has to fire in a
level and not on the title screen.

**Clicks to gameplay.** They want a new player in gameplay immediately, with at most one click. A
new player takes none: with nothing cleared and the tutorial unseen, `Preload` starts Level 1
directly instead of the title, and the first `gameplayStart` fires as soon as the assets are in.
The tutorial runs over that level and holds the serve until the player has moved, so nothing is
lost while they find the controls. Browser audio unlocks on their first touch, click or key, and
the level's music starts then (`AudioSystem.resume`). Returning players still get the title and
hub.

Saves go through their data module, which mirrors the localStorage API and syncs to the player's
CrazyGames account across devices. `crazyStorage` writes to both it and localStorage, and a first
read with nothing in the account copies the local save across, so a player who started on
zombiehead.studio keeps their progress. **Pick "Yes, using the Data Module from the CrazyGames
SDK" for Progress Save on the submission form, or the module is disabled and every write fails.**

Platform mute sits on Phaser's master mute node, past the mix in `AudioSystem`, so it outranks the
in-game audio settings and `refresh()` leaves it alone. That ordering is a requirement: their mute
button has to win even if the player has sound switched on in Settings.

## Testing locally

The SDK runs in a `local` environment on `localhost` and `127.0.0.1`, where it logs every event and
draws placeholder ads instead of real ones. On any other domain it is `disabled` and all its
methods throw, which is what the guards in the bridge are for.

```sh
pnpm crazy:pack && pnpm crazy:preview    # the real bundle, SDK in local mode
pnpm dev                                 # then open with ?crazy=1
```

`?crazy=1` only works in dev. Their own query parameters work in both: `?muteAudio=true` forces the
mute, `?disableChat=true` the chat flag.

A clean run logs the SDK initializing, `loading start`, `loading stop`, the completion percentage,
then `gameplay start` when a level opens. Any line prefixed `[crazygames]` is one of our own catch
blocks and means a call failed.

Their Developer Portal also has a preview tool that runs the uploaded bundle inside a real page
frame. It is the only place a working Xsolla token exists, and the closest thing to their QA
environment.

## Submitting

1. Build the zip with `pnpm crazy:pack`.
2. Create the game on the [Developer Portal](https://developer.crazygames.com) and upload it.
3. Set **Progress Save** to the Data Module option. The module is disabled otherwise.
4. Set the supported orientation to portrait. Their page asks the player to rotate; the game must
   not do it itself, which is why the build removes the rotate prompt.
5. Fill in the description and controls, and upload the covers and preview videos. Draft copy and
   the art specs are in [crazygames-listing.md](crazygames-listing.md).
6. Run their preview tool and QA checks, then submit for Basic Launch.

The game has no external links, no cross-promotion and no login of its own, all of which they
reject. It collects nothing beyond the SDK's own events, so it needs no privacy notice.

## Promoting to Full Launch

Set `ADS_ENABLED` in `src/platform/crazygames.ts` to `true`. That is the only flag: `Results.adBreak`
already blocks input for the whole request and carries on when a request comes back unfilled, and
the audio mutes itself through the same path as their mute button. Until it is on, `midgameAd`
returns without a break, because ads are disabled during Basic Launch and a game that stalls
waiting on one is rejected.

One thing to settle before that submission: **rewarded ads.** None are implemented, which is fine —
they are optional. `rewardedAd()` is there if a continue-after-game-over or double-your-coins offer
is wanted later. Their rules on placement are strict, so read
[the ad requirements](https://docs.crazygames.com/requirements/ads/) before adding any UI. A
rewarded button that does nothing is grounds for rejection, so do not add one before the flag is
on.
