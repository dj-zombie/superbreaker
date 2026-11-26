import Phaser from 'phaser';
import { WORLD_IDS, type SceneryId, type WorldId } from '../../art/backdrops';
import { HEIGHT, WIDTH } from '../../config';
import type { CardFrame, CompiledCard } from '../../core/cutscene';
import { glowLineTexture } from '../frames';
import { calm, themeFor } from '../theme';
import { label, worldTitle } from '../type';

function worldOf(id: SceneryId | undefined, fallback: WorldId): WorldId {
  return id && (WORLD_IDS as readonly string[]).includes(id) ? (id as WorldId) : fallback;
}

/**
 * A chapter or title card: a small kicker over the title in the world's own lettering, with a
 * glowing rule between. It settles in from a little large and fades as the frame says.
 */
export class CardView {
  private shown?: CompiledCard;
  private root?: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fallback: () => WorldId,
    private readonly depth = 0,
  ) {}

  objects(): Phaser.GameObjects.GameObject[] {
    return this.root ? [this.root] : [];
  }

  apply(frame: CardFrame | null): void {
    if (!frame) {
      this.root?.destroy();
      this.root = this.shown = undefined;
      return;
    }
    if (frame.card !== this.shown) {
      this.root?.destroy();
      this.shown = frame.card;
      this.root = this.build(frame.card);
    }
    const settle = calm()
      ? 1
      : 1 + 0.05 * (1 - Phaser.Math.Easing.Cubic.Out(Math.min(1, frame.ms / 1400)));
    this.root!.setAlpha(frame.alpha).setScale(settle);
  }

  private build(card: CompiledCard): Phaser.GameObjects.Container {
    const s = this.scene;
    const t = themeFor(worldOf(card.world, this.fallback()));
    const kicker = label(s, 0, -46, card.kicker, 16, { t, color: t.palette.text });
    kicker.setLetterSpacing(6);
    const rule = s.add
      .image(0, -22, glowLineTexture(s))
      .setDisplaySize(Math.min(420, WIDTH - 80), 10)
      .setTint(t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD);
    const title = worldTitle(s, 0, 24, card.title, 58, { t });
    const room = WIDTH - 48;
    if (title.width > room) title.setScale(room / title.width);
    return s.add.container(WIDTH / 2, HEIGHT / 2, [rule, kicker, title]).setDepth(this.depth);
  }

  destroy(): void {
    this.root?.destroy();
  }
}
