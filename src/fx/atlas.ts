import type Phaser from 'phaser';
import { mulberry32 } from './math';

/** The one texture every effect draws from. */
export const FX_TEXTURE = 'fx';

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, w: number, h: number) => void;

/** Generated strips in public/assets/images/fx (scripts/build-fx.py), and how many frames each has. */
export const FX_SHEETS = { fire: 8, smoke: 8, boom: 12, boomg: 12, arc: 4, wisp: 4 } as const;
export type FxSheet = keyof typeof FX_SHEETS;

const sourceKey = (name: string) => `fxsrc_${name}`;

/** `seq('boom', 12)` → ['boom_0', …, 'boom_11']. */
export function seq(name: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${name}_${i}`);
}

/** Frame name groups presets pick from. */
export const F = {
  fire: seq('fire', FX_SHEETS.fire),
  smoke: seq('smoke', FX_SHEETS.smoke),
  boom: seq('boom', FX_SHEETS.boom),
  boomg: seq('boomg', FX_SHEETS.boomg),
  arc: seq('arc', FX_SHEETS.arc),
  wisp: seq('wisp', FX_SHEETS.wisp),
  shards: seq('shard', 4),
  chunks: seq('chunk', 3),
  confetti: ['conf_rect', 'conf_rect', 'conf_ribbon', 'conf_star', 'conf_disc'],
  glyphs: seq('glyph', 6),
  bolts: seq('bolt', 2),
} as const;

export function loadFxSheets(load: Phaser.Loader.LoaderPlugin): void {
  for (const name of Object.keys(FX_SHEETS)) load.image(sourceKey(name), `images/fx/${name}.png`);
}

export function isFxSourceKey(key: string): boolean {
  return key.startsWith('fxsrc_');
}

// ---------------------------------------------------------------------------------------------
// Painters. Everything is white (or gray-shaded white) so tint and color ramps do the coloring.

/** A radial gradient whose alpha follows exp(-k r²): soft, with no visible edge. */
function gaussian(ctx: Ctx, cx: number, cy: number, r: number, k: number, peak = 1, color = '255,255,255'): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    g.addColorStop(u, `rgba(${color},${(peak * Math.exp(-k * u * u) * (1 - u * u * u)).toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function stops(ctx: Ctx, cx: number, cy: number, r: number, list: Array<[number, number]>): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [u, a] of list) g.addColorStop(u, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A thin ray through the center: a radial gradient squashed across its length. */
function ray(ctx: Ctx, cx: number, cy: number, len: number, angle: number, thin: number, peak: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, thin);
  gaussian(ctx, 0, 0, len, 3.2, peak);
  ctx.restore();
}

function poly(ctx: Ctx, pts: Array<[number, number]>, fill: string): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Faceted shard: a light face, a dark face and a bright edge, so a tint reads as a 3D sliver. */
function shard(seed: number): Painter {
  return (ctx, w, h) => {
    const rnd = mulberry32(seed);
    const cx = w / 2;
    const cy = h / 2;
    const n = 3 + Math.floor(rnd() * 2);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
      const r = (0.55 + rnd() * 0.45) * (w / 2 - 1.5) * (i % 2 ? 0.55 : 1);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (0.7 + rnd() * 0.3)]);
    }
    poly(ctx, pts, '#d9d9d9');
    // Facets fan out from an off-center apex.
    const ax = cx + (rnd() - 0.5) * 3;
    const ay = cy + (rnd() - 0.5) * 3;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % n]!;
      const shade = [255, 170, 215, 140][i % 4]!;
      poly(ctx, [[ax, ay], p, q], `rgb(${shade},${shade},${shade})`);
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  };
}

/** Rough rock or brick chunk with a lit top-left and shaded bottom-right. */
function chunk(seed: number): Painter {
  return (ctx, w, h) => {
    const rnd = mulberry32(seed);
    const cx = w / 2;
    const cy = h / 2;
    const n = 6 + Math.floor(rnd() * 3);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = (0.6 + rnd() * 0.4) * (w / 2 - 1.5);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#bdbdbd');
    g.addColorStop(1, '#6e6e6e');
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,60,60,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
}

function jagged(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, rnd: () => number, amp: number): void {
  const steps = 9;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < steps; i++) {
    const u = i / steps;
    ctx.lineTo(x0 + (x1 - x0) * u + (rnd() - 0.5) * amp * 0.3, y0 + (y1 - y0) * u + (rnd() - 0.5) * amp);
  }
  ctx.lineTo(x1, y1);
}

