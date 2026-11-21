import { describe, expect, it } from 'vitest';
import {
  GRADES,
  NEUTRAL,
  Playhead,
  actor,
  ambient,
  ambientOff,
  camera,
  card,
  compile,
  cutscene,
  descend,
  grade,
  gradeMatrix,
  hold,
  isNeutralColor,
  label,
  letterbox,
  lerpGrade,
  lingerMs,
  parseLine,
  revealAt,
  sampleFrame,
  sampleTrack,
  say,
  scriptProblems,
  sfx,
  together,
  wait,
  wrapText,
  type Step,
} from '../src/core/cutscene';

const scene = (script: Step[], extra: Partial<Parameters<typeof cutscene>[1]> = {}) =>
  cutscene(
    'test',
    {
      opens: { scenery: 'hell' },
      closes: { scenery: 'crypt', handoff: 'continuous' },
      cast: { warden: { name: 'The Warden' }, vesper: { name: 'Vesper' } },
      ...extra,
    },
    script,
  );

describe('text', () => {
  it('parses markup into plain glyphs with effects and colors', () => {
    const l = parseLine('A {shake}big{/shake} {color=gold}deal{/color}');
    expect(l.text).toBe('A big deal');
    expect(l.glyphs[2]!.fx).toBe('shake');
    expect(l.glyphs[5]!.fx).toBeNull();
    expect(l.glyphs[6]!.color).toBe('gold');
    expect(l.unknown).toEqual([]);
  });

  it('pauses on {p} tags and on punctuation, but not at the end', () => {
    const plain = parseLine('ab', 10);
    expect(plain.glyphs[1]!.at).toBe(100);
    const paused = parseLine('a{p:400}b', 10);
    expect(paused.glyphs[1]!.at).toBe(500);
    const comma = parseLine('a,b', 10);
    expect(comma.glyphs[2]!.at).toBe(200 + 130);
    expect(parseLine('ab.', 10).revealMs).toBe(200);
  });

  it('pauses once at the end of a run of marks', () => {
    const l = parseLine('a?!b', 10);
    expect(l.glyphs[3]!.at).toBe(300 + 300);
  });

  it('slows down inside {speed}', () => {
    const l = parseLine('a{speed=0.5}bc{/speed}d', 10);
    expect(l.glyphs[2]!.at - l.glyphs[1]!.at).toBe(200);
    expect(l.glyphs[3]!.at - l.glyphs[2]!.at).toBe(200);
  });

  it('reports tags it does not know', () => {
    expect(parseLine('hi {bold}there').unknown).toEqual(['{bold}']);
  });

  it('reveals glyphs over time', () => {
    const l = parseLine('abcd', 10);
    expect(revealAt(l, -1)).toBe(0);
    expect(revealAt(l, 0)).toBe(1);
    expect(revealAt(l, 150)).toBe(2);
    expect(revealAt(l, 10_000)).toBe(4);
  });

  it('lingers longer on longer lines, within bounds', () => {
    expect(lingerMs(parseLine('Hi.'))).toBe(1400);
    expect(lingerMs(parseLine('word '.repeat(100)))).toBe(4200);
  });

  it('wraps without moving any character', () => {
    const text = 'the quick brown fox jumps';
    const wrapped = wrapText(text, 10, () => 1);
    expect(wrapped.length).toBe(text.length);
    expect(wrapped.split('\n').every((l) => l.length <= 10)).toBe(true);
    expect(wrapped.replace(/\n/g, ' ')).toBe(text);
  });
});

