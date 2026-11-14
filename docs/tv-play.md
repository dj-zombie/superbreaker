# TV play: wide stage and a paired controller

Super Breaker is authored as a 600×800 portrait field. On a 16:9 TV that field sits in the middle and the rest of the panel is empty. This pass fills that width with the world's existing painted layers, moves the play HUD into glass plates on the outer rock, and lets a gamepad that is already paired to the gaming PC drive play and the menus.

Phones stay as they are. No new art, no webOS build, and no store packaging.

## When the wide stage is on

The playfield is `FIELD_WIDTH` 600 by `FIELD_HEIGHT` 800 (`src/core/types.ts`). `computeLayout` (`src/core/Layout.ts`) only grows the field when the viewport is taller than 3:4. On a landscape desktop window, Phaser's `Scale.FIT` keeps the field at 800 tall and leaves black bars on either side. Those bars are the wings.

Turn the wide stage on when all of these are true:

- The primary pointer is not coarse. `IS_TOUCH` phones and tablets keep the portrait HUD, the touch deck, and the "rotate to portrait" overlay in `index.html`.
- The viewport is wider than 3:4, so FIT would letterbox.
- Each wing is at least 200 playfield units wide. A slightly wide window keeps today's in-board HUD rather than crushing a plate into the margin.

Stage size, in playfield units, with the field still 800 tall and centered:

```
stageW = HEIGHT * (viewportWidth / viewportHeight)
wing   = (stageW - WIDTH) / 2
```

A 16:9 panel gives `stageW = 1422.22` and a wing of `411.11`. The board is 600/1422 of the width (42%), and each wing is the rest (29%). Brick, wall, and paddle coordinates do not move to fill the old HUD strip. The arena stays authored.

Below the 200-unit cutoff, keep the current backdrop scale and the current HUD.

As built, `computeStage` in `src/core/Layout.ts` caps the stage at 16:9, so a 21:9 window gets narrow side bars instead of an even more stretched backdrop. A Steam Deck's 16:10 screen gives a 340-unit wing, so it gets the wide stage too. `WIDE`, `STAGE_W` and `WING` in `src/config.ts` follow the window live, and `Hud` swaps between the board HUD and the plates when the window crosses the cutoff. With the HUD strip gone nothing showed where the walls and ceiling are, so `WingPlates` draws faint rails in the world's edge color along both walls and the ceiling.

## Continue the painting

`ParallaxBackdrop` (`src/systems/ParallaxBackdrop.ts`) fits every layer to the 600-wide field:

```
scale = (WIDTH + 2 * sway) / src.width
sprite.x = -sway - focus * sway + part.x * scale
```

Hell's sheet is 720 wide (`src/art/backdrops.json`). The near cliffs are the left 210px and the right 193px of that sheet. At the current scale they land on the board edges, and a wider canvas would only show sky in the wings.

On the wide stage, fit the same sheet to the stage, not the field. Do not paint new scenery, do not mirror a layer, and do not re-encode the webps.

```
scale     = (stageW + 2 * sway) / src.width
stageLeft = -wing
sprite.x  = stageLeft - sway - focus * sway + part.x * scale
```

`src.width` is the layer's own sheet width (720 for the painted hell, crypt, and mainframe layers; fog sheets are smaller and already stretch). The sky cover-scales to `stageW × HEIGHT` and stays centered on the stage. Glow stays centered on the playfield, which is where the furnace sits. Motes may stay in the field.

Hell check, level 7: the left near cliff, including the bucket, chains, and gear, fills the left wing and ends about at the board edge. The right platform fills the right wing. The arches and the open red center stay behind the board. Crypt and mainframe use the same placement with their own layers. Scroll, sway, glow flicker, and motes stay on the speeds they already have. Reduced motion and battery saver still apply.

## Instruments

The plates use the widgets already in the UI kit, skinned with `theme()` so hell, crypt, and mainframe each keep their frame:

