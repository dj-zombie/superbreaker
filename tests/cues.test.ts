import { describe, expect, it } from 'vitest';
import { CueSheet } from '../src/core/Cues';

interface Note {
  at: number;
  name: string;
}

const note = (at: number, name: string): Note => ({ at, name });
const names = (cues: Note[]) => cues.map((c) => c.name);

/** Written out of order on purpose: a sheet sorts what it is given. */
const NOTES = [note(900, 'c'), note(100, 'a'), note(500, 'b')];
const LENGTH_MS = 1000;

describe('CueSheet', () => {
  it('returns cues in `at` order whatever order they were given in', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    const seen: string[] = [];
    for (let t = 0; t < LENGTH_MS; t += 50) seen.push(...names(sheet.tick(50)));
    expect(seen).toEqual(['a', 'b', 'c']);
    // The caller's list is left as it was.
    expect(names(NOTES)).toEqual(['c', 'a', 'b']);
  });

  it('returns a cue on the tick that reaches its time and not before', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    expect(names(sheet.tick(99))).toEqual([]);
    expect(names(sheet.tick(1))).toEqual(['a']);
    expect(names(sheet.tick(399))).toEqual([]);
    expect(names(sheet.tick(1))).toEqual(['b']);
  });

  it('returns each cue exactly once', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    const seen: string[] = [];
    for (let t = 0; t < 3 * LENGTH_MS; t += 7) seen.push(...names(sheet.tick(7)));
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('returns every cue passed by one large dt, in order', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    expect(names(sheet.tick(600))).toEqual(['a', 'b']);
    expect(sheet.done).toBe(false);
    expect(names(sheet.tick(50_000))).toEqual(['c']);
    expect(sheet.done).toBe(true);
  });

  it('keeps cues written for the same moment in the order they were written', () => {
    const sheet = new CueSheet([note(200, 'x'), note(100, 'w'), note(200, 'y')], LENGTH_MS);
    expect(names(sheet.tick(200))).toEqual(['w', 'x', 'y']);
  });

  it('brings a cue at 0 due on the first tick, even a tick of 0', () => {
    const sheet = new CueSheet([note(0, 'start'), note(1, 'next')], LENGTH_MS);
    expect(names(sheet.tick(0))).toEqual(['start']);
    expect(names(sheet.tick(0))).toEqual([]);
    expect(sheet.done).toBe(false);
  });

  it('brings a cue at exactly lengthMs due', () => {
    const sheet = new CueSheet([note(LENGTH_MS, 'end')], LENGTH_MS);
    expect(names(sheet.tick(LENGTH_MS - 1))).toEqual([]);
    expect(sheet.done).toBe(false);
    expect(names(sheet.tick(1))).toEqual(['end']);
    expect(sheet.done).toBe(true);
  });

  it('is done once lengthMs has passed, and returns nothing after that', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    sheet.tick(LENGTH_MS - 1);
    expect(sheet.done).toBe(false);
    sheet.tick(1);
    expect(sheet.done).toBe(true);
    expect(sheet.tick(500)).toEqual([]);
  });

  it('never returns a cue written past the end', () => {
    const sheet = new CueSheet([note(LENGTH_MS + 1, 'late')], LENGTH_MS);
    expect(sheet.tick(10 * LENGTH_MS)).toEqual([]);
    expect(sheet.done).toBe(true);
  });

  it('drops the cues not yet due on skip and is done', () => {
    const sheet = new CueSheet(NOTES, LENGTH_MS);
    expect(names(sheet.tick(100))).toEqual(['a']);
    sheet.skip();
    expect(sheet.done).toBe(true);
    expect(sheet.tick(LENGTH_MS)).toEqual([]);
    expect(sheet.tick(0)).toEqual([]);
  });

  it('is done after its first tick when it is empty and has no length', () => {
    const sheet = new CueSheet<Note>([], 0);
    expect(sheet.done).toBe(false);
    expect(sheet.tick(0)).toEqual([]);
    expect(sheet.done).toBe(true);
  });
});
