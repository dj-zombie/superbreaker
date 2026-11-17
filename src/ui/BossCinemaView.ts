import Phaser from 'phaser';
import { HEIGHT, STAGE_W, WIDTH, WING } from '../config';
import { AWARD_TROPHY_MS, envelope } from '../core/Boss';
import type { BossAward, BossCinema, BossTitle } from '../systems/BossDirector';
import { calm, css, theme } from './theme';
import { display, gradientFill, label, worldTitle } from './type';

/** Everything here draws over the whole HUD: the black, then the bars, then the cards. */
const DARK_DEPTH = 2000;
const BAR_DEPTH = 2010;
const CARD_DEPTH = 2020;
/** Height of each letterbox bar, in px. */
const BAR_HEIGHT = 76;
/** The title card sits this far down the screen, 0..1: the lower third, as a film names its monster. */
const TITLE_AT = 0.69;
/** Text sizes of the line over the name and of the name, in px. */
const KICKER_SIZE = 15;
const NAME_SIZE = 66;
/** The name stands this far under the line over it, in px, with a rule between them. */
const NAME_DROP = 50;
const RULE_DROP = 17;
const RULE_WIDTH = 230;
/** Room round a name for its glow, as a share of its text size: without it the glow is cut square. */
const GLOW_ROOM = 0.6;
/** Either card keeps this much room at each side of the board, in px. */
const CARD_MARGIN = 28;
/** The title card comes in and goes out over this long, in ms. */
const TITLE_IN_MS = 500;
const TITLE_OUT_MS = 450;
/** How much larger the name starts than it ends: it settles, slowly, for as long as it shows. */
const NAME_SETTLE = 0.07;
/** The scene behind the award card darkens this far, over this long, in ms. */
const AWARD_DIM = 0.62;
const AWARD_DIM_MS = 600;
/** Where the award's rows sit down the screen, 0..1. */
const AWARD_NAME_AT = 0.2;
const TROPHY_AT = 0.42;
const SCORE_AT = 0.63;
const COINS_AT = 0.69;
const CONTINUE_AT = 0.8;
/** Text sizes on the award card, in px. */
const AWARD_NAME_SIZE = 46;
const AWARD_LABEL_SIZE = 15;
const SCORE_SIZE = 34;
/** The keepsake on screen, in px, and the glow behind it. */
const TROPHY_SIZE = 150;
const GLOW_SIZE = 250;
/** The keepsake lands over this long, in ms, a little too large before it settles. */
const TROPHY_LAND_MS = 420;
/** One full turn of the keepsake takes this long, in ms. */
const SPIN_MS = 2600;
/** Copies behind the keepsake that give it a rim as it turns, and how far apart they sit, in px. */
const RIM_LAYERS = 4;
const RIM_STEP = 1.6;
const RIM_TINT = 0x8a5a14;
/** Each row of the award follows the one before by this long, in ms. */
const ROW_GAP_MS = 320;
/** A row fades in over this long, in ms. */
const ROW_IN_MS = 260;
/** The prompt to go on breathes once in this long, in ms, between these alphas. */
const PROMPT_BEAT_MS = 1100;
const PROMPT_ALPHA = [0.55, 1] as const;
/** The strip that shows the wait running out: its size, in px. */
const WAIT_WIDTH = 150;
const WAIT_HEIGHT = 3;

type Text = Phaser.GameObjects.Text;
type Image = Phaser.GameObjects.Image;
type Rect = Phaser.GameObjects.Rectangle;

/** The title card's pieces. */
interface TitleView {
  key: string;
  kicker: Text;
  rule: Rect;
  name: Text;
  /** The name's scale when it has settled: under 1 for a name wider than the board. */
  fit: number;
}

/** The award card's pieces. */
interface AwardView {
  name: Text;
  defeated: Text;
  glow: Image;
  rim: Image[];
  trophy: Image;
  trophyName: Text;
  score: Text;
  coins: Text;
  prompt: Text;
  wait: Rect;
}

/**
 * What a boss fight draws over the whole screen while a scene has the field: the black of the
 * intro, the letterbox bars, the title card and the award card. It lives in the HUD scene, so the
 * camera moves of the fight never move it, and it draws only what `BossCinema` says is true now:
 * nothing here keeps time of its own, so a pause holds it and a skipped scene leaves nothing up.
 */
export class BossCinemaView {
  private readonly dark: Rect;
  private readonly top: Rect;
  private readonly bottom: Rect;
  private title?: TitleView;
  private award?: AwardView;

  constructor(private scene: Phaser.Scene) {
    this.dark = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(DARK_DEPTH);
    this.top = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(BAR_DEPTH);
    this.bottom = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(BAR_DEPTH);
    this.update(null);
  }

