/** Switch and gate channels. A switch flips every gate on its own channel. */
export const CHANNELS = [1, 2, 3] as const;
export type Channel = (typeof CHANNELS)[number];

/** Amber, cyan and magenta: a switch, its gates and their light share the color. */
export const CHANNEL_COLORS: Record<Channel, number> = {
  1: 0xffb02e,
  2: 0x3ce7ff,
  3: 0xff4fd8,
};

/** A switch grazed twice in one bounce must not flip its gates back. */
export const SWITCH_COOLDOWN_MS = 450;

/** How see-through an open gate is. */
export const GATE_OPEN_ALPHA = 0.22;

export function asChannel(v: number | undefined): Channel {
  const n = Math.round(v ?? 1);
  return (CHANNELS as readonly number[]).includes(n) ? (n as Channel) : 1;
}

/** Remembers when each channel last flipped, so one hit flips it once. */
export class Switchboard {
  private last = new Map<Channel, number>();

  /** True if `channel` may flip at `nowMs`, and records the flip. */
  tryFlip(channel: Channel, nowMs: number): boolean {
    const at = this.last.get(channel);
    if (at !== undefined && nowMs - at < SWITCH_COOLDOWN_MS) return false;
    this.last.set(channel, nowMs);
    return true;
  }
}
