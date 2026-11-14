import type Phaser from 'phaser';
import { canvasTexture } from './frames';
import type { FrameStyle } from './theme';

type Ctx = CanvasRenderingContext2D;

/** White glyphs on a 64-unit square, tinted per use. */
const GLYPHS: Record<string, (ctx: Ctx) => void> = {
  back: (c) => {
    line(c, [
      [40, 14],
      [22, 32],
      [40, 50],
    ]);
  },
  next: (c) => {
    line(c, [
      [18, 14],
      [34, 32],
      [18, 50],
    ]);
    line(c, [
      [32, 14],
      [48, 32],
      [32, 50],
    ]);
  },
  close: (c) => {
    line(c, [
      [18, 18],
      [46, 46],
    ]);
    line(c, [
      [46, 18],
      [18, 46],
    ]);
  },
  pause: (c) => {
    c.fillRect(19, 14, 9, 36);
    c.fillRect(36, 14, 9, 36);
  },
  play: (c) => {
    c.beginPath();
    c.moveTo(20, 12);
    c.lineTo(50, 32);
    c.lineTo(20, 52);
    c.closePath();
    c.fill();
  },
  gear: (c) => {
    c.save();
    c.translate(32, 32);
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4);
      c.fillRect(-5, -26, 10, 12);
    }
    c.restore();
    c.lineWidth = 8;
    c.beginPath();
    c.arc(32, 32, 14, 0, Math.PI * 2);
    c.stroke();
  },
  music: (c) => {
    c.fillRect(24, 14, 5, 30);
    c.fillRect(42, 10, 5, 30);
    c.beginPath();
    c.moveTo(24, 14);
    c.lineTo(47, 8);
    c.lineTo(47, 16);
    c.lineTo(24, 22);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(20, 45, 8, 6, -0.4, 0, Math.PI * 2);
    c.ellipse(38, 41, 8, 6, -0.4, 0, Math.PI * 2);
    c.fill();
  },
  sfx: (c) => {
    c.beginPath();
    c.moveTo(10, 25);
    c.lineTo(20, 25);
    c.lineTo(32, 13);
    c.lineTo(32, 51);
    c.lineTo(20, 39);
    c.lineTo(10, 39);
    c.closePath();
    c.fill();
    c.lineWidth = 5;
    c.beginPath();
    c.arc(32, 32, 10, -0.8, 0.8);
    c.stroke();
    c.beginPath();
    c.arc(32, 32, 19, -0.8, 0.8);
    c.stroke();
  },
  moon: (c) => {
    c.beginPath();
    c.arc(32, 32, 20, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(42, 24, 17, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  campaign: (c) => {
    c.fillRect(14, 8, 5, 50);
    c.beginPath();
    c.moveTo(19, 10);
    c.lineTo(52, 14);
    c.lineTo(42, 24);
    c.lineTo(52, 34);
    c.lineTo(19, 34);
    c.closePath();
    c.fill();
  },
  arcade: (c) => {
    c.beginPath();
    c.moveTo(36, 6);
    c.lineTo(14, 36);
    c.lineTo(30, 36);
    c.lineTo(26, 58);
    c.lineTo(50, 26);
    c.lineTo(34, 26);
    c.closePath();
    c.fill();
  },
  armory: (c) => {
    c.beginPath();
    c.moveTo(8, 22);
    c.lineTo(56, 22);
    c.lineTo(56, 28);
    c.quadraticCurveTo(44, 30, 42, 38);
    c.lineTo(22, 38);
    c.quadraticCurveTo(20, 30, 8, 28);
    c.closePath();
    c.fill();
    c.fillRect(24, 38, 16, 8);
    c.fillRect(16, 46, 32, 8);
  },
  retry: (c) => {
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(32, 34, 17, -Math.PI * 0.9, Math.PI * 0.6);
    c.stroke();
    c.beginPath();
    c.moveTo(8, 12);
    c.lineTo(22, 26);
    c.lineTo(6, 30);
    c.closePath();
    c.fill();
  },
  home: (c) => {
    c.beginPath();
    c.moveTo(32, 8);
    c.lineTo(56, 30);
    c.lineTo(48, 30);
    c.lineTo(48, 54);
    c.lineTo(36, 54);
    c.lineTo(36, 40);
    c.lineTo(28, 40);
    c.lineTo(28, 54);
    c.lineTo(16, 54);
    c.lineTo(16, 30);
    c.lineTo(8, 30);
    c.closePath();
    c.fill();
  },
  grid: (c) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) c.fillRect(10 + i * 16, 10 + j * 16, 12, 12);
    }
  },
  lock: (c) => {
    c.lineWidth = 7;
    c.beginPath();
    c.arc(32, 26, 11, Math.PI, 0);
    c.lineTo(43, 30);
    c.moveTo(21, 30);
    c.lineTo(21, 26);
    c.stroke();
    c.fillRect(14, 30, 36, 26);
  },
  check: (c) => {
    line(c, [
      [14, 34],
      [27, 47],
      [50, 18],
    ]);
  },
  steel: (c) => {
    c.fillRect(8, 18, 48, 28);
    c.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [
      [15, 25],
      [49, 25],
      [15, 39],
      [49, 39],
    ] as const) {
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },
  tnt: (c) => {
    c.beginPath();
    c.arc(28, 38, 17, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(38, 24);
    c.quadraticCurveTo(44, 12, 52, 12);
    c.stroke();
    c.beginPath();
    c.arc(54, 10, 4, 0, Math.PI * 2);
    c.fill();
  },
  armored: (c) => {
    c.beginPath();
    c.moveTo(32, 6);
    c.lineTo(54, 14);
    c.lineTo(52, 34);
    c.quadraticCurveTo(46, 50, 32, 58);
    c.quadraticCurveTo(18, 50, 12, 34);
    c.lineTo(10, 14);
    c.closePath();
    c.fill();
  },
  regen: (c) => {
    c.fillRect(26, 10, 12, 44);
    c.fillRect(10, 26, 44, 12);
  },
  mover: (c) => {
    line(c, [
      [10, 32],
      [54, 32],
    ]);
    c.beginPath();
    c.moveTo(4, 32);
    c.lineTo(18, 20);
    c.lineTo(18, 44);
    c.closePath();
    c.moveTo(60, 32);
    c.lineTo(46, 20);
    c.lineTo(46, 44);
    c.closePath();
    c.fill();
  },
  storm: (c) => {
    c.beginPath();
    c.ellipse(32, 22, 20, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(34, 30);
    c.lineTo(24, 46);
    c.lineTo(32, 46);
    c.lineTo(28, 60);
    c.lineTo(42, 40);
    c.lineTo(34, 40);
    c.lineTo(38, 30);
    c.closePath();
    c.fill();
  },
  waves: (c) => {
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) c.fillRect(6 + i * 14, 10 + r * 16, 11, 10);
    }
  },
  descent: (c) => {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) c.fillRect(6 + i * 14, 8 + r * 13, 11, 9);
    }
    line(c, [
      [32, 34],
      [32, 54],
    ]);
    c.beginPath();
    c.moveTo(22, 46);
    c.lineTo(32, 58);
    c.lineTo(42, 46);
    c.closePath();
    c.fill();
  },
};