  /** Draws what the fight shows now. Null, between fights, shows nothing. */
  update(c: BossCinema | null): void {
    const still = calm();
    const bars = c?.bars ?? 0;
    const award = c?.award ?? null;
    // The stage can change size under the view, so the black is laid out every frame.
    const dim = award ? AWARD_DIM * Math.min(1, award.ms / AWARD_DIM_MS) : 0;
    const dark = Math.max(c?.dark ?? 0, dim);
    this.dark
      .setVisible(dark > 0)
      .setPosition(-WING, 0)
      .setSize(STAGE_W, HEIGHT)
      .setAlpha(dark);
    // Under reduced motion the bars fade where they stand and nothing slides.
    const slid = still ? 1 : bars;
    this.top
      .setVisible(bars > 0)
      .setPosition(-WING, -BAR_HEIGHT * (1 - slid))
      .setSize(STAGE_W, BAR_HEIGHT)
      .setAlpha(still ? bars : 1);
    this.bottom
      .setVisible(bars > 0)
      .setPosition(-WING, HEIGHT - BAR_HEIGHT * slid)
      .setSize(STAGE_W, BAR_HEIGHT)
      .setAlpha(still ? bars : 1);
    this.drawTitle(c?.title ?? null, still);
    this.drawAward(award, still);
  }

  private drawTitle(title: BossTitle | null, still: boolean): void {
    if (!title) {
      if (this.title) for (const o of this.titleParts(this.title)) o.setVisible(false);
      return;
    }
    const v = this.titleFor(title);
    const y = HEIGHT * TITLE_AT;
    const alpha = envelope(title.ms, title.holdMs, TITLE_IN_MS, TITLE_OUT_MS);
    const settle = still ? 1 : 1 + NAME_SETTLE * (1 - title.ms / title.holdMs);
    v.kicker.setVisible(true).setY(y).setAlpha(alpha);
    v.rule
      .setVisible(true)
      .setY(y + RULE_DROP)
      .setAlpha(alpha)
      .setScale(still ? 1 : alpha, 1);
    v.name
      .setVisible(true)
      .setY(y + NAME_DROP)
      .setAlpha(alpha)
      .setScale(v.fit * settle);
  }

  private titleParts(v: TitleView): Array<Text | Rect> {
    return [v.kicker, v.rule, v.name];
  }

  /** The title card for these words, built the first time they show. */
  private titleFor(title: BossTitle): TitleView {
    const key = `${title.kicker}\n${title.name}`;
    if (this.title?.key === key) return this.title;
    if (this.title) for (const o of this.titleParts(this.title)) o.destroy();
    const { scene } = this;
    const t = theme();
    const x = WIDTH / 2;
    const kicker = label(scene, x, 0, title.kicker, KICKER_SIZE, { color: t.palette.text });
    const rule = scene.add.rectangle(x, 0, RULE_WIDTH, 1, t.palette.accentHi);
    const name = this.name(title.name, NAME_SIZE);
    for (const o of [kicker, rule, name]) o.setDepth(CARD_DEPTH);
    const inked = name.width - 2 * NAME_SIZE * GLOW_ROOM;
    const fit = Math.min(1, (WIDTH - 2 * CARD_MARGIN) / (inked * (1 + NAME_SETTLE)));
    return (this.title = { key, kicker, rule, name, fit });
  }

  /** The boss's name in the world's lettering, with room round it for the glow. */
  private name(text: string, size: number): Text {
    const t = theme();
    const name = worldTitle(this.scene, WIDTH / 2, 0, text, size, { t });
    const room = size * GLOW_ROOM;
    name.setPadding(room, room, room, room);
    // The gradient is laid over the text's height, which the padding has just changed.
    return gradientFill(name, t.headingStops);
  }

  private drawAward(award: BossAward | null, still: boolean): void {
    if (!award) {
      if (this.award) for (const o of this.awardParts(this.award)) o.setVisible(false);
      return;
    }
    const v = this.awardFor(award);
    const { ms } = award;
    const row = (n: number): number => envelope(ms - n * ROW_GAP_MS, Infinity, ROW_IN_MS, 0);
    v.name
      .setVisible(true)
      .setY(HEIGHT * AWARD_NAME_AT)
      .setAlpha(row(0));
    v.defeated
      .setVisible(true)
      .setY(HEIGHT * AWARD_NAME_AT + AWARD_NAME_SIZE)
      .setAlpha(row(1));
    this.drawTrophy(v, award, still);
    v.score
      .setVisible(true)
      .setY(HEIGHT * SCORE_AT)
      .setAlpha(row(4));
    v.coins
      .setVisible(true)
      .setY(HEIGHT * COINS_AT)
      .setAlpha(row(5));
    const beat = still ? 1 : 0.5 - 0.5 * Math.cos((ms / PROMPT_BEAT_MS) * Math.PI * 2);
    v.prompt
      .setVisible(award.ready)
      .setY(HEIGHT * CONTINUE_AT)
      .setAlpha(Phaser.Math.Linear(PROMPT_ALPHA[0], PROMPT_ALPHA[1], beat));
    v.wait
      .setVisible(award.ready)
      .setY(HEIGHT * CONTINUE_AT + AWARD_LABEL_SIZE * 1.6)
      .setScale(Math.max(0, award.left), 1);
  }

