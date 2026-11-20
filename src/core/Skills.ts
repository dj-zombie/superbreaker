/**
 * Skills are always on hand: no pickup or slot needed, just a cooldown. The gun answers a slow
 * board with a burst of fire; bullet time answers a busy one with a moment to breathe.
 */
export const SKILL_IDS = ['gun', 'slowmo'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDef {
  label: string;
  color: number;
  /** Time from empty to ready, counting only time with a ball in play. */
  cooldownMs: number;
  /** Cooldown each ball break takes off, counting the explosions a ball sets off. */
  perBreakMs: number;
  /** How long the skill runs once fired. */
  durationMs: number;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  gun: { label: 'Gun', color: 0xff6a3c, cooldownMs: 6_000, perBreakMs: 400, durationMs: 2_500 },
  slowmo: {
    label: 'Bullet Time',
    color: 0x8fb8ff,
    cooldownMs: 3_000,
    perBreakMs: 250,
    durationMs: 2_500,
  },
};

/** What the HUD draws for one skill. */
export interface SkillView {
  id: SkillId;
  /** The charge, or the time left while the skill runs (0..1). */
  fraction: number;
  /** Charged and free to fire. */
  ready: boolean;
  active: boolean;
}

/** Damage a gun burst shares out over its bolts at Armory laser tier 1: about 4-5 plain bricks. */
export const GUN_BUDGET = 450;
/** Each Armory laser tier above the first adds this much. */
export const GUN_BUDGET_PER_TIER = 60;

export function gunBudget(laserTier: number): number {
  return GUN_BUDGET + GUN_BUDGET_PER_TIER * (Math.max(1, Math.floor(laserTier)) - 1);
}

/** Arcade physics runs this many times slower during bullet time. */
export const SLOWMO_TIME_SCALE = 2.2;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** One skill's charge: fills over time and with breaks, then runs for a while once used. */
export class SkillCharge {
  /** 0..1; full means ready. */
  charge: number;
  /** Time left while the skill runs. */
  remainingMs = 0;

  constructor(
    readonly def: SkillDef,
    charge = 0,
  ) {
    this.charge = clamp01(charge);
  }

  get active(): boolean {
    return this.remainingMs > 0;
  }

  get ready(): boolean {
    return !this.active && this.charge >= 1;
  }

  /** For the HUD ring: the charge, or the time left while the skill runs. */
  get fraction(): number {
    return this.active ? this.remainingMs / this.def.durationMs : this.charge;
  }

  /** Runs the clock. Returns 'end' on the frame a running skill stops. */
  update(dtMs: number, charging: boolean): 'end' | null {
    if (this.active) {
      this.remainingMs = Math.max(0, this.remainingMs - dtMs);
      return this.remainingMs === 0 ? 'end' : null;
    }
    if (charging) this.charge = clamp01(this.charge + dtMs / this.def.cooldownMs);
    return null;
  }

  /** A brick broke: knock some time off the cooldown. */
  onBreak(): void {
    this.knock(this.def.perBreakMs);
  }

  /** Knocks `ms` off the cooldown. Nothing while the skill runs. */
  knock(ms: number): void {
    if (this.active) return;
    this.charge = clamp01(this.charge + ms / this.def.cooldownMs);
  }

  /** Fires the skill if it is ready. */
  use(): boolean {
    if (!this.ready) return false;
    this.charge = 0;
    this.remainingMs = this.def.durationMs;
    return true;
  }

  /** Stops a running skill early, keeping the charge spent. */
  stop(): void {
    this.remainingMs = 0;
  }
}
