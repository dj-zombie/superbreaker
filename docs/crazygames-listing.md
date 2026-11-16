# CrazyGames listing

Draft copy and art specs for the submission form. The build and SDK side is in
[crazygames.md](crazygames.md). Everything here is a starting point — edit it freely, but keep the
restrictions, which are theirs and are enforced at review.

## Title

**Super Breaker**

Their naming guidance wants a name that is unique and not easily confused with another game, and
reserves plain generic names ("Chess") for IP holders. "Super Breaker" qualifies, and the
`-breaker` suffix reads as the genre without claiming it.

## Short description

> Smash bricks, grab powerups, chase three stars.

Already the PWA manifest description, so it stays consistent with the installable version.

## Description

Lead with the hook, then the variety, then the progression. Kept to short sentences because this
sits under the game on a crowded page and gets skimmed.

> Super Breaker is a brick breaker with teeth. Thirty hand-built levels across three worlds — a
> molten foundry, a buried crypt and a humming mainframe — each one a formation to pick apart with
> one ball and three lives.
>
> Bricks fight back. Steel will not break, armor cracks a layer at a time, explosive bricks
> chain-react through their neighbours, regen clusters grow back unless you clear them together,
> and any of them can slide. Breaking them fast fills the Fever bar, and a full bar buys you eight
> seconds of fireballs, double score and rainbow trails.
>
> Pickups keep the field loud: magnets, multiball, pierce, hyperspeed, shields, and a laser that
> rolls a different firing mode every time you catch it — machine gun, helix, scatter, homing
> swarm missiles or ricochet. Rainbow mystery boxes spin a roulette for the big guns: Meteor
> Shower, Chain Lightning, Mega Bomb, Laser Sweep, Black Hole and Ball Frenzy.
>
> Coins from broken bricks go into the Armory, where you upgrade your powerups and unlock new
> abilities. Levels pay one to three stars for the lives you finish with, so there is always a
> cleaner run to go back for.
>
> When the campaign runs out, Arcade generates fresh boards forever. Clear waves of them, or
> survive Descent, where the rows keep pushing down and letting one past the line costs a life.
> Play endless, ten rounds, or three minutes against the clock. Every run has a seed, so a good
> one can be played again.

### Notes on what to leave out

- No "Play now", no store or app links, no cross-promotion — all rejected.
- Don't mention the iOS, Android or desktop versions. App store links are never allowed in-game or
  in the description; their Developer Portal has separate metadata fields for that.
- Don't promise features that are off on their platform. There is no account login of our own and
  no in-game purchases.

## Controls

Their form takes a controls block, and the quality guidelines ask that controls are shown to the
player too. The game covers mouse, touch, keyboard and gamepad.

> **Mouse** — move to aim the paddle, click to launch.
> **Touch** — drag to move the paddle, tap to launch.
>
> **Keyboard** (keys by position, so ZQSD players use Q / D and A / E)
> Arrow keys or A / D — move the paddle
> Space, Up or W — launch the ball
> Q / E — fire ability slot 1 or 2
> 1–4 — use a stocked powerup
> P — pause
>
> **Gamepad**
> Left stick or d-pad — move the paddle
> A — launch
> X / Y — fire ability slot 1 or 2
> LB / RB / LT / RT — use a stocked powerup
> Start — pause
>
> New players start with a short tutorial that shows the controls, then pauses the game to show how
> to keep the ball in play, catch a powerup, fire an ability, fire the gun and slow time. Skip it
> at any time, replay it from Settings, and find every control on the Pause screen.

The in-game version of this list never needs translating for a layout. Keys are bound by position,
and every label on screen (the tutorial's keycaps, the ability slots, the Pause screen's Controls
card) names the key as the player's keyboard prints it, so an AZERTY player sees Q and D for
movement and A and E for abilities. Inside their iframe the browser won't share the layout, so the
labels start from a guess based on the browser language and correct themselves from the keys the
player presses.

A held ball launches itself after a 3-2-1 countdown, so a player who never finds the launch key
still gets moving. `Escape` is only ever a shortcut for going back, since it also closes their
fullscreen: P and the on-screen buttons cover everything it does. `Ctrl/Cmd+W` is never taken as
game input, because any key pressed with Ctrl, Cmd or Alt is left to the browser.

## Category and audience

- **Category:** Arcade, with Puzzle and Casual as secondary fits.
- **Tags:** brick breaker, breakout, arcade, powerups, levels, single player, skill.
- **Age:** PEGI 12 compliant. Cartoon destruction, no blood, no gore, no text chat, no user
  content, nothing to moderate.
