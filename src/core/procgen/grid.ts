import { VIRUS_ARMOR, VIRUS_CORE_HEALTH } from '../bricks/virus';
import {
  isBreakableKind,
  type BrickKind,
  type BrickProps,
  type BrickSpec,
  type PowerupId,
} from '../types';

/** The campaign grid: 20 columns of 30x16 bricks across the 600-wide field. */
export const COLS = 20;
export const BW = 30;
export const BH = 16;
/** Lowest row a board may use. Its bottom edge (y = 464) stays above LEVEL_MAX_Y. */
export const MAX_ROW = 28;
export const BOARD_ROWS = MAX_ROW + 1;
export const BRICK_HEALTH = 100;
export const DEFAULT_ARMOR = 2;

export interface Cell {
  kind: BrickKind;
  powerup?: PowerupId;
  /** Movers slide between their cell and this many px to the right (negative = left). */
  moveX?: number;
  moveSpeed?: number;
  /** Armored bricks: extra hits before health goes down. */
  armor?: number;
  /** Element settings: a phantom's phase, a portal's link, a virus core. */
  props?: BrickProps;
}

/** Portals are two rows tall: the cell under one stays empty. */
export const PORTAL_ROWS = 2;

export const mirrorCol = (c: number): number => COLS - 1 - c;

/** A board or chunk as cells. Row 0 is the top. */
export class Grid {
  readonly cells: Array<Cell | null>;

  constructor(readonly rows: number) {
    this.cells = new Array<Cell | null>(rows * COLS).fill(null);
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < COLS;
  }

  get(r: number, c: number): Cell | null {
    return this.inBounds(r, c) ? this.cells[r * COLS + c]! : null;
  }

  set(r: number, c: number, cell: Cell | BrickKind | null): void {
    if (!this.inBounds(r, c)) return;
    this.cells[r * COLS + c] = typeof cell === 'string' ? { kind: cell } : cell;
  }