- `framePanel(..., { variant: 'glass' })` in `src/ui/frames.ts`
- `Meter` and `RingTimer` in `src/ui/widgets.ts`
- the pause glyph in `src/ui/icons.ts`

Two plates. Each is glass, so the painting shows through. Sit them on the outer rock, not across the inboard scenery: about 70–80% of the wing width, anchored to the outer edge, top inset about 6–8% of the stage height. On hell the bucket, gear, and right platform stay visible inboard of the plates.

The board no longer draws its HUD. That includes the top strip, the Fever bar, the ability slots, the stock chips, and the timed-effect bars. Pause moves to the right plate.

Left plate, top to bottom:

- score
- the level title and the same detail line `Hud` already shows
- the world name
- lives
- Fever, as a `Meter`
- the timed-run clock, when the run has one

Right plate:

- pause, calling `Play.requestPause()`
- one `RingTimer` per ability slot, calling `Play.fireSlot(i)`. There are two slots (`SLOT_COUNT` in `src/systems/AbilitySystem.ts`). Do not add a third.
- one `Meter` per active timed powerup, the same effects `Hud.drawEffects` already tracks
- stock powerups, calling `Play.useStock(i)`

Empty slots and an empty stock still have a visible home, matching the quiet state the board HUD uses today.

## Controller

The pad is already paired to the gaming PC. Chrome on that PC receives it through the Gamepad API once the game window is focused and a button has been pressed. Keyboards and mice keep their current behavior; the pad is an added source.

As built, this does not use Phaser's per-scene gamepad plugin. `src/platform/gamepad.ts` polls `navigator.getGamepads()` once per game step (Phaser's `PRE_STEP` event), merges every connected pad, and reports button presses and releases, the left stick, and which input was used last. One poller serves both play (`InputSystem` and `Play`) and the menu cursor (`src/platform/padCursor.ts`), so no scene needs its own gamepad wiring.

Use the W3C standard mapping (`gamepad.mapping === "standard"`). Xbox, DualSense, and Switch Pro all report this in Chrome. Button 0 is the south face button (Xbox A, DualSense Cross, Switch B under standard mapping).

While `Play` is the interactive scene:

| Input | Action |
| --- | --- |
| Left stick X, past a dead zone of about 0.18 | Paddle velocity = deflection × the same speed the arrow keys use (`KEY_SPEED` in `src/systems/InputSystem.ts`, including the factor the keys apply) |
| D-pad left / right | Same as the arrow keys, full speed |
| Button 0 (south) | Launch, same as Space |
| Button 9 (Start, Options, +) | Pause, same as P |
| Button 2 (west) | `fireSlot(0)`, same as Q |
| Button 3 (north) | `fireSlot(1)`, same as E |
| Buttons 4 and 5 (bumpers) | `useStock(0)` and `useStock(1)` |
| Buttons 6 and 7 (triggers) | `useStock(2)` and `useStock(3)`, when those stock slots exist |

A resting stick must not creep the paddle.

Menus are pointer buttons today (`Title`, `Worlds`, `WorldPath`, `Briefing`, `ArcadeSelect`, `Pause`, `Results`, `Upgrades`, `Settings`). Drive them with a cursor instead of rewriting each scene:

- The cursor is shown whenever a pad is connected and `Play` is not the interactive scene. Hide it during play, and hide the OS mouse cursor while the pad is the latest input. The OS cursor comes back when the mouse moves.
- Left stick and d-pad move the cursor, fast enough to cross a plate in about a second.
- Button 0 presses whatever the existing pointer handlers press at the cursor, including the wing plates and every menu button.
- Button 1 (east) activates the screen's existing back control when it has one, and resumes from `Pause`. Where there is no back control, the cursor can still reach the button that is already on screen.

