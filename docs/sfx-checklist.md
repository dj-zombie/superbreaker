# Sound effects checklist

Working list for the new effects. Check a box by replacing the space inside it with `x`.

- **Recorded** — the file is at the path below and sounds right on its own.
- **In game** — it plays at the moment described, and the old cue is gone.
- **Signed off** — you are happy with it in context. Write `cut` in Notes to drop one.

Export one-shots at 44.1 kHz, mono, 192 kbps mp3 or wav. Keep gameplay one-shots under about 0.4 seconds so overlapping hits stay clear. The bounce notes through a level are only C, D, F, and G. Write stingers in that set. The star bells are the place to add E.

Do these in order: fanfare, then the new menus, then powerups and abilities, then the gameplay moments.

Every new path below, plus the two storm sounds, has a placeholder cut from [Kenney](https://kenney.nl)'s CC0 packs (Impact, Sci-fi, Interface, Digital, Casino, RPG, Music Jingles, and the Fighter voiceover). CC0 needs no credit and ships anywhere, Steam included. Replace them file for file.

## Fanfare

The mid-level clear banner stays up for 3.5 seconds, and that clear should finish in about 2 seconds. Its stars land at 260 ms, 640 ms, and 1020 ms. The results screen (the last level, a failed run, and Arcade) reveals its stars later, at 650 ms, 1030 ms, and 1410 ms, and the fanfare has already been playing for about 700 ms when that screen appears. Time the bells to whichever surface is showing. The results heading does not get a second jingle on top. The tail is only for a 3-star clear, the last level of a world (10, 20, 30), and an Arcade win. Wave clears stay off this kit. The next wave arrives in 0.9 seconds.

- [ ] Recorded · [ ] In game · [ ] Signed off — **Stab** `public/assets/audio/ui/fanfare-stab.mp3` (~0.5s). Brick-crunch into a C or G chord. The level-cleared hit.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Rise A** `public/assets/audio/ui/fanfare-rise-a.mp3` (~1s). Ascending figure on C, D, F, G. Same synth family as the play music.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Rise B** `public/assets/audio/ui/fanfare-rise-b.mp3` (~1s). A second phrase so back-to-back clears can alternate.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Star 1** `public/assets/audio/ui/star-1.mp3` (~0.25s). Bell on C.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Star 2** `public/assets/audio/ui/star-2.mp3` (~0.25s). Bell on E.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Star 3** `public/assets/audio/ui/star-3.mp3` (~0.25s). Bell on G. Three stars complete the chord.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Tail** `public/assets/audio/ui/fanfare-tail.mp3` (~1.5s). Held chord for a 3-star clear, a world finale, and an Arcade win.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **New best** `public/assets/audio/ui/new-best.mp3` (~0.4s). Sparkle over the "New best" line on the clear banner and the results screen. Does not replay the fanfare.
  - Notes:

Hear these before signing the kit off:

- [ ] 1 star: stab, one rise, one bell, no tail
- [ ] 2 stars: two bells
- [ ] 3 stars: three bells and the tail
- [ ] Consecutive levels alternate rise A and rise B
- [ ] New best adds the sparkle only
- [ ] Level 10, 20, and 30, and an Arcade win, get the tail
- [ ] A wave clear does not play any of this
- [ ] Results-screen stars use the bells, not the coin
- [ ] The results heading does not play `win_jingle` on top of the fanfare
- [ ] New best on the results screen is the sparkle only
- [ ] Game over plays once. The results heading does not play it again

## Powerups

These seven already have their own files: coin, magnet, fireball, laser, multiball, wide paddle, tiny paddle.

- [ ] Recorded · [ ] In game · [ ] Signed off — **Shield on** `public/assets/audio/powerups/shield-on.mp3` (~0.4s). Soft glassy barrier rising. Plays when the shield is caught. Replaces `ui_on`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Shield break** `public/assets/audio/powerups/shield-break.mp3` (~0.35s). Glass crack and a short falling tone. Plays when the ball hits the bar. Replaces `ui_off`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Hyperspeed** `public/assets/audio/powerups/hyper.mp3` (~0.5s). Rising zip into a thin whine. Replaces the laser powerup sound.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Pierce** `public/assets/audio/powerups/pierce.mp3` (~0.3s). Sharp bright needle. Distinct from the laser. Replaces the laser powerup sound.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Extra life** `public/assets/audio/powerups/extra-life.mp3` (~0.6s). Short heartbeat into a chime. Smaller than a level clear. Also plays when Arcade grants a life on a tier-up. Replaces `win_jingle`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Mystery open** `public/assets/audio/powerups/mystery.mp3` (~0.4s). Box latch and a shimmer, then the roulette. Replaces `win_jingle`.
  - Notes:

The laser rolls one of five firing modes per pickup. These five are copies of other cues in the game, not Kenney cuts, until they are recorded.

- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser spin-up** `public/assets/audio/laser/spinup.mp3` (~0.6s). Rising motor whine as the gun pods slide out and the fire rate revs up. Placeholder: the hyperspeed pickup.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser vent** `public/assets/audio/laser/vent.mp3` (~0.5s). Steam hiss and a falling tone as the overheated pods vent and slide back in. Placeholder: the Fever end.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser ricochet** `public/assets/audio/laser/ricochet.mp3` (~0.15s). Bright metal ping when a Ricochet bolt bounces off steel, a wall or the ceiling. Pitch varies. Placeholder: the steel hit.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser missile** `public/assets/audio/laser/missile.mp3` (~0.2s). Small hissing launch for each Swarm missile, in place of the laser bolt. Placeholder: the meteor whoosh.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser impact** `public/assets/audio/laser/impact.mp3` (~0.08s). Quiet tick when a bolt hits a brick without breaking it, or glances off armor or steel. Plays at most every 70 ms, so it must stay clean as a stream. Placeholder: the wall bounce.
  - Notes:

## Abilities

- [ ] Recorded · [ ] In game · [ ] Signed off — **Meteor whoosh** `public/assets/audio/abilities/meteor-whoosh.mp3` (~0.25s). Falling whistle, one per meteor. Pitch varies. Replaces `sfx_fireball`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Lightning** `public/assets/audio/abilities/lightning.mp3` (~0.12s). Dry electrical snap, one per hop. Pitch climbs with the chain. Replaces `laser_shot`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Bomb launch** `public/assets/audio/abilities/bomb-launch.mp3` (~0.25s). Heavy thump as it leaves the paddle. Replaces `sfx_balls`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Bomb blast** `public/assets/audio/abilities/bomb-blast.mp3` (~0.6s). Low boom. Bigger and darker than a TNT brick. Replaces `sfx_fireball`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Laser sweep** `public/assets/audio/abilities/sweep.mp3` (~1.5s, or a short loop). Sustain while the beam crosses the field. Replaces the one-shot laser powerup blip.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Black hole open** `public/assets/audio/abilities/blackhole-open.mp3` (~0.5s). Inward suck. Replaces `sfx_magnet`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Frenzy** `public/assets/audio/abilities/frenzy.mp3` (~0.45s). Brighter and busier than the multiball pickup. Replaces `sfx_balls`. Skip the pierce sting when frenzy applies pierce.
  - Notes:

## Gameplay moments

- [ ] Recorded · [ ] In game · [ ] Signed off — **Meteor impact** `public/assets/audio/abilities/meteor-impact.mp3` (~0.2s). Small crack and ember when a meteor lands. Separate from the brick break.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Black hole swallow** `public/assets/audio/abilities/blackhole-swallow.mp3` (~0.15s). Quiet gulp per brick. Must stay intelligible when several overlap.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Black hole close** `public/assets/audio/abilities/blackhole-close.mp3` (~0.3s). Reverse pop when the hole collapses.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Roulette tick** `public/assets/audio/abilities/roulette-tick.mp3` (~0.05s). Soft mechanical click. The spin already slows the ticks down. Replaces `ui_move`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Roulette lock** `public/assets/audio/abilities/roulette-lock.mp3` (~0.15s). Firm click when the icon lands. Replaces `ui_on`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Launch** `public/assets/audio/launch.mp3` (~0.2s). Paddle thwack when the held ball is served. Replaces `ui_toggle`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Wall** `public/assets/audio/wall.mp3` (~0.1s). Softer than the paddle bounce. Side walls, ceiling, and the god-mode floor. Replaces `ui_move`.
  - Notes:
- [x] Recorded · [x] In game · [ ] Signed off — **Countdown** `public/assets/audio/ui/3.mp3`, `2.mp3`, `1.mp3`, `go.mp3`. Spoken 3, 2, 1, then go as the ball launches. Replaces `ui/countdown.mp3`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Steel** `public/assets/audio/bricks/steel.mp3` (~0.15s). Metal ping when the ball hits an unbreakable brick. Replaces `ui_toggle`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Armor** `public/assets/audio/bricks/armor.mp3` (~0.2s). Crack as armor chips off. Distinct from a normal brick bounce and from a break.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Regen** `public/assets/audio/bricks/regen.mp3` (~0.35s). Soft bloom when a regen brick grows back.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **TNT** `public/assets/audio/bricks/tnt.mp3` (~0.4s). Blast for an explosive brick and its chain. Distinct from the fireball pickup and the mega bomb. Pitch can rise with the chain.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Collapse** `public/assets/audio/bricks/collapse.mp3` (~0.6s). Rumbling whoosh when the last bricks fall.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Mover** `public/assets/audio/bricks/mover.mp3` (short loop). Quiet whoosh for bricks that slide.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Combo** `public/assets/audio/combo.mp3` (~0.3s). Rising callout on combo 5, 10, 15, and 20.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Fever start** `public/assets/audio/fever-start.mp3` (~0.5s). Bright swell and shimmer. Replaces `win_jingle`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Fever end** `public/assets/audio/fever-end.mp3` (~0.35s). Short falling tone when Fever closes.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Wave clear** `public/assets/audio/wave-clear.mp3` (~0.4s). Quick positive blip between Arcade waves. Replaces `win_jingle`. Must finish before the next wave, which arrives in 0.9 seconds.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Field clear** `public/assets/audio/field-clear.mp3` (~0.5s). Descent clear payout. Can be the wave blip plus a short tail. Replaces `win_jingle`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Powerup end** `public/assets/audio/powerups/timeout.mp3` (~0.15s). Small downward tick when a timed powerup expires.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Gift** `public/assets/audio/gift.mp3` (~0.35s). The pacing gift drop. Replaces `ui_on`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Power surge** `public/assets/audio/surge.mp3` (~0.4s). The pacing surge. Plays even when the surge does not fill the Fever meter.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Breach** `public/assets/audio/breach.mp3` (~0.4s). Alarm when Descent bricks cross the danger line, ahead of the life-lost sound.
  - Notes:

## Menus

The new screens are the title attract and hub, the world carousel, the level path, the briefing sheet, Arcade setup, the Armory, pause, settings, and the results screen. Button and card presses, hovers, and the settings toggles keep the UI kit. These moments need their own files.

- [ ] Recorded · [ ] In game · [ ] Signed off — **Whoosh** `public/assets/audio/ui/whoosh.mp3` (~0.4s). Airy sweep. Replaces the synthesized whoosh on every screen change, when a sheet springs up (briefing, settings), when the world carousel changes card, and on Tap to start. Play it falling, or reversed, when a sheet dismisses. That close is silent today.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Logo pieces** `public/assets/audio/ui/logo-piece.mp3` (~0.12s). Light brick clack as the title fragments fly in. Plays on every fourth piece. Replaces the gameplay break sounds.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Logo slam** `public/assets/audio/ui/logo-slam.mp3` (~0.6s). The pieces locking into one low hit when the title logo lands. Replaces the life-lost sound, pitched down.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Level intro** `public/assets/audio/ui/intro.mp3` (~0.35s). Short slam as the level-name band sweeps in at the start of a level. Replaces `ui_select`, pitched down.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Purchase** `public/assets/audio/ui/purchase.mp3` (~0.4s). A rising chime when the Armory card pulses and the new tier lights. The button press stays `ui_select`. Replaces the extra coin sound at the end of the flight.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Coin land** `public/assets/audio/ui/coin-land.mp3` (~0.08s). Quiet tick, one per coin flying into the balance pill or into an Armory card. Pitch may rise slightly as they land. Replaces `sfx_coin` during those flights. The pickup coin in play stays the gameplay coin.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Tier pip** `public/assets/audio/ui/pip.mp3` (~0.1s). Small bright click as each new Armory pip lights, one after another. Replaces `ui_move`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Can't afford** `public/assets/audio/ui/deny.mp3` (~0.25s). Dull clunk as the coin pill shakes red. Also plays when a stock buy fails because the slots are full or the ability is still locked. Replaces `sfx_smaller` and that `ui_off`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Locked** `public/assets/audio/ui/locked.mp3` (~0.25s). Chain rattle when a locked world card or a locked level node shakes. Replaces `ui_off`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Tab** `public/assets/audio/ui/tab.mp3` (~0.12s). Soft click as the Armory tab bar slides, and as a segmented control settles (briefing difficulty, Arcade goal, Arcade difficulty). Lighter than `ui_select`. Replaces `ui_move` on tabs and `ui_toggle` on segmented controls.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Tally** `public/assets/audio/ui/tally.mp3` (~0.06s). Very quiet tick while the results score counts up. It fires many times, so it has to stay soft. Replaces `ui_move`.
  - Notes:
- [ ] Recorded · [ ] In game · [ ] Signed off — **Pause** `public/assets/audio/ui/pause.mp3` (~0.2s). Soft thud as the pause menu slides in over the blurred game. Resume can use the falling whoosh.
  - Notes:

## Old cues to retire

Check these when the new files are in game, so a signed-off sound is the one you actually hear.

- [ ] Level clear and Arcade win play the fanfare kit. `ui/fanfare.mp3` is unused.
- [ ] Clear-banner stars and results-screen stars play the star bells, not `sfx_coin`.
- [ ] Fever start, extra life, mystery, wave clear, and field clear no longer play `win_jingle`.
- [ ] Shield catch plays shield-on. Shield break plays shield-break.
- [ ] Hyperspeed and pierce no longer play `sfx_laser`.
- [ ] Meteor, lightning, bomb, sweep, black hole, and frenzy no longer play powerup sounds.
- [ ] Ball launch and steel hits no longer play `ui_toggle`.
- [ ] Wall bounces and the serve countdown no longer play `ui_move`.
- [ ] The roulette no longer plays `ui_move` and `ui_on`.
- [ ] The title logo slam no longer plays `death`, and the flying pieces no longer play brick breaks.
- [ ] The level-name band no longer plays `ui_select`.
- [ ] Screen changes, sheet opens, the world carousel, and Tap to start play the recorded whoosh. Sheet dismiss plays it falling.
- [ ] An Armory purchase ends on the purchase chime. Flying coins play the coin-land tick, and new tier pips play the pip.
- [ ] A short balance plays the deny clunk, not `sfx_smaller`. A failed stock buy plays it too.
- [ ] Locked worlds and locked level nodes play the chain rattle, not `ui_off`.
- [ ] Armory tabs and segmented controls play the tab click.
- [ ] The results score count plays the tally tick, not `ui_move`.
- [ ] Pause plays the pause thud when it opens.

## Keep as they are

No new files. Change one of these only if a later pass still bothers you.

| Cue | File | Plays on |
| --- | --- | --- |
| Bounce notes | `audio/c0`–`g3` | Paddle hits and brick hits that do not break |
| Brick breaks | `audio/breaks/break0`–`break5` | A brick shattering. Pitch rises with the combo |
| Coin | `audio/powerups/coin.mp3` | Catching a coin |
| Magnet | `audio/powerups/magnet2.mp3` | Magnet pickup and a magnet catch |
| Fireball | `audio/powerups/fireball.mp3` | Fireball pickup |
| Laser powerup | `audio/powerups/laser.mp3` | Laser pickup |
| Laser bolt | `audio/laser.mp3` | Laser shots, at most ten a second. Pitch alternates by barrel, climbs as the guns spin up and sags as they overheat |
| Multiball | `audio/powerups/balls.mp3` | Multiball pickup |
| Wide paddle | `audio/powerups/bigger.mp3` | Wide paddle pickup |
| Tiny paddle | `audio/powerups/smaller.mp3` | Tiny paddle pickup |
| UI kit | `audio/ui/move`, `on`, `off`, `select`, `toggle` | Button and card hover, press, and disabled. Settings and pause toggles |
| Life lost | `audio/death.mp3` | Losing a ball |
| Game over | `audio/gameover.wav` | Out of lives, and an Arcade run that fails. Once, not again on the results heading |
| Thunder | `audio/storm/thunder.mp3` | A lightning strike, on its first flash |
| Flicker | `audio/storm/flicker.mp3` | Each blink of a sputtering room light on lights-out levels |
| Music | `audio/music/pusher.mp3`, cut by `scripts/build-music.py` | The menus, and Play, where the section follows how intense the moment is |
