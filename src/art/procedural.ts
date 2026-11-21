import type Phaser from 'phaser';
import { ABILITY_INFO, BRICK_TINT, POWERUP_INFO } from '../config';
import { ABILITY_IDS, type AbilityId } from '../core/Abilities';
import type { PowerupId } from '../core/types';

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, w: number, h: number) => void;

function hex(c: number, alpha = 1): string {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(c: number, f: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paint(scene: Phaser.Scene, key: string, w: number, h: number, fn: Painter): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  fn(ctx, w, h);
  tex.refresh();
}

function brickPainter(texture: string): Painter {
  const base = BRICK_TINT[texture] ?? 0x888888;
  return (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(shade(base, 1.35)));
    g.addColorStop(0.5, hex(base));
    g.addColorStop(1, hex(shade(base, 0.6)));
    roundRect(ctx, 1, 1, w - 2, h - 2, 6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hex(shade(base, 0.45));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, 5, 4, w - 10, 5, 3);
    ctx.fill();

    if (texture === 'brick_steel') {
      ctx.fillStyle = 'rgba(30,34,48,0.8)';
      for (const x of [8, w - 8]) {
        ctx.beginPath();
        ctx.arc(x, h / 2 + 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h - 5);
      ctx.lineTo(w * 0.55, 6);
      ctx.stroke();
    } else if (texture === 'brick_explosive') {
      ctx.fillStyle = 'rgba(20,10,0,0.75)';
      ctx.font = `bold ${h * 0.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TNT', w / 2, h / 2 + 2);
    } else if (texture === 'brick_armored') {
      ctx.strokeStyle = 'rgba(20,24,36,0.7)';
      ctx.lineWidth = 3;
      roundRect(ctx, 5, 5, w - 10, h - 10, 3);
      ctx.stroke();
    } else if (texture === 'brick_regen') {
      ctx.strokeStyle = 'rgba(10,60,20,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + 1, h * 0.25, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
  };
}

function powerupPainter(id: PowerupId): Painter {
  const info = POWERUP_INFO[id];
  const letter: Record<PowerupId, string> = {
    magnet: 'M',
    fireball: 'F',
    laser: 'L',
    balls: '3',
    bigger: '+',
    smaller: '-',
    coin: '$',
    shield: 'S',
    hyper: '»',
    extraLife: '♥',
    pierce: 'P',
    mystery: '?',
  };
  if (id === 'mystery') return mysteryPainter;
  return (ctx, w, h) => {
    const r = Math.min(w, h) / 2 - 3;
    const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 2, w / 2, h / 2, r);
    g.addColorStop(0, hex(shade(info.color, 1.5)));
    g.addColorStop(1, hex(shade(info.color, 0.55)));
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    if (id === 'hyper') {
      ctx.fillStyle = '#fff';
      for (const dx of [-r * 0.42, r * 0.12]) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + dx, h / 2 - r * 0.5);
        ctx.lineTo(w / 2 + dx + r * 0.42, h / 2);
        ctx.lineTo(w / 2 + dx, h / 2 + r * 0.5);
        ctx.lineTo(w / 2 + dx + r * 0.16, h / 2);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${r * 1.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter[id], w / 2, h / 2 + 2);
  };
}

const mysteryPainter: Painter = (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  ['#ff4d6d', '#ffc93c', '#5cff8a', '#3ce7ff', '#b05cff'].forEach((c, i, a) =>
    g.addColorStop(i / (a.length - 1), c),
  );
  roundRect(ctx, 4, 4, w - 8, h - 8, 12);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.font = `900 ${h * 0.62}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1a0629';
  ctx.strokeText('?', w / 2, h / 2 + 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('?', w / 2, h / 2 + 3);
};

/** Glyphs for the ability slot icons, drawn in a 64x64 box. */
const abilityGlyphs: Record<AbilityId, (ctx: Ctx) => void> = {
  meteor: (ctx) => {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const [x, y, len] of [
      [22, 22, 16],
      [30, 16, 12],
      [16, 32, 10],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y - len);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(38, 38, 11, 0, Math.PI * 2);
    ctx.fill();
  },
  lightning: (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const [x, y] of [
      [36, 10],
      [20, 36],
      [31, 36],
      [26, 54],
      [44, 26],
      [33, 26],
      [38, 10],
    ] as const)
      ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  },
  bomb: (ctx) => {
    ctx.fillStyle = '#1a0629';
    ctx.beginPath();
    ctx.arc(30, 36, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 24);
    ctx.quadraticCurveTo(46, 14, 52, 16);
    ctx.stroke();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(52, 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(25, 31, 4, 0, Math.PI * 2);
    ctx.fill();
  },
  sweep: (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(28, 10, 8, 44);
    ctx.beginPath();
    ctx.moveTo(44, 24);
    ctx.lineTo(54, 32);
    ctx.lineTo(44, 40);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, 24);
    ctx.lineTo(10, 32);
    ctx.lineTo(20, 40);
    ctx.fill();
  },
  blackhole: (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(32, 32, 8 + i * 6, i * 1.2, i * 1.2 + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.fillStyle = '#0b0820';
    ctx.beginPath();
    ctx.arc(32, 32, 7, 0, Math.PI * 2);
    ctx.fill();
  },
  frenzy: (ctx) => {
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [
      [22, 24],
      [42, 24],
      [32, 42],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

function abilityPainter(id: AbilityId): Painter {
  const color = ABILITY_INFO[id].color;
  return (ctx, w, h) => {
    const r = Math.min(w, h) / 2 - 3;
    const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 2, w / 2, h / 2, r);
    g.addColorStop(0, hex(shade(color, 1.4)));
    g.addColorStop(1, hex(shade(color, 0.5)));
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.scale(w / 64, h / 64);
    abilityGlyphs[id](ctx);
    ctx.restore();
  };
}

const painters: Record<string, [number, number, Painter]> = {
  paddle: [
    220,
    48,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9af6ff');
      g.addColorStop(0.5, '#3ca8ff');
      g.addColorStop(1, '#1b3c9e');
      roundRect(ctx, 2, 2, w - 4, h - 4, h / 2 - 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e6fbff';
      ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      for (const x of [h / 2, w - h / 2]) {
        ctx.beginPath();
        ctx.arc(x, h / 2, h / 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  ],
  ball: [
    48,
    48,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.35, h * 0.35, 2, w / 2, h / 2, w / 2 - 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, '#b8f3ff');
      g.addColorStop(1, '#3ca8ff');
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    },
  ],
  shard: [
    12,
    12,
    (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(12, 0);
      ctx.lineTo(8, 12);
      ctx.closePath();
      ctx.fill();
    },
  ],
  spark: [
    16,
    16,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  ],
  ring: [
    128,
    128,
    (ctx, w, h) => {
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
      ctx.stroke();
    },
  ],
  /** A boss's lock: white so it can be tinted, with a black edge that tint leaves black. */
  crosshair: [
    128,
    128,
    (ctx, w, h) => {
      const c = w / 2;
      const ring = w / 2 - 10;
      const gap = 16;
      const reach = ring - 8;
      const stroke = (width: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(c, c, ring, 0, Math.PI * 2);
        ctx.moveTo(c, c - reach);
        ctx.lineTo(c, c - gap);
        ctx.moveTo(c, c + gap);
        ctx.lineTo(c, c + reach);
        ctx.moveTo(c - reach, c);
        ctx.lineTo(c - gap, c);
        ctx.moveTo(c + gap, c);
        ctx.lineTo(c + reach, c);
        ctx.stroke();
      };
      // The black edge first, then the mark. Tint turns the white red and leaves the edge black.
      stroke(16, '#000');
      stroke(8, '#fff');
    },
  ],
  /** A boss's shot, white so it can be tinted: a dart pointing right, turned to face its flight. */
  hazard_shot: [
    48,
    32,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(w - 2, h / 2);
      ctx.lineTo(4, 3);
      ctx.lineTo(16, h / 2);
      ctx.lineTo(4, h - 3);
      ctx.closePath();
      ctx.fill();
    },
  ],
  /** A skull, face on and white so it can be tinted. Nothing a player picks up has a face. */
  hazard_skull: [
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, w * 0.28, h * 0.6, w * 0.44, h * 0.34, 6);
      ctx.fill();
      // The sockets, the nose and the gaps between the teeth are cut out, so they stay see-through.
      ctx.globalCompositeOperation = 'destination-out';
      for (const x of [w * 0.33, w * 0.67]) {
        ctx.beginPath();
        ctx.arc(x, h * 0.45, w * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.55);
      ctx.lineTo(w * 0.44, h * 0.67);
      ctx.lineTo(w * 0.56, h * 0.67);
      ctx.closePath();
      ctx.fill();
      for (const x of [w * 0.42, w * 0.5, w * 0.58]) ctx.fillRect(x - 1.5, h * 0.78, 3, h * 0.16);
      ctx.globalCompositeOperation = 'source-over';
    },
  ],
  /** A cross, white so it can be tinted, for the spot on the paddle line where a shot will land. */
  hazard_mark: [
    32,
    32,
    (ctx, w, h) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.lineTo(w - 6, h - 6);
      ctx.moveTo(w - 6, 6);
      ctx.lineTo(6, h - 6);
      ctx.stroke();
    },
  ],
  /** The keepsake a dead boss leaves: a gold medal with a cut stone, face on so it can be spun. */
  boss_trophy: [
    160,
    160,
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = w / 2 - 4;
      const gold = ctx.createLinearGradient(0, 0, w, h);
      gold.addColorStop(0, '#fff3b0');
      gold.addColorStop(0.45, '#f2b632');
      gold.addColorStop(1, '#9a5a10');
      ctx.fillStyle = gold;
      ctx.beginPath();
      // A scalloped edge: twelve lobes round the rim.
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const rr = r - 5 + 5 * Math.cos(a * 12);
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#7a4208';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff6c8';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      // The stone: an eight-sided cut, lit from the top left.
      const stone = r * 0.46;
      const cut = (k: number): void => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          ctx.lineTo(cx + Math.cos(a) * stone * k, cy + Math.sin(a) * stone * k);
        }
        ctx.closePath();
      };
      const red = ctx.createLinearGradient(cx - stone, cy - stone, cx + stone, cy + stone);
      red.addColorStop(0, '#ff9a8a');
      red.addColorStop(0.5, '#e0241c');
      red.addColorStop(1, '#6a0608');
      ctx.fillStyle = red;
      cut(1);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#4a0406';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      cut(0.55);
      ctx.fill();
    },
  ],
  crack1: [
    60,
    32,
    (ctx) => {
      ctx.strokeStyle = 'rgba(10,10,20,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(18, 2);
      ctx.lineTo(26, 14);
      ctx.lineTo(20, 22);
      ctx.lineTo(30, 30);
      ctx.stroke();
    },
  ],
  crack2: [
    60,
    32,
    (ctx) => {
      ctx.strokeStyle = 'rgba(10,10,20,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(18, 2);
      ctx.lineTo(26, 14);
      ctx.lineTo(20, 22);
      ctx.lineTo(30, 30);
      ctx.moveTo(26, 14);
      ctx.lineTo(42, 10);
      ctx.lineTo(50, 22);
      ctx.moveTo(42, 10);
      ctx.lineTo(46, 2);
      ctx.stroke();
    },
  ],
  shield_bar: [
    600,
    16,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(120,220,255,0)');
      g.addColorStop(0.5, 'rgba(120,220,255,1)');
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  ],
  // Stretched textures use non-power-of-two sizes: Phaser gives power-of-two textures REPEAT
  // wrapping, and linear filtering then bleeds the opposite edge in as a bright seam.
  deck_panel: [
    16,
    250,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(30,20,74,0.94)');
      g.addColorStop(1, 'rgba(8,6,24,0.98)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createLinearGradient(0, 0, 0, 16);
      glow.addColorStop(0, 'rgba(125,92,255,0.6)');
      glow.addColorStop(1, 'rgba(125,92,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, 16);
      ctx.fillStyle = 'rgba(200,184,255,0.95)';
      ctx.fillRect(0, 0, w, 2);
    },
  ],
  deck_knob: [
    72,
    20,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9af6ff');
      g.addColorStop(1, '#2f7fe0');
      roundRect(ctx, 2, 2, w - 4, h - 4, h / 2 - 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(230,251,255,0.9)';
      ctx.stroke();
    },
  ],
  rainbow_bar: [
    256,
    4,
    (ctx, w, h) => {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = `hsl(${(x / w) * 360}, 100%, 58%)`;
        ctx.fillRect(x, 0, 1, h);
      }
    },
  ],
  edge_glow: [
    30,
    4,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  ],
  // White so the corner tints can paint a hot head (top) fading into a colored tail.
  laser_tracer: [
    10,
    34,
    (ctx, w, h) => {
      const across = ctx.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, 'rgba(255,255,255,0)');
      across.addColorStop(0.5, 'rgba(255,255,255,1)');
      across.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w / 2 - 1, 2, 2, h * 0.55);
      ctx.globalCompositeOperation = 'destination-in';
      const along = ctx.createLinearGradient(0, 0, 0, h);
      along.addColorStop(0, 'rgba(0,0,0,0.5)');
      along.addColorStop(0.1, 'rgba(0,0,0,1)');
      along.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = along;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    },
  ],
  laser_missile: [
    10,
    18,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0.25)');
      roundRect(ctx, w / 2 - 2.5, 1, 5, h - 4, 2.5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + s * 2.5, h - 8);
        ctx.lineTo(w / 2 + s * (w / 2), h - 1);
        ctx.lineTo(w / 2 + s * 2.5, h - 3);
        ctx.closePath();
        ctx.fill();
      }
    },
  ],
  // Light steel so the heat tint reads; the paddle hides its lower half.
  laser_pod: [
    14,
    22,
    (ctx, w, h) => {
      const body = ctx.createLinearGradient(0, 0, w, 0);
      body.addColorStop(0, '#8d95a6');
      body.addColorStop(0.45, '#f4f6fb');
      body.addColorStop(1, '#7a8294');
      roundRect(ctx, 1, 7, w - 2, h - 7, 3);
      ctx.fillStyle = body;
      ctx.fill();
      roundRect(ctx, w / 2 - 2.5, 0, 5, 10, 2);
      ctx.fillStyle = '#dfe4ee';
      ctx.fill();
      ctx.fillStyle = 'rgba(20,24,36,0.6)';
      ctx.fillRect(w / 2 - 1, 0, 2, 3);
      ctx.fillStyle = 'rgba(20,24,36,0.45)';
      for (const y of [12, 15, 18]) ctx.fillRect(3, y, w - 6, 1.5);
    },
  ],
  laser_flash: [
    26,
    26,
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? w / 2 : w * 0.1;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    },
  ],
  laser_casing: [
    4,
    8,
    (ctx, w, h) => {
      roundRect(ctx, 0, 0, w, h, 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, h - 2, w, 2);
    },
  ],
  laser_bit: [
    6,
    6,
    (ctx, w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(1, 1, w - 2, h - 2);
    },
  ],
};