  /** Fills a rectangle, clipped to the grid. */
  fill(r: number, c: number, h: number, w: number, kind: BrickKind | null): void {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) this.set(y, x, kind);
    }
  }

  /** Sets a cell and its mirror across the center line. */
  setMirrored(r: number, c: number, cell: Cell | BrickKind | null): void {
    this.set(r, c, cell);
    this.set(r, mirrorCol(c), typeof cell === 'object' && cell ? { ...cell } : cell);
  }

  /** Copies the left half onto the right half. */
  mirror(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < COLS / 2; c++) {
        const cell = this.get(r, c);
        this.set(r, mirrorCol(c), cell ? { ...cell } : null);
      }
    }
  }

  isEmpty(r: number, c: number): boolean {
    return this.inBounds(r, c) && this.get(r, c) === null;
  }

  /** True when the rectangle is inside the grid and has no bricks. */
  isAreaEmpty(r: number, c: number, h: number, w: number): boolean {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) if (!this.isEmpty(y, x)) return false;
    }
    return true;
  }

  forEach(fn: (cell: Cell, r: number, c: number) => void): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r * COLS + c];
        if (cell) fn(cell, r, c);
      }
    }
  }

  positions(
    pred: (cell: Cell, r: number, c: number) => boolean = () => true,
  ): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    this.forEach((cell, r, c) => {
      if (pred(cell, r, c)) out.push([r, c]);
    });
    return out;
  }

  count(pred: (cell: Cell, r: number, c: number) => boolean = () => true): number {
    let n = 0;
    this.forEach((cell, r, c) => {
      if (pred(cell, r, c)) n++;
    });
    return n;
  }

  rowCount(r: number, pred: (cell: Cell) => boolean = () => true): number {
    let n = 0;
    for (let c = 0; c < COLS; c++) {
      const cell = this.get(r, c);
      if (cell && pred(cell)) n++;
    }
    return n;
  }

  isRowEmpty(r: number): boolean {
    return this.rowCount(r) === 0;
  }

  /** First and last rows with any brick, or null for an empty grid. */
  span(): { top: number; bottom: number } | null {
    let top = -1;
    let bottom = -1;
    for (let r = 0; r < this.rows; r++) {
      if (this.isRowEmpty(r)) continue;
      if (top < 0) top = r;
      bottom = r;
    }
    return top < 0 ? null : { top, bottom };
  }

  /** ASCII picture for tests and debugging, one character per cell. */
  toString(): string {
    const glyph: Record<BrickKind, string> = {
      normal: '#',
      steel: 'S',
      explosive: 'X',
      armored: 'A',
      regen: 'R',
      fuse: 'F',
      phantom: 'H',
      switch: 'W',
      gate: 'G',
      portal: 'P',
      virus: 'V',
    };
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let line = '';
      for (let c = 0; c < COLS; c++) {
        const cell = this.get(r, c);
        if (!cell) line += '.';
        else if (cell.moveX) line += 'M';
        else if (cell.powerup) line += cell.powerup === 'coin' ? 'o' : 'p';
        else line += glyph[cell.kind];
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
}

export const isBreakableCell = (cell: Cell): boolean => isBreakableKind(cell.kind);
export const isNormalStatic = (cell: Cell): boolean =>
  cell.kind === 'normal' && !cell.moveX && !cell.powerup;

/** Brick colors by name (texture `brick_<name>`), in the campaign builder's palettes. */
export const PALETTES = {
  rainbow: ['red', 'orange', 'yellow', 'green', 'blue', 'purple2', 'pink', 'teal'],
  ocean: ['blue', 'blue2', 'teal', 'teal2', 'green', 'green2'],
  sunset: ['red', 'red2', 'orange', 'orange2', 'yellow', 'yellow2'],
  candy: ['pink', 'purple2', 'yellow', 'white', 'orange', 'blue'],
  forest: ['green', 'green2', 'teal', 'yellow', 'blue', 'blue2'],
  gold: ['yellow', 'yellow2', 'orange', 'orange2', 'white', 'red'],
  neon: ['teal', 'pink', 'yellow', 'red', 'purple2', 'blue'],
  ice: ['white', 'blue', 'teal', 'blue2', 'white2', 'purple2'],
  rose: ['pink', 'red', 'red2', 'purple2', 'yellow', 'orange'],
  purple: ['purple2', 'pink', 'blue', 'white', 'teal'],
} as const satisfies Record<string, readonly string[]>;
export type PaletteId = keyof typeof PALETTES;
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

export const COLOR_MODES = ['row', 'col', 'diag', 'pillar', 'checker'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export interface BrickStyle {
  palette: PaletteId;
  colorMode: ColorMode;
  /** Seconds before a regen cluster grows back. */
  regenDelay: number;
}

/** Texture for a normal brick at a cell, so stripes and checkers line up across a board. */
export function colorTexture(style: BrickStyle, r: number, c: number): string {
  const palette = PALETTES[style.palette];
  let i: number;
  switch (style.colorMode) {
    case 'col':
      i = Math.min(c, mirrorCol(c));
      break;
    case 'diag':
      i = r + c;
      break;
    case 'pillar':
      i = Math.floor(c / 4);
      break;
    case 'checker':
      i = Math.floor(r / 2) + Math.floor(c / 2);
      break;
    default:
      i = r;
  }
  return `brick_${palette[i % palette.length]}`;
}

/**
 * Converts cells into bricks. `rowOffset` shifts the rows (Descent places chunks above the field),
 * and ids count up from `idBase` so they stay unique across a run.
 */
export function toBricks(
  g: Grid,
  style: BrickStyle,
  opts: { idBase: number; rowOffset?: number },
): BrickSpec[] {
  const out: BrickSpec[] = [];
  const rowOffset = opts.rowOffset ?? 0;
  let id = opts.idBase;
  g.forEach((cell, r, c) => {
    const core = cell.kind === 'virus' && !!cell.props?.source;
    let armor = 0;
    if (cell.kind === 'armored') armor = Math.max(1, cell.armor ?? DEFAULT_ARMOR);
    else if (cell.kind === 'virus' && !core) armor = VIRUS_ARMOR;
    const brick: BrickSpec = {
      id: id++,
      x: c * BW,
      y: (r + rowOffset) * BH,
      width: BW,
      height: cell.kind === 'portal' ? BH * PORTAL_ROWS : BH,
      texture: cell.kind === 'normal' ? colorTexture(style, r, c) : cellTexture(cell),
      kind: cell.kind,
      health: core ? VIRUS_CORE_HEALTH : BRICK_HEALTH,
      armor,
      moveX: cell.moveX ?? 0,
      moveSpeed: cell.moveSpeed ?? 60,
      regenDelay: style.regenDelay,
    };
    if (cell.powerup) brick.powerup = cell.powerup;
    if (cell.props) brick.props = { ...cell.props };
    out.push(brick);
  });
  return out;
}

/** Art for a mechanic cell, matching the campaign tileset's. */
function cellTexture(cell: Cell): string {
  switch (cell.kind) {
    case 'switch':
    case 'gate':
      return `brick_${cell.kind}${cell.props?.channel ?? 1}`;
    case 'portal':
      return `brick_portal${cell.props?.link ?? 1}`;
    case 'virus':
      return cell.props?.source ? 'brick_virus_core' : 'brick_virus';
    default:
      return `brick_${cell.kind}`;
  }
}
