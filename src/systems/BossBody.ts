import { BOSS_ID_BASE } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner } from '../entities/Brick';
import type { BossHost, PartDef } from './BossDirector';

/** A part as the brick that stands in for it. It has no armor and never slides or regrows. */
function partSpec(part: PartDef, id: number): BrickSpec {
  const spec: BrickSpec = {
    id,
    x: part.col * BW,
    y: part.row * BH,
    width: part.cols * BW,
    height: part.rows * BH,
    texture: part.texture,
    kind: part.kind ?? 'normal',
    health: BRICK_HEALTH,
    armor: 0,
    moveX: 0,
    moveSpeed: 0,
    regenDelay: 0,
  };
  if (part.light) spec.light = part.light;
  return spec;
}

/** The parts of a boss, standing in the level as bricks the boss owns. */
export class BossBody {
  /** Standing parts by part id. A retired part is forgotten. */
  private readonly bricks = new Map<string, Brick>();
  private readonly defs = new Map<Brick, PartDef>();

  constructor(
    parts: readonly PartDef[],
    private host: BossHost,
    owner: BrickOwner,
  ) {
    // Ids count up from BOSS_ID_BASE so they never collide with the level's own.
    const specs = parts.map((part, i) => partSpec(part, BOSS_ID_BASE + i));
    const bricks = host.bricks.append(specs, owner);
    bricks.forEach((brick, i) => {
      const part = parts[i]!;
      this.bricks.set(part.id, brick);
      this.defs.set(brick, part);
    });
    host.bricksAdded(bricks, false);
  }

  /** The brick standing in for a part, or undefined once it is retired. */
  part(id: string): Brick | undefined {
    return this.bricks.get(id);
  }

  /** The part a brick stands in for, or undefined when the brick is not one of this body's. */
  partOf(brick: Brick): PartDef | undefined {
    return this.defs.get(brick);
  }

  /** Takes parts off the field for good, with no score, drops or chain. */
  retire(...ids: string[]): void {
    const gone: Brick[] = [];
    for (const id of ids) {
      const brick = this.part(id);
      if (!brick) continue;
      this.bricks.delete(id);
      this.defs.delete(brick);
      gone.push(brick);
    }
    this.host.bricks.retire(gone);
  }
}