function bolt(seed: number): Painter {
  return (ctx, w, h) => {
    const y = h / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The same seed for each pass, so the glow and the core trace one path.
    for (const [width, a] of [
      [h * 0.7, 0.12],
      [h * 0.35, 0.3],
      [1.6, 1],
    ] as const) {
      jagged(ctx, 1, y, w - 1, y, mulberry32(seed), h * 0.8);
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  };
}

/** Puffy cloud from overlapping soft blobs, lighter on top: smoke when the sheet is missing. */
function puff(seed: number): Painter {
  return (ctx, w) => {
    const rnd = mulberry32(seed);
    const c = w / 2;
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * w * 0.2;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const shade = Math.round(150 + 105 * (1 - (y / w)));
      gaussian(ctx, x, y, w * (0.22 + rnd() * 0.12), 2.6, 0.55, `${shade},${shade},${shade}`);
    }
  };
}

function flame(i: number): Painter {
  return (ctx, w, h) => {
    const rnd = mulberry32(100 + i);
    ctx.save();
    ctx.translate(w / 2 + (rnd() - 0.5) * 4, h * 0.6);
    ctx.scale(0.55, 1);
    gaussian(ctx, 0, 0, h * 0.42, 3, 0.95);
    ctx.restore();
    gaussian(ctx, w / 2, h * 0.68, w * 0.18, 3, 1);
  };
}

function boomFrame(i: number, n: number): Painter {
  return (ctx, w) => {
    const t = i / (n - 1);
    const r = w * (0.12 + 0.36 * Math.sqrt(t));
    const heat = Math.max(0, 1 - t * 1.3);
    gaussian(ctx, w / 2, w / 2, r, 2.2, 0.9 * (1 - t * 0.6), `${255},${Math.round(120 + 120 * heat)},${Math.round(40 + 180 * heat * heat)}`);
    if (heat > 0) gaussian(ctx, w / 2, w / 2, r * 0.5, 3, heat, '255,250,230');
  };
}

function wisp(seed: number): Painter {
  return (ctx, w) => {
    const rnd = mulberry32(seed);
    const c = w / 2;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      const off = (arm / 3) * Math.PI * 2 + rnd();
      ctx.beginPath();
      for (let s = 0; s <= 30; s++) {
        const u = s / 30;
        const a = off + u * 4;
        const r = u * w * 0.42;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (s) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = w * 0.06;
      ctx.stroke();
    }
    gaussian(ctx, c, c, w * 0.3, 4, 0.8);
  };
}