As built, the cursor is a DOM element over the canvas. South sends `mousedown` on press and `mouseup` on release to the canvas, and Phaser handles those like a real mouse, hover included. East and Start (in `Pause`) call the back stack in `src/ui/nav.ts`, the same one Escape uses. The cursor acts on release, and only for presses that began while it was showing: Phaser resumes a scene synchronously, so acting on press would let the resumed `Play` see the same press as a launch or a second pause. The first south press after the cursor appears only reveals it. Vibration (Settings) also rumbles the pad when the pad was the last input, and the plates' key hints switch between keyboard (Q, E, 1–4, P) and pad labels (X, Y, LB, RB, LT, RT, START).

## Acceptance criteria

1. On a phone in portrait, the HUD, touch deck, backdrop, and controls are unchanged. A landscape phone still shows the rotate overlay.
2. On a 16:9 desktop window the canvas fills the window. There is no black bar inside the game on either side of the board.
3. Hell, crypt, and mainframe each show their own layers across the full stage. The near cliffs sit in the wings. Nothing new is drawn behind them.
4. Level geometry is unchanged: the same brick, wall, and paddle coordinates as a portrait run of that level.
5. On the wide stage the board has no HUD. Score, level, world, lives, Fever, and the clock (when timed) are on the left glass plate. Pause, two ability rings, active powerup meters, and stock are on the right glass plate. Plates sit on the outer rock and the inboard scenery stays visible. The frame style follows the world.
6. A window that is only slightly wider than 3:4, with a wing under 200 playfield units, keeps the current HUD and the current backdrop.
7. With only the paired pad, on the wide stage: move the paddle, launch, fire both ability slots, use a stocked powerup, pause, resume, and back out. From the title screen, reach a level and start it without touching the keyboard or mouse.
8. Keyboard and mouse still play, including Q, E, the number keys, Space, and P.
9. `pnpm test` and `pnpm typecheck` pass. A unit test covers stage and wing width at 1920×1080, and covers the under-200 fallback.

## Testing on the TV

The controller is paired to the gaming PC. The repo and the dev server run on the Mac. The LG C6 is on the receiver; the PC is one of the receiver's HDMI inputs.

The simplest path is the desktop app. Run `pnpm desktop:dist --win` (on the Mac or the PC) and copy `release/Super-Breaker-Portable-<version>.exe` or the `Setup` installer to the PC. It opens fullscreen with no browser chrome, plays the music without a click, and has Quit on the title screen. F11 or Alt+Enter toggles fullscreen, and Escape stays pause and back. The build is unsigned, so Windows SmartScreen asks once: "More info", then "Run anyway". Then skip to step 3.

To test the live dev server instead, use Chrome kiosk:

1. On the Mac, from the repo: `pnpm dev --host`. Use the Network URL it prints (port 5173).
2. On the gaming PC, with Chrome focused, open that URL fullscreen. Kiosk is the path with no browser chrome. Quit other Chrome windows first, then:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://MAC:5173
   ```

   Alt+F4 leaves kiosk. F11 on a normal window also works; Escape both exits fullscreen and pauses the game, so prefer Alt+F4 while a run is live.
3. Select the PC's HDMI input on the receiver. Set that input to Game Optimizer on the LG. If the paddle feels late, plug the PC's HDMI into the TV and send audio back over ARC. Leave the PS5 and Switch inputs out of this pass.
4. Click the game window once, then press any face button. The Gamepad API stays silent until that press.
5. Desk check before the couch, in a 16:9 browser window on either machine:
   - `?level=7` (Hell, "Two Cities"). Wings show the hell cliffs. Left plate has the score and Fever. Right plate has pause and two rings. The board's top is clear.
   - `?level=11` and `?level=21` for crypt and mainframe. Same plate positions, that world's painting and frame.
   - Shrink the window toward square and confirm the in-board HUD returns.
   - `?debug` if the frame time needs a look.
6. From the couch, pad only:
   - Title screen: cursor moves, south activates, a level starts.
   - In play: stick and d-pad steer, south launches, west and north fire the two slots, a bumper uses a stocked powerup, Start pauses.
   - Pause: cursor reaches resume, east or Start resumes.
   - Pull the left stick slightly and confirm the paddle does not drift.
7. Keyboard still works if it is on the desk: arrows, Space, Q, E, P.