describe('grades', () => {
  it('leaves the picture alone when neutral', () => {
    expect(gradeMatrix(NEUTRAL)).toEqual([
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
    expect(isNeutralColor(NEUTRAL)).toBe(true);
    expect(isNeutralColor(GRADES.ember)).toBe(false);
  });

  it('turns black and white into equal rows', () => {
    const m = gradeMatrix(GRADES.bw);
    for (let c = 0; c < 3; c++) {
      expect(m[c]).toBeCloseTo(m[5 + c]!, 5);
      expect(m[c]).toBeCloseTo(m[10 + c]!, 5);
    }
  });

  it('blends by plain interpolation, colors per channel', () => {
    const half = lerpGrade(NEUTRAL, GRADES.noir, 0.5);
    expect(half.saturation).toBeCloseTo(-0.5);
    const tint = lerpGrade(
      { ...NEUTRAL, tint: 0x000000 },
      { ...NEUTRAL, tint: 0xffffff },
      0.5,
    ).tint;
    expect((tint >> 16) & 0xff).toBe(128);
  });

  it('keeps contrast about mid gray', () => {
    const m = gradeMatrix({ ...NEUTRAL, contrast: 0.5 });
    // 128 in, 128 out.
    expect(m[0]! * 128 + m[4]!).toBeCloseTo(128, 3);
  });
});

describe('compile', () => {
  it('lets moves run on while beats take their time', () => {
    const tl = compile(
      scene([
        letterbox(1, 600),
        grade('ember', 800),
        wait(500),
        card('Chapter II', 'The Crypt', 2000),
      ]),
    );
    expect(tl.cards[0]!.at).toBe(500);
    expect(tl.lengthMs).toBe(2500);
  });

  it('waits for a move given wait: true', () => {
    const tl = compile(
      scene([letterbox(1, 600), { do: 'letterbox', to: 0, ms: 400, wait: true }, sfx('x')]),
    );
    expect(tl.cues[0]!.at).toBe(400);
    // The scene lasts until its last move is done, waited for or not.
    expect(tl.lengthMs).toBe(600);
  });

  it('runs a together block for as long as its longest beat', () => {
    const tl = compile(scene([together(wait(300), wait(900)), sfx('x')]));
    expect(tl.cues[0]!.at).toBe(900);
  });

  it('moves every key on its own, so a zoom mid-pan leaves the pan running', () => {
    const tl = compile(
      scene([
        camera({ x: 1 }, { ms: 1000, ease: 'linear' }),
        wait(500),
        camera({ zoom: 2 }, { ms: 500, ease: 'linear' }),
        wait(500),
      ]),
    );
    const mid = sampleTrack(tl.camera, 750);
    expect(mid.x).toBeCloseTo(0.5 + 0.5 * 0.75);
    expect(mid.zoom).toBeCloseTo(1.5);
  });

  it('starts a later move from wherever the earlier one had reached', () => {
    const tl = compile(
      scene([
        camera({ x: 1 }, { ms: 1000, ease: 'linear' }),
        wait(500),
        camera({ x: 0 }, { ms: 500, ease: 'linear' }),
        wait(500),
      ]),
    );
    expect(sampleTrack(tl.camera, 500).x).toBeCloseTo(0.75);
    expect(sampleTrack(tl.camera, 750).x).toBeCloseTo(0.375);
    expect(sampleTrack(tl.camera, 1000).x).toBeCloseTo(0);
  });

  it('cuts camera moves to their end under reduced motion', () => {
    const tl = compile(scene([camera('pushIn', { amount: 0.5, ms: 2000 }), wait(2000)]));
    expect(sampleFrame(tl, 100).camera.zoom).toBeLessThan(1.1);
    expect(sampleFrame(tl, 100, { calm: true }).camera.zoom).toBeCloseTo(1.5);
  });

  it('points a push at an actor where the actor will be', () => {
    const tl = compile(
      scene([
        actor('warden', { at: [0.2, 0.3], enter: 'cut' }),
        camera('pushIn', { subject: 'warden', ms: 1000 }),
        wait(1000),
      ]),
    );
    const end = sampleTrack(tl.camera, 1000);
    expect(end.x).toBeCloseTo(0.2);
    expect(end.y).toBeCloseTo(0.3);
  });

  it('follows an actor while it moves', () => {
    const tl = compile(
      scene([
        actor('vesper', { at: [0, 0.5], enter: 'cut' }),
        actor('vesper', { to: [1, 0.5], ms: 4000, ease: 'linear' }),
        camera('follow', { subject: 'vesper', ms: 4000 }),
        wait(4000),
      ]),
    );
    expect(sampleTrack(tl.camera, 3000).x).toBeCloseTo(0.75, 1);
  });

  it('brings an actor in from its entrance and takes it out on exit', () => {
    const tl = compile(
      scene([
        actor('warden', { at: [0.5, 0.4], enter: 'left', ms: 1000 }),
        wait(1000),
        actor('warden', { exit: 'fade', ms: 500 }),
        wait(500),
      ]),
    );
    const f = (t: number) => sampleFrame(tl, t).actors.find((a) => a.id === 'warden')!;
    expect(f(0).x).toBeCloseTo(-0.3);
    expect(f(1000).x).toBeCloseTo(0.5);
    expect(f(1000).alpha).toBeCloseTo(1);
    expect(f(1500).alpha).toBeCloseTo(0);
  });

  it('turns a voiced line into a hold that waits for the clip', () => {
    const tl = compile(
      scene([say('warden', 'Hello there.', { voice: 'vo1' })], {
        assets: { voice: [{ key: 'vo1', path: 'x' }] },
      }),
    );
    expect(tl.holds[0]!.kind).toBe('voice');
    expect(tl.cues.some((c) => c.kind === 'voice')).toBe(true);
  });

  it('keeps one box open across a run of lines and closes it after the last', () => {
    const tl = compile(
      scene([
        say('warden', 'One.', { hold: 200 }),
        say('warden', 'Two.', { hold: 200 }),
        wait(1000),
      ]),
    );
    const [a, b] = tl.lines;
    expect(a!.runStart).toBe(b!.runStart);
    expect(a!.end).toBe(b!.at);
    const between = sampleFrame(tl, b!.at - 1).dialog!;
    expect(between.alpha).toBe(1);
    const after = sampleFrame(tl, b!.doneAt + 2000).dialog;
    expect(after).toBeNull();
  });

  it('keeps the line up while the clock waits at its hold', () => {
    const tl = compile(scene([say('warden', 'Tap me.', { hold: 'tap' }), wait(500)]));
    const h = tl.holds[0]!;
    const d = sampleFrame(tl, h.at).dialog!;
    expect(d.complete).toBe(true);
    expect(d.alpha).toBe(1);
  });

  it('descends: the scroll races, the world changes mid-fall, and it lands', () => {
    const tl = compile(
      scene([descend('crypt', { ms: 4000, through: 'ambient.cloudbank', peak: 3, land: 1 })]),
    );
    expect(sampleFrame(tl, 1900).scenery).toBeNull();
    expect(sampleFrame(tl, 2100).scenery?.id).toBe('crypt');
    expect(sampleTrack(tl.backdrop, 2000).pace).toBeCloseTo(3);
    expect(sampleTrack(tl.backdrop, 4000).pace).toBeCloseTo(1);
    expect(sampleFrame(tl, 2000).ambient[0]!.ambient.fx).toBe('ambient.cloudbank');
    expect(sampleFrame(tl, 4000).ambient).toEqual([]);
  });

  it('fades ambient fields in and out', () => {
    const tl = compile(
      scene([
        ambient('ambient.mist', { ms: 1000 }),
        wait(2000),
        ambientOff('ambient.mist', 1000),
        wait(1000),
      ]),
    );
    expect(sampleFrame(tl, 500).ambient[0]!.intensity).toBeCloseTo(0.5);
    expect(sampleFrame(tl, 1500).ambient[0]!.intensity).toBe(1);
    expect(sampleFrame(tl, 2500).ambient[0]!.intensity).toBeCloseTo(0.5);
    expect(sampleFrame(tl, 3000).ambient).toEqual([]);
  });

  it('records labels for seeking', () => {
    const tl = compile(scene([wait(300), label('fall'), wait(100)]));
    expect(tl.labels.get('fall')).toBe(300);
  });
});

describe('Playhead', () => {
  const tl = compile(scene([sfx('a'), wait(500), sfx('b'), hold(), sfx('c'), wait(500), sfx('d')]));

  it('fires each cue once, in order, and stops at holds', () => {
    const p = new Playhead(tl);
    expect(p.tick(0).map((c) => c.kind === 'sfx' && c.step.key)).toEqual(['a']);
    // The hold and the cues at its moment come due together; the clock then waits.
    const at = p.tick(10_000).map((c) => c.kind === 'sfx' && c.step.key);
    expect(at).toEqual(['b', 'c']);
    expect(p.held).not.toBeNull();
    expect(p.time).toBe(500);
    expect(p.tick(1000)).toEqual([]);
    expect(p.time).toBe(500);
    p.release();
    expect(p.tick(10_000).map((c) => c.kind === 'sfx' && c.step.key)).toEqual(['d']);
    expect(p.done).toBe(true);
  });

  it('seeks without firing what it jumps over', () => {
    const p = new Playhead(tl);
    p.seek(700);
    expect(p.held).toBeNull();
    expect(p.tick(10_000).map((c) => c.kind === 'sfx' && c.step.key)).toEqual(['d']);
  });

  it('skips to the end and fires nothing more', () => {
    const p = new Playhead(tl);
    p.skip();
    expect(p.done).toBe(true);
    expect(p.time).toBe(tl.lengthMs);
    expect(p.tick(100)).toEqual([]);
  });

  it('hurries forward with advanceTo, still stopping at a hold', () => {
    const p = new Playhead(tl);
    p.tick(0);
    p.advanceTo(10_000);
    expect(p.held).not.toBeNull();
  });
});

describe('scriptProblems', () => {
  it('passes a clean script', () => {
    expect(scriptProblems(scene([say('warden', 'Hi.'), wait(100)]))).toEqual([]);
  });

  it('names what is wrong', () => {
    const problems = scriptProblems(
      scene([
        say('nobody', 'Who?'),
        grade('sparkly' as never),
        actor('warden', { enter: 'fade' }),
        ambientOff('ambient.mist'),
        say('warden', 'Hm {bold}'),
        descend('hell', { ms: 1000 }),
        sfx('missing'),
      ]),
      { sfx: () => false },
    );
    expect(problems.some((p) => p.includes('"nobody"'))).toBe(true);
    expect(problems.some((p) => p.includes('"sparkly"'))).toBe(true);
    expect(problems.some((p) => p.includes('needs `at`'))).toBe(true);
    expect(problems.some((p) => p.includes('not on'))).toBe(true);
    expect(problems.some((p) => p.includes('{bold}'))).toBe(true);
    expect(problems.some((p) => p.includes('starts in'))).toBe(true);
    expect(problems.some((p) => p.includes('no sound "missing"'))).toBe(true);
  });
});