- **Orientation:** portrait. Their page handles the rotation prompt; the build removes ours.
- **Progress save:** "Yes, using the Data Module from the CrazyGames SDK". This one matters — any
  other answer disables the module and every save write fails.

## Cover images

Three sizes, all mandatory, and they must read as the same game:

| Cover     | Size           | Ratio |
| --------- | -------------- | ----- |
| Landscape | 1920 x 1080 px | 16:9  |
| Portrait  | 800 x 1200 px  | 2:3   |
| Square    | 800 x 800 px   | 1:1   |

Their restrictions, which are hard rules at review:

- No borders around the cover.
- No text other than the game's title. No "New", "Updated", "Play" or "Play now".
- No icons and no store logos.
- Nothing copyrighted that isn't ours.
- Nothing blurry or pixelated.
- Don't just use a screenshot. Players can already hover for gameplay.

### Art direction

The pieces to build from are already in the repo, which is better than a screenshot and costs
nothing to license:

- **Logo.** `art-src/logo/` has the four title designs, and `scripts/process-logo.py` splits each
  into a base and a glow layer that gets tinted per world. Pick the one that reads best small — the
  square cover is shown tiny on mobile — and use its glow layer to lift the title off the art.
- **Backdrop.** `public/assets/images/backdrops-hd/` holds the 16:9 layer sets for Hell Foundry,
  the Crypt and the Mainframe: sky, far, mid and near plates. Composite one into a backdrop and
  there is instant depth without opening the game.
- **Subject.** A brick breaker has no character, so the ball is the protagonist: a lit ball mid-
  impact, a bright trail behind it, a brick shattering into chunks. Fever's rainbow trail is the
  most distinctive thing the game does and reads at any size.
- **Palette.** Hell Foundry's molten orange against the deep violet `#0b0820` background has the
  most contrast of the three and is the obvious pick for the primary cover.
- **Type.** `Cinzel` is the carved face the game already uses for Hell and the Crypt, and
  `Orbitron` the machined one for the Mainframe. Reusing them keeps the cover and the game
  consistent, which is exactly what their guideline asks for.

Keep all three simple and well-balanced. Build the square one first: if the title still reads at
thumbnail size, the other two will be fine.

## Preview video

Hovering a cover plays this, so it has to sell the game in a few seconds with no sound.

**Their requirements:** 15–20 seconds maximum (longer gets cut), 50MB maximum, 1080p, both a
landscape 16:9 and a portrait 2:3 version, no sound. Avoid black screens, logo transitions, black
bars, a visible mouse cursor, promotional text and app icons. Don't speed it up — they do that
themselves. Open on the static cover frame so the thumbnail transitions seamlessly into it.

**Shot list,** best moments first because most players never see the end:

1. **0–3s** — Fever at full tilt. Rainbow trails, several balls, bricks coming apart in sheets.
2. **3–6s** — A mystery box roulette landing, then the ability firing. Black Hole pulling bricks
   in is the most striking; Meteor Shower is the most legible.
3. **6–9s** — The laser, with the pods sliding out, and one of the showier modes. Helix or the
   homing swarm.
4. **9–13s** — A world change, to show there is more than one look. Cut from Hell Foundry's molten
   orange to the Crypt or the Mainframe on a brick impact.
5. **13–16s** — An explosive chain reaction tearing through a formation.
6. **16–20s** — A level clear: the banner, three stars landing, coins flying to the balance.

Capture it from the desktop build at 1080p with the HD backdrops on, which is where the art is at
its best. `?level=N` jumps straight to a level and `?arcade=waves` into a run, so the good moments
can be set up instead of waited for. God mode in Settings keeps a take alive while filming, and
Unlock all levels opens the later worlds. Hide the cursor, and don't film the debug overlay.

For the portrait cut, film separately in a portrait window rather than cropping the landscape one.
The game is portrait natively, so a portrait capture is the truer framing and loses nothing at the
edges.

## Before submitting

- [ ] `pnpm crazy:pack` passes its limit checks
- [ ] Three covers at the exact sizes, no borders, title only
- [ ] Landscape and portrait videos, under 20s, silent, opening on the cover frame
- [ ] Description and controls pasted in, with no external links
- [ ] Progress Save set to the Data Module option
- [ ] Orientation set to portrait
- [ ] Their preview tool played through once on desktop and once on mobile
