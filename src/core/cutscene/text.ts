/**
 * Dialog lines with markup, typed out over time. The markup is small on purpose:
 *
 *   {p:300}                 a pause of 300 ms before the next letter
 *   {shake}...{/shake}      letters that tremble
 *   {wave}...{/wave}        letters that bob in a wave
 *   {color=accent}...{/color}  a palette name (accent, accent2, gold, danger, good) or #rrggbb
 *   {speed=0.5}...{/speed}  types at half the line's speed
 *
 * Punctuation pauses by itself, so a line reads the way it would be spoken.
 */

export type TextFx = 'shake' | 'wave';

export interface Glyph {
  ch: string;
  /** When the letter appears, in ms from the start of the line. */
  at: number;
  fx: TextFx | null;
  color: string | null;
}

export interface ParsedLine {
  /** The plain text, one character per glyph. */
  text: string;
  glyphs: Glyph[];
  /** When the last letter appears. */
  revealMs: number;
  words: number;
  /** Tags that were not understood, for scriptProblems. */
  unknown: string[];
}

/** Letters per second at speed 1. */
export const DEFAULT_CPS = 42;

/** Extra wait after punctuation, in ms, unless it ends the line. */
const PUNCT_PAUSE: Record<string, number> = {
  ',': 130,
  ';': 180,
  ':': 180,
  '.': 300,
  '!': 300,
  '?': 300,
  '…': 380,
  '—': 200,
};

const TAG = /\{(\/?)([a-z]+)(?:[:=]([^}]*))?\}/gy;

export function parseLine(src: string, cps = DEFAULT_CPS): ParsedLine {
  const glyphs: Glyph[] = [];
  const unknown: string[] = [];
  const fx: TextFx[] = [];
  const colors: string[] = [];
  const speeds: number[] = [];
  let clock = 0;
  let text = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '{') {
      TAG.lastIndex = i;
      const m = TAG.exec(src);
      if (m) {
        i = TAG.lastIndex;
        const [, close, name, arg] = m;
        if (name === 'p' && !close) clock += Math.max(0, Number(arg) || 0);
        else if (name === 'shake' || name === 'wave') {
          if (close) fx.pop();
          else fx.push(name);
        } else if (name === 'color') {
          if (close) colors.pop();
          else colors.push(arg ?? 'accent');
        } else if (name === 'speed') {
          if (close) speeds.pop();
          else speeds.push(Math.max(0.05, Number(arg) || 1));
        } else unknown.push(m[0]);
        continue;
      }
    }
    const ch = src[i]!;
    i++;
    const speed = speeds[speeds.length - 1] ?? 1;
    glyphs.push({
      ch,
      at: clock,
      fx: fx[fx.length - 1] ?? null,
      color: colors[colors.length - 1] ?? null,
    });
    text += ch;
    // Spaces cost half a letter, so words come out in clumps the way speech does.
    clock += (ch === ' ' ? 500 : 1000) / (cps * speed);
    const pause = PUNCT_PAUSE[ch];
    // Pauses inside "..." or "?!" wait for the last mark of the run.
    if (pause && !PUNCT_PAUSE[src[i] ?? '']) clock += pause;
  }
  // The line is fully shown as soon as its last letter is; trailing pauses don't count.
  const last = glyphs[glyphs.length - 1];
  const revealMs = last ? last.at : 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return { text, glyphs, revealMs, words, unknown };
}

/** How many glyphs are showing `ms` into the line. */
export function revealAt(line: ParsedLine, ms: number): number {
  const g = line.glyphs;
  if (ms < 0) return 0;
  if (ms >= line.revealMs) return g.length;
  let lo = 0;
  let hi = g.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g[mid]!.at <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How long a fully shown line stays up before it moves on by itself, in ms. */
export function lingerMs(line: ParsedLine): number {
  return Math.min(4200, Math.max(1400, 900 + line.words * 160));
}

/**
 * Wraps text to `maxWidth` by turning spaces into newlines, so every character keeps its index
 * and a line being typed out never reflows. `advance` measures one character.
 */
export function wrapText(text: string, maxWidth: number, advance: (ch: string) => number): string {
  const out = text.split('');
  let lineW = 0;
  let lastSpace = -1;
  let widthAtSpace = 0;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i]!;
    if (ch === '\n') {
      lineW = 0;
      lastSpace = -1;
      continue;
    }
    const w = advance(ch);
    if (ch === ' ') {
      lastSpace = i;
      widthAtSpace = lineW;
    }
    lineW += w;
    if (lineW > maxWidth && lastSpace >= 0 && ch !== ' ') {
      out[lastSpace] = '\n';
      lineW -= widthAtSpace + advance(' ');
      lastSpace = -1;
    }
  }
  return out.join('');
}
