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
  laser: [
    8,
    24,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,60,60,0)');
      g.addColorStop(0.5, 'rgba(255,240,240,1)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
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
  'crack1',
  'crack2',
  'shield_bar',
  'deck_panel',
  'deck_knob',
  'edge_glow',
  'rainbow_bar',
  'pu_mystery',
  'pu_hyper',
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
  for (const key of missing) {
    if (!paintFallback(scene, key)) {
      console.warn(`[art] no fallback for missing texture "${key}"`);
    }
  }
}