/** Every painted frame: name → [width, height, painter]. */
const PAINTED: Record<string, [number, number, Painter]> = {
  glow: [64, 64, (c, w) => gaussian(c, w / 2, w / 2, w / 2, 4.2)],
  core: [
    64,
    64,
    (c, w) => {
      gaussian(c, w / 2, w / 2, w / 2, 3, 0.35);
      gaussian(c, w / 2, w / 2, w / 2, 22, 1);
    },
  ],
  disc: [32, 32, (c, w) => stops(c, w / 2, w / 2, w / 2, [[0, 1], [0.62, 0.95], [0.85, 0.4], [1, 0]])],
  bokeh: [
    64,
    64,
    (c, w) =>
      stops(c, w / 2, w / 2, w / 2 - 1, [
        [0, 0.28],
        [0.7, 0.36],
        [0.88, 0.85],
        [0.95, 0.5],
        [1, 0],
      ]),
  ],
  dot: [8, 8, (c, w) => gaussian(c, w / 2, w / 2, w / 2, 3.5)],
  ember: [
    16,
    16,
    (c, w) => {
      gaussian(c, w / 2, w / 2, w / 2, 4, 0.6);
      gaussian(c, w / 2, w / 2, w / 4, 3, 1);
    },
  ],
  streak: [
    64,
    10,
    (c, w, h) => {
      // Bright head on the right, tapering tail on the left; rotated to the velocity in play.
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      g.addColorStop(0.88, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      for (const [th, a] of [
        [h, 0.25],
        [h * 0.5, 0.6],
        [h * 0.22, 1],
      ] as const) {
        c.globalAlpha = a;
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(w / 2, h / 2, w / 2, th / 2, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    },
  ],
  drop: [
    32,
    4,
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0.9)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      c.fill();
    },
  ],
  star4: [
    128,
    128,
    (c, w) => {
      gaussian(c, w / 2, w / 2, w * 0.22, 3, 0.7);
      ray(c, w / 2, w / 2, w / 2, 0, 0.05, 1);
      ray(c, w / 2, w / 2, w / 2, Math.PI / 2, 0.05, 1);
      ray(c, w / 2, w / 2, w * 0.32, Math.PI / 4, 0.04, 0.45);
      ray(c, w / 2, w / 2, w * 0.32, -Math.PI / 4, 0.04, 0.45);
      gaussian(c, w / 2, w / 2, w * 0.08, 2, 1);
    },
  ],
  star6: [
    128,
    128,
    (c, w) => {
      gaussian(c, w / 2, w / 2, w * 0.2, 3, 0.6);
      for (let i = 0; i < 3; i++) ray(c, w / 2, w / 2, w / 2, (i * Math.PI) / 3, 0.045, 1);
      gaussian(c, w / 2, w / 2, w * 0.07, 2, 1);
    },
  ],
  twinkle: [
    32,
    32,
    (c, w) => {
      ray(c, w / 2, w / 2, w / 2, 0, 0.08, 1);
      ray(c, w / 2, w / 2, w / 2, Math.PI / 2, 0.08, 1);
      gaussian(c, w / 2, w / 2, w * 0.18, 2.5, 1);
    },
  ],
  flare: [
    256,
    24,
    (c, w, h) => {
      c.save();
      c.translate(w / 2, h / 2);
      c.scale(1, h / w);
      gaussian(c, 0, 0, w / 2, 3.5, 1);
      c.restore();
      c.save();
      c.translate(w / 2, h / 2);
      c.scale(1, (h / w) * 0.35);
      gaussian(c, 0, 0, w / 2, 6, 1);
      c.restore();
    },
  ],
  ghost: [
    64,
    64,
    (c, w) =>
      stops(c, w / 2, w / 2, w / 2 - 1, [
        [0, 0.05],
        [0.65, 0.1],
        [0.88, 0.45],
        [1, 0],
      ]),
  ],
  ring: [
    128,
    128,
    (c, w) =>
      stops(c, w / 2, w / 2, w / 2 - 1, [
        [0, 0],
        [0.84, 0],
        [0.92, 1],
        [1, 0],
      ]),
  ],
  ringThick: [
    128,
    128,
    (c, w) =>
      stops(c, w / 2, w / 2, w / 2 - 1, [
        [0, 0],
        [0.55, 0],
        [0.8, 0.9],
        [0.9, 0.6],
        [1, 0],
      ]),
  ],
  shock: [
    256,
    256,
    (c, w) =>
      stops(c, w / 2, w / 2, w / 2 - 1, [
        [0, 0],
        [0.5, 0.03],
        [0.82, 0.25],
        [0.93, 1],
        [0.97, 0.4],
        [1, 0],
      ]),
  ],
  hex: [
    64,
    64,
    (c, w) => {
      const r = w / 2 - 4;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = w / 2 + Math.cos(a) * r;
        const y = w / 2 + Math.sin(a) * r;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = 1.6;
      c.stroke();
    },
  ],
  beam: [
    32,
    128,
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const d = (u - 0.5) * 2;
        g.addColorStop(u, `rgba(255,255,255,${(Math.exp(-5 * d * d) * (1 - Math.abs(d) ** 4)).toFixed(3)})`);
      }
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Fade both ends so a stretched beam has no hard cap.
      c.globalCompositeOperation = 'destination-in';
      const v = c.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.15, 'rgba(0,0,0,1)');
      v.addColorStop(0.85, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
    },
  ],
  band: [
    32,
    16,
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const d = (u - 0.5) * 2;
        g.addColorStop(u, `rgba(255,255,255,${(Math.exp(-3.5 * d * d) * (1 - d * d)).toFixed(3)})`);
      }
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  ],
  scorch: [
    64,
    64,
    (c, w) => {
      const rnd = mulberry32(7);
      gaussian(c, w / 2, w / 2, w / 2, 2.4, 0.85, '0,0,0');
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2;
        c.save();
        c.translate(w / 2, w / 2);
        c.rotate(a);
        c.scale(1, 0.12 + rnd() * 0.1);
        gaussian(c, w * 0.18, 0, w * (0.25 + rnd() * 0.12), 2.5, 0.5, '0,0,0');
        c.restore();
      }
    },
  ],
  splash: [
    32,
    16,
    (c, w, h) => {
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(w / 2, h - 4, w / 2 - 3, 3, 0, 0, Math.PI);
      c.stroke();
      for (const [x, y] of [
        [w * 0.25, h * 0.35],
        [w * 0.5, h * 0.15],
        [w * 0.75, h * 0.35],
      ] as const) {
        gaussian(c, x, y, 3, 2, 1);
      }
    },
  ],
  bit: [
    8,
    8,
    (c, w) => {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(0, 0, w, w);
      c.fillStyle = '#ffffff';
      c.fillRect(1.5, 1.5, w - 3, w - 3);
    },
  ],
  conf_rect: [
    12,
    7,
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c4c4c4');
      c.fillStyle = g;
      c.fillRect(0.5, 0.5, w - 1, h - 1);
    },
  ],
  conf_ribbon: [
    24,
    9,
    (c, w, h) => {
      c.strokeStyle = '#f2f2f2';
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      c.beginPath();
      for (let x = 2; x <= w - 2; x++) {
        const y = h / 2 + Math.sin((x / w) * Math.PI * 3) * (h / 2 - 2);
        if (x === 2) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    },
  ],
  conf_star: [
    16,
    16,
    (c, w) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? w * 0.2 : w / 2 - 1;
        pts.push([w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r]);
      }
      poly(c, pts, '#ffffff');
    },
  ],
  conf_disc: [10, 10, (c, w) => stops(c, w / 2, w / 2, w / 2, [[0, 1], [0.75, 1], [1, 0]])],
  // A coin face-on, light from the top left so a gold tint reads as metal; `flutter` spins it.
  coin: [
    18,
    18,
    (c, w) => {
      const r = w / 2 - 1;
      const g = c.createLinearGradient(0, 0, w, w);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#d0d0d0');
      g.addColorStop(1, '#7a7a7a');
      c.fillStyle = g;
      c.beginPath();
      c.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(90,90,90,0.9)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(w / 2, w / 2, r * 0.66, 0, Math.PI * 2);
      c.stroke();
      gaussian(c, w * 0.36, w * 0.32, w * 0.26, 3, 0.9);
    },
  ],
  // Six-armed ice crystal with side branches.
  flake: [
    32,
    32,
    (c, w) => {
      const m = w / 2;
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineCap = 'round';
      c.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const ex = Math.cos(a);
        const ey = Math.sin(a);
        c.beginPath();
        c.moveTo(m, m);
        c.lineTo(m + ex * (m - 2), m + ey * (m - 2));
        for (const [u, len] of [
          [0.45, 0.22],
          [0.7, 0.16],
        ] as const) {
          const bx = m + ex * (m - 2) * u;
          const by = m + ey * (m - 2) * u;
          for (const s of [-1, 1]) {
            const b = a + s * 0.8;
            c.moveTo(bx, by);
            c.lineTo(bx + Math.cos(b) * w * len, by + Math.sin(b) * w * len);
          }
        }
        c.stroke();
      }
      gaussian(c, m, m, w * 0.22, 2.5, 0.8);
    },
  ],
  ...Object.fromEntries(F.shards.map((n, i) => [n, [24, 24, shard(11 + i * 7)]])),
  ...Object.fromEntries(F.chunks.map((n, i) => [n, [24, 24, chunk(41 + i * 13)]])),
  ...Object.fromEntries(F.bolts.map((n, i) => [n, [96, 20, bolt(71 + i * 5)]])),
  ...Object.fromEntries(
    F.glyphs.map((n, i) => [
      n,
      [
        12,
        16,
        (c: Ctx, w: number, h: number) => {
          c.fillStyle = '#ffffff';
          c.font = `bold ${h - 2}px monospace`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('01AF7X'[i]!, w / 2, h / 2 + 1);
        },
      ],
    ]),
  ),
};