  /** The keepsake: it lands, then turns on its upright axis with a rim behind it for thickness. */
  private drawTrophy(v: AwardView, award: BossAward, still: boolean): void {
    const landed = (award.ms - AWARD_TROPHY_MS) / TROPHY_LAND_MS;
    const shown = award.trophy !== null && landed > 0;
    for (const o of [v.glow, v.trophy, v.trophyName, ...v.rim]) o.setVisible(shown);
    if (!shown) return;
    const y = HEIGHT * TROPHY_AT;
    const k = Math.min(1, landed);
    const size = TROPHY_SIZE * (still ? 1 : Phaser.Math.Easing.Back.Out(k));
    const turn = still ? 0 : ((award.ms - AWARD_TROPHY_MS) / SPIN_MS) * Math.PI * 2;
    const face = Math.cos(turn);
    const side = Math.sin(turn);
    v.glow
      .setY(y)
      .setAlpha(0.5 * k)
      .setDisplaySize(GLOW_SIZE, GLOW_SIZE);
    v.trophy
      .setY(y)
      .setAlpha(k)
      .setDisplaySize(size * face, size);
    v.rim.forEach((img, i) => {
      // The rim trails the face on the side turning away, which is what reads as an edge.
      img
        .setPosition(WIDTH / 2 - side * RIM_STEP * (i + 1), y)
        .setAlpha(k)
        .setDisplaySize(size * face, size);
    });
    v.trophyName
      .setY(y + TROPHY_SIZE / 2 + AWARD_LABEL_SIZE * 1.4)
      .setAlpha(envelope(award.ms - AWARD_TROPHY_MS - TROPHY_LAND_MS, Infinity, ROW_IN_MS, 0));
  }

  private awardParts(v: AwardView): Array<Text | Image | Rect> {
    return [
      v.name,
      v.defeated,
      v.glow,
      ...v.rim,
      v.trophy,
      v.trophyName,
      v.score,
      v.coins,
      v.prompt,
      v.wait,
    ];
  }

  /** The award card, built the first time it shows. A fight has one boss, so its words never change. */
  private awardFor(award: BossAward): AwardView {
    if (this.award) return this.award;
    const { scene } = this;
    const t = theme();
    const p = t.palette;
    const x = WIDTH / 2;
    const gold = css(p.gold);
    const name = this.name(award.name, AWARD_NAME_SIZE);
    const inked = name.width - 2 * AWARD_NAME_SIZE * GLOW_ROOM;
    name.setScale(Math.min(1, (WIDTH - 2 * CARD_MARGIN) / inked));
    const defeated = label(scene, x, 0, 'Defeated', AWARD_LABEL_SIZE, { color: p.text });
    const glow = scene.add.image(x, 0, 'spark').setTint(p.gold).setBlendMode(Phaser.BlendModes.ADD);
    const rim: Image[] = [];
    for (let i = RIM_LAYERS; i > 0; i--) rim.push(scene.add.image(x, 0, 'boss_trophy'));
    for (const img of rim) img.setTint(RIM_TINT);
    const trophy = scene.add.image(x, 0, 'boss_trophy');
    const trophyName = label(scene, x, 0, award.trophy ?? '', AWARD_LABEL_SIZE, { color: gold });
    const score = display(scene, x, 0, `+${award.score.toLocaleString()}`, SCORE_SIZE, {
      color: gold,
    });
    const coins = label(scene, x, 0, `+${award.coins} coins`, AWARD_LABEL_SIZE, { color: p.text });
    const prompt = label(scene, x, 0, 'Tap to continue', AWARD_LABEL_SIZE, { color: p.text });
    const wait = scene.add.rectangle(x, 0, WAIT_WIDTH, WAIT_HEIGHT, p.accentHi);
    const v: AwardView = {
      name,
      defeated,
      glow,
      rim,
      trophy,
      trophyName,
      score,
      coins,
      prompt,
      wait,
    };
    for (const o of this.awardParts(v)) o.setDepth(CARD_DEPTH);
    return (this.award = v);
  }
}