function line(c: Ctx, pts: ReadonlyArray<readonly [number, number]>, width = 7): void {
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}

export type IconName = keyof typeof GLYPHS;

export function iconTexture(scene: Phaser.Scene, name: IconName): string {
  const draw = GLYPHS[name];
  return canvasTexture(scene, `ico_${name}`, 64, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    draw?.(ctx);
  });
}

export function icon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: IconName,
  size: number,
  tint = 0xffffff,
): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, iconTexture(scene, name));
  return img.setDisplaySize(size, size).setTint(tint);
}

// ---------------------------------------------------------------- world path nodes

export type NodeState = 'locked' | 'open' | 'cleared';

function hex(c: Ctx, cx: number, cy: number, r: number, flat = false): void {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (flat ? 0 : Math.PI / 6);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

/** Level marker on the world path, in the world's material. */
export function nodeTexture(
  scene: Phaser.Scene,
  style: FrameStyle,
  state: NodeState,
  big: boolean,
): string {
  const size = big ? 92 : 70;
  return canvasTexture(scene, `ui_node_${style}_${state}_${big ? 'b' : 's'}`, size, size, (c) => {
    const m = size / 2;
    const r = m - 5;
    const lit = state !== 'locked';
    if (style === 'forged') {
      hex(c, m, m, r);
      const g = c.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, lit ? '#4a3024' : '#241712');
      g.addColorStop(1, lit ? '#1a0e09' : '#0c0705');
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = '#0a0402';
      c.stroke();
      hex(c, m, m, r - 5);
      c.lineWidth = 1.5;
      c.strokeStyle = lit ? 'rgba(255,150,70,0.6)' : 'rgba(140,100,80,0.3)';
      c.stroke();
      if (lit) {
        const core = c.createRadialGradient(m, m, 0, m, m, r - 7);
        if (state === 'cleared') {
          core.addColorStop(0, 'rgba(255,240,190,0.95)');
          core.addColorStop(0.5, 'rgba(255,150,40,0.75)');
        } else {
          core.addColorStop(0, 'rgba(255,170,80,0.7)');
          core.addColorStop(0.6, 'rgba(200,60,10,0.35)');
        }
        core.addColorStop(1, 'rgba(120,20,0,0)');
        c.fillStyle = core;
        hex(c, m, m, r - 7);
        c.fill();
      }
    } else if (style === 'gothic') {
      c.beginPath();
      c.arc(m, m, r, 0, Math.PI * 2);
      const g = c.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, lit ? '#2a2c58' : '#15162c');
      g.addColorStop(1, lit ? '#0c0c22' : '#07070f');
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = lit ? '#e2e5f8' : 'rgba(150,154,190,0.5)';
      c.stroke();
      c.beginPath();
      c.arc(m, m, r - 5, 0, Math.PI * 2);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(165,140,255,0.45)';
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.fillStyle = lit ? '#e2e5f8' : 'rgba(150,154,190,0.5)';
        c.beginPath();
        c.arc(m + Math.cos(a) * (r + 0.5), m + Math.sin(a) * (r + 0.5), 2, 0, Math.PI * 2);
        c.fill();
      }
      if (lit) {
        const core = c.createRadialGradient(m, m, 0, m, m, r - 6);
        if (state === 'cleared') {
          core.addColorStop(0, 'rgba(255,236,190,0.9)');
          core.addColorStop(0.5, 'rgba(255,190,110,0.45)');
        } else {
          core.addColorStop(0, 'rgba(200,180,255,0.65)');
          core.addColorStop(0.6, 'rgba(110,80,220,0.3)');
        }
        core.addColorStop(1, 'rgba(60,40,140,0)');
        c.fillStyle = core;
        c.beginPath();
        c.arc(m, m, r - 6, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      hex(c, m, m, r, true);
      c.fillStyle = lit ? 'rgba(6,40,54,0.92)' : 'rgba(3,16,22,0.9)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = lit ? '#3ce7ff' : 'rgba(60,160,190,0.4)';
      c.stroke();
      hex(c, m, m, r - 6, true);
      c.lineWidth = 1;
      c.strokeStyle = lit ? 'rgba(154,244,255,0.5)' : 'rgba(60,160,190,0.2)';
      c.stroke();
      c.fillStyle = 'rgba(150,240,255,0.08)';
      for (let y = 6; y < size - 6; y += 3) c.fillRect(8, y, size - 16, 1);
      if (lit) {
        const core = c.createRadialGradient(m, m, 0, m, m, r - 6);
        if (state === 'cleared') {
          core.addColorStop(0, 'rgba(200,255,240,0.85)');
          core.addColorStop(0.5, 'rgba(60,231,255,0.45)');
        } else {
          core.addColorStop(0, 'rgba(60,231,255,0.5)');
          core.addColorStop(0.6, 'rgba(20,120,180,0.25)');
        }
        core.addColorStop(1, 'rgba(0,60,90,0)');
        c.fillStyle = core;
        hex(c, m, m, r - 6, true);
        c.fill();
      }
    }
  });
}