/** Procedural stand-ins for each generated frame, used when its strip did not load. */
function sheetFallback(sheet: FxSheet, i: number): [number, number, Painter] {
  const n = FX_SHEETS[sheet];
  switch (sheet) {
    case 'fire':
      return [64, 64, flame(i)];
    case 'smoke':
      return [96, 96, puff(200 + i * 17)];
    case 'boom':
    case 'boomg':
      return [128, 128, boomFrame(i, n)];
    case 'arc':
      return [128, 128, (c, w, h) => bolt(300 + i)(c, w, h)];
    case 'wisp':
      return [64, 64, wisp(400 + i)];
  }
}

// ---------------------------------------------------------------------------------------------

interface Item {
  name: string;
  w: number;
  h: number;
  draw: (ctx: Ctx, x: number, y: number) => void;
}

const PAD = 2;
const ATLAS_W = 2048;

/** Shelf packing, tallest first. Returns each item's top-left and the atlas height. */
export function packShelves(items: ReadonlyArray<{ w: number; h: number }>, width: number, pad = PAD) {
  const order = items.map((_, i) => i).sort((a, b) => items[b]!.h - items[a]!.h || items[b]!.w - items[a]!.w);
  const at: Array<{ x: number; y: number }> = new Array(items.length);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const i of order) {
    const it = items[i]!;
    const w = it.w + pad * 2;
    const h = it.h + pad * 2;
    if (x + w > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    at[i] = { x: x + pad, y: y + pad };
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { at, height: y + shelf };
}

/**
 * Bakes every painted frame and every loaded strip into the `fx` canvas texture, then drops the
 * strips. Call once after loading, before any scene plays an effect.
 */
export function buildFxAtlas(scene: Phaser.Scene): void {
  const items: Item[] = [];
  for (const [name, [w, h, paint]] of Object.entries(PAINTED)) {
    items.push({
      name,
      w,
      h,
      draw: (ctx, x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        paint(ctx, w, h);
        ctx.restore();
      },
    });
  }
  for (const sheet of Object.keys(FX_SHEETS) as FxSheet[]) {
    const key = sourceKey(sheet);
    const img = scene.textures.exists(key)
      ? (scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement)
      : undefined;
    const cell = img ? img.height : 0;
    const have = img && cell > 0 ? Math.floor(img.width / cell) : 0;
    for (let i = 0; i < FX_SHEETS[sheet]; i++) {
      const name = `${sheet}_${i}`;
      if (img && i < have) {
        items.push({
          name,
          w: cell,
          h: cell,
          draw: (ctx, x, y) => ctx.drawImage(img, i * cell, 0, cell, cell, x, y, cell, cell),
        });
      } else {
        const [w, h, paint] = sheetFallback(sheet, i);
        items.push({
          name,
          w,
          h,
          draw: (ctx, x, y) => {
            ctx.save();
            ctx.translate(x, y);
            paint(ctx, w, h);
            ctx.restore();
          },
        });
      }
    }
  }

  const { at, height } = packShelves(items, ATLAS_W);
  if (scene.textures.exists(FX_TEXTURE)) scene.textures.remove(FX_TEXTURE);
  const tex = scene.textures.createCanvas(FX_TEXTURE, ATLAS_W, Math.ceil(height / 4) * 4);
  if (!tex) return;
  const ctx = tex.getContext();
  items.forEach((it, i) => {
    const p = at[i]!;
    it.draw(ctx, p.x, p.y);
    tex.add(it.name, 0, p.x, p.y, it.w, it.h);
  });
  tex.refresh();
  for (const sheet of Object.keys(FX_SHEETS)) {
    const key = sourceKey(sheet);
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}

/** Names of every frame the atlas holds, for validating presets. */
export function fxFrameNames(): string[] {
  const names = Object.keys(PAINTED);
  for (const sheet of Object.keys(FX_SHEETS) as FxSheet[]) names.push(...seq(sheet, FX_SHEETS[sheet]));
  return names;
}