const logoPainter: Painter = (ctx, w, h) => {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.42}px system-ui, sans-serif`;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff6a8');
  g.addColorStop(1, '#ff4d6d');
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#1a0629';
  ctx.strokeText('SUPER', w / 2, h * 0.28);
  ctx.strokeText('BREAKER', w / 2, h * 0.72);
  ctx.fillStyle = g;
  ctx.fillText('SUPER', w / 2, h * 0.28);
  ctx.fillText('BREAKER', w / 2, h * 0.72);
};

/** Textures that are always generated in code. */
export const ALWAYS_PROCEDURAL = [
  'shard',
  'spark',
  'ring',
  'crosshair',
  'hazard_shot',
  'hazard_skull',
  'hazard_mark',
  'boss_trophy',
  'crack1',
  'crack2',
  'shield_bar',
  'deck_panel',
  'deck_knob',
  'edge_glow',
  'rainbow_bar',
  'laser_tracer',
  'laser_missile',
  'laser_pod',
  'laser_flash',
  'laser_casing',
  'laser_bit',
  ...ABILITY_IDS.map((id) => `ab_${id}`),
];

/** Draws `key` procedurally. Returns false if there is no recipe for it. */
export function paintFallback(scene: Phaser.Scene, key: string): boolean {
  if (key.startsWith('brick_')) {
    paint(scene, key, 60, 32, brickPainter(key));
    return true;
  }
  if (key.startsWith('pu_')) {
    paint(scene, key, 64, 64, powerupPainter(key.slice(3) as PowerupId));
    return true;
  }
  if (key.startsWith('ab_')) {
    paint(scene, key, 96, 96, abilityPainter(key.slice(3) as AbilityId));
    return true;
  }
  if (key === 'logo') {
    paint(scene, key, 560, 240, logoPainter);
    return true;
  }
  const recipe = painters[key];
  if (!recipe) return false;
  paint(scene, key, recipe[0], recipe[1], recipe[2]);
  return true;
}

export const FIRE_FRAMES = ['f0', 'f1', 'f2', 'f3', 'f4'];
export const BOOM_FRAMES = ['b0', 'b1', 'b2', 'b3', 'b4'] as const;

/** One cell of the mega-bomb explosion: core, burst, fireball, broken ring, smoke. */
function paintBoomFrame(ctx: Ctx, size: number, frame: number): void {
  const c = size / 2;
  if (frame === 0) {
    const g = ctx.createRadialGradient(c, c, 0, c, c, 16);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#fff6c8');
    g.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return;
  }
  if (frame === 1) {
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    for (let s = 0; s < 16; s++) {
      const a = (s / 16) * Math.PI * 2 - Math.PI / 2;
      const r = s % 2 === 0 ? 30 : 11;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const g = ctx.createRadialGradient(c, c, 0, c, c, 18);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#ffb020');
    g.addColorStop(1, 'rgba(255,176,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return;
  }
  if (frame === 2) {
    const g = ctx.createRadialGradient(c, c, 2, c, c, 28);
    g.addColorStop(0, '#fff6d0');
    g.addColorStop(0.35, '#ff9a1f');
    g.addColorStop(0.68, '#ff3c6d');
    g.addColorStop(1, 'rgba(255,60,109,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff1b0';
    for (const [ox, oy] of [
      [-16, -8],
      [14, -12],
      [8, 14],
    ] as const) {
      ctx.beginPath();
      ctx.arc(c + ox, c + oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (frame === 3) {
    ctx.strokeStyle = '#ff4d3a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let s = 0; s < 7; s++) {
      const a0 = s * 0.9 + 0.15;
      ctx.beginPath();
      ctx.arc(c, c, 20 + (s % 3), a0, a0 + 0.48);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, 14);
    g.addColorStop(0, 'rgba(255,220,140,0.95)');
    g.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return;
  }
  ctx.fillStyle = 'rgba(168,166,176,0.45)';
  for (const [ox, oy, r] of [
    [0, -4, 16],
    [-12, 6, 12],
    [13, 7, 11],
    [1, -14, 8],
  ] as const) {
    ctx.beginPath();
    ctx.arc(c + ox, c + oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Five-frame blast played once when the mega bomb lands. */
function buildBoomTexture(scene: Phaser.Scene): void {
  const size = 64;
  if (scene.textures.exists('boom')) scene.textures.remove('boom');
  const tex = scene.textures.createCanvas('boom', size * BOOM_FRAMES.length, size);
  if (!tex) return;
  const ctx = tex.getContext();
  BOOM_FRAMES.forEach((name, i) => {
    ctx.save();
    ctx.translate(i * size, 0);
    paintBoomFrame(ctx, size, i);
    ctx.restore();
    tex.add(name, 0, i * size, 0, size, size);
  });
  tex.refresh();
}

/** Packs the separate fire/smoke particle images into one multi-frame texture for emitters. */
function buildFireTexture(scene: Phaser.Scene): void {
  const sources = ['fire1', 'fire2', 'fire3', 'fire4', 'smoke'];
  const size = 16;
  if (scene.textures.exists('fire')) scene.textures.remove('fire');
  const tex = scene.textures.createCanvas('fire', size * sources.length, size);
  if (!tex) return;
  const ctx = tex.getContext();
  sources.forEach((key, i) => {
    const img = scene.textures.exists(key)
      ? (scene.textures.get(key).getSourceImage() as CanvasImageSource)
      : null;
    if (img) {
      ctx.drawImage(img, i * size, 0, size, size);
    } else {
      const g = ctx.createRadialGradient(i * size + 8, 8, 0, i * size + 8, 8, 8);
      g.addColorStop(0, i < 4 ? '#fff3a0' : '#888');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(i * size, 0, size, size);
    }
    tex.add(FIRE_FRAMES[i]!, 0, i * size, 0, size, size);
  });
  tex.refresh();
}

export function ensureProceduralTextures(scene: Phaser.Scene, missing: Iterable<string>): void {
  for (const key of ALWAYS_PROCEDURAL) paintFallback(scene, key);
  buildFireTexture(scene);
  buildBoomTexture(scene);
  for (const key of missing) {
    if (!paintFallback(scene, key)) {
      console.warn(`[art] no fallback for missing texture "${key}"`);
    }
  }
}
