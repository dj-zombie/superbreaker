import { ease, lerp, lerpColor, type Ease } from './ease';
import { GRADE_COLOR_KEYS, GRADES, NEUTRAL, isGradeId, type Grade } from './grades';
import { lingerMs, parseLine, revealAt } from './text';
import type {
  ActorFrame,
  ActorId,
  ActorPose,
  ActorStep,
  ActorTrack,
  AmbientFrame,
  BackdropPose,
  CameraPose,
  CameraStep,
  CompiledAmbient,
  CompiledLine,
  Cue,
  CutsceneDef,
  CutsceneFrame,
  Entrance,
  HoldPoint,
  Mark,
  Segment,
  Step,
  Timeline,
  Track,
  Vec,
} from './types';

/** A box fades in and out over this long, in ms. */
export const BOX_IN_MS = 180;
export const BOX_OUT_MS = 240;
/** Lines this close together, in the same style, share one box. */
const RUN_GAP_MS = 300;
/** A card fades in and out over this long, in ms. */
export const CARD_FADE_MS = 650;
/** A follow move catches up with its actor over this long, then keeps on it. */
const FOLLOW_CATCH_MS = 700;

const CAMERA_START: CameraPose = { x: 0.5, y: 0.5, zoom: 1, angle: 0, sway: 0, drift: 0, blur: 0 };
const ACTOR_START: ActorPose = { x: 0.5, y: 0.6, alpha: 0, scale: 1, angle: 0 };

type Num = Record<string, number>;

function track<V extends object>(initial: V, colorKeys: Array<keyof V> = []): Track<V> {
  return { initial: { ...initial }, segs: [], colorKeys: new Set(colorKeys) };
}

export interface CompileEnv {
  /** The backdrop's scroll speed when the scene starts (the screen it took over). */
  pace?: number;
  /** Reduced motion: lines show whole at once. */
  calm?: boolean;
}

/** Turns a script into tracks, marks, lines, cues and holds, all on absolute script time. */
export function compile(def: CutsceneDef, env: CompileEnv = {}): Timeline {
  return new Compiler(def, env).build();
}

class Compiler {
  private readonly tl: Timeline;
  private readonly openAmbient = new Map<string, CompiledAmbient>();
  private readonly lastPos = new Map<ActorId, [number, number]>();
  private readonly subjects: Array<{ seg: Segment<CameraPose>; id: ActorId; t: number }> = [];
  private readonly clears: number[] = [];
  private end = 0;

  constructor(
    private readonly def: CutsceneDef,
    private readonly env: CompileEnv,
  ) {
    const grade = def.opens.grade ? GRADES[def.opens.grade] : NEUTRAL;
    this.tl = {
      def,
      lengthMs: 0,
      letterbox: track({ v: 0 }),
      fade: track({ v: 0, color: 0x000000 }, ['color']),
      grade: track<Grade>({ ...grade }, [...GRADE_COLOR_KEYS]),
      camera: track(CAMERA_START),
      follows: new Map(),
      backdrop: track<BackdropPose>(
        { pace: def.opens.pace ?? env.pace ?? 1, sway: 0, glow: 0, tint: 0xffffff, fall: 0 },
        ['tint'],
      ),
      scenery: [],
      music: [],
      actors: new Map(),
      lines: [],
      cards: [],
      plates: [],
      ambient: [],
      cues: [],
      holds: [],
      labels: new Map(),
    };
  }

  build(): Timeline {
    const tl = this.tl;
    const used = this.seq(this.def.script, 0);
    this.reach(used);
    this.finishLines();
    for (const a of tl.actors.values()) settle(a.pose);
    for (const s of this.subjects) {
      const pose = poseAt(tl.actors.get(s.id)?.pose, s.t);
      if ('x' in s.seg.to) s.seg.to.x = pose.x;
      if ('y' in s.seg.to) s.seg.to.y = pose.y;
    }
    settle(tl.letterbox);
    settle(tl.fade);
    settle(tl.grade);
    settle(tl.backdrop);
    settle(tl.camera, (seg, k, t) => this.follow(seg, k, t));
    const byAt = <T extends { at: number }>(a: T, b: T) => a.at - b.at;
    tl.scenery.sort(byAt);
    tl.music.sort(byAt);
    for (const a of tl.actors.values()) {
      a.anims.sort(byAt);
      a.faces.sort(byAt);
    }
    tl.cards.sort(byAt);
    tl.plates.sort(byAt);
    tl.cues.sort(byAt);
    tl.holds.sort(byAt);
    tl.lengthMs = this.end;
    return tl;
  }

  /** The camera's x or y while a follow move runs: on the actor, caught up with over a moment. */
  private follow(seg: Segment<CameraPose>, k: string, t: number): number | undefined {
    const id = this.tl.follows.get(seg);
    if (!id || (k !== 'x' && k !== 'y')) return undefined;
    const pose = poseAt(this.tl.actors.get(id)?.pose, Math.min(t, seg.at + seg.ms));
    const p = ease('out', (t - seg.at) / Math.min(FOLLOW_CATCH_MS, Math.max(1, seg.ms)));
    const from = (seg.from as unknown as Num)[k] ?? 0.5;
    return lerp(from, k === 'x' ? pose.x : pose.y, p);
  }

  private reach(t: number): void {
    if (t > this.end) this.end = t;
  }

  private seq(steps: readonly Step[], t: number): number {
    let at = t;
    for (const s of steps) at += this.step(s, at);
    return at - t;
  }

  /** Compiles one step starting at `t` and returns how long it holds its sequence. */
  private step(s: Step, t: number): number {
    const tl = this.tl;
    switch (s.do) {
      case 'seq':
        return this.seq(s.steps, t);
      case 'together': {
        let longest = 0;
        for (const c of s.steps) longest = Math.max(longest, this.step(c, t));
        return longest;
      }
      case 'wait':
        this.reach(t + s.ms);
        return Math.max(0, s.ms);
      case 'hold':
        tl.holds.push({ at: t, kind: 'tap', fallbackMs: Infinity });
        this.reach(t);
        return 0;
      case 'label':
        tl.labels.set(s.name, t);
        tl.cues.push({ at: t, kind: 'label', name: s.name });
        return 0;
      case 'say':
        return this.say(s, t);
      case 'card':
        tl.cards.push({ at: t, ms: s.ms, kicker: s.kicker, title: s.title, world: s.world });
        this.reach(t + s.ms);
        return s.ms;
      case 'clear':
        this.clears.push(t);
        return 0;
      case 'camera':
        return this.camera(s, t);
      case 'shake':
        tl.cues.push({ at: t, kind: 'shake', step: s });
        return 0;
      case 'flash':
        tl.cues.push({ at: t, kind: 'flash', step: s });
        return 0;
      case 'grade': {
        const to = typeof s.to === 'string' ? (isGradeId(s.to) ? GRADES[s.to] : NEUTRAL) : s.to;
        return this.move(tl.grade, t, s.ms ?? 1200, s.ease ?? 'sine', { ...to }, s.wait);
      }
      case 'fade': {
        if (s.color !== undefined) this.move(tl.fade, t, 0, 'linear', { color: s.color });
        return this.move(tl.fade, t, s.ms ?? 600, s.ease ?? 'sine', { v: s.to }, s.wait);
      }
      case 'letterbox':
        return this.move(tl.letterbox, t, s.ms ?? 700, s.ease ?? 'inOut', { v: s.to }, s.wait);
      case 'transition':
        tl.cues.push({ at: t, kind: 'transition', step: s });
        this.reach(t + (s.ms ?? 0));
        return 0;
      case 'backdrop': {
        const to: Partial<BackdropPose> = {};
        if (s.pace !== undefined) to.pace = s.pace;
        if (s.sway !== undefined) to.sway = s.sway;
        if (s.glow !== undefined) to.glow = s.glow;
        if (s.tint !== undefined) to.tint = s.tint;
        if (s.fall !== undefined) to.fall = s.fall;
        return this.move(tl.backdrop, t, s.ms ?? 1200, s.ease ?? 'inOut', to, s.wait);
      }
      case 'descend':
        return this.descend(s, t);
      case 'scenery':
        tl.scenery.push({ at: t, value: { id: s.to, pace: s.pace } });
        return 0;
      case 'plate':
        tl.plates.push({
          at: t,
          ms: s.ms,
          image: s.image,
          from: { x: 0.5, y: 0.5, zoom: 1.08, ...s.from },
          to: { x: 0.5, y: 0.5, zoom: 1, ...s.to },
          fadeMs: s.fadeMs ?? 700,
          ease: s.ease ?? 'linear',
          behind: s.behind ?? false,
        });
        this.reach(t + s.ms);
        return 0;
      case 'actor':
        return this.actor(s, t);
      case 'ambient':
        return this.ambient(s, t);
      case 'fx':
        tl.cues.push({ at: t, kind: 'fx', step: s });
        return 0;
      case 'sfx':
        tl.cues.push({ at: t, kind: 'sfx', step: s });
        return 0;
      case 'voice':
        tl.cues.push({ at: t, kind: 'voice', step: s });
        return 0;
      case 'music':
        tl.music.push({ at: t, value: { bed: s.bed, volume: s.volume ?? 0.6, ms: s.ms ?? 1500 } });
        return 0;
      case 'haptic':
        tl.cues.push({ at: t, kind: 'haptic', step: s });
        return 0;
    }
  }

  private move<V extends object>(
    tr: Track<V>,
    t: number,
    ms: number,
    e: Ease,
    to: Partial<V>,
    wait?: boolean,
  ): number {
    const d = Math.max(0, ms);
    const seg: Segment<V> = { at: t, ms: d, ease: e, to, from: { ...tr.initial } };
    tr.segs.push(seg);
    this.reach(t + d);
    return wait ? d : 0;
  }

  private say(s: Extract<Step, { do: 'say' }>, t: number): number {
    const tl = this.tl;
    const line = parseLine(s.text, s.cps);
    const reveal = this.env.calm ? 0 : line.revealMs;
    const linger = lingerMs(line);
    const style = s.box ?? (s.who === 'narrator' ? 'caption' : 'box');
    const hold = s.hold ?? (s.voice ? 'voice' : 'auto');
    // At least as long as the box takes to open, so a short held line never waits half faded in.
    const span = Math.max(
      BOX_IN_MS,
      reveal + (typeof hold === 'number' ? hold : hold === 'auto' ? linger : 0),
    );
    const c: CompiledLine = {
      at: t,
      end: t + span,
      doneAt: t + span,
      who: s.who,
      style,
      line,
      hold,
      voice: s.voice,
      blip: s.blip,
      mood: s.mood,
      side: s.side ?? 'left',
      runStart: t,
      runEnd: t + span,
    };
    tl.lines.push(c);
    if (s.voice)
      tl.cues.push({ at: t, kind: 'voice', step: { do: 'voice', key: s.voice }, line: c });
    if (hold === 'tap' || hold === 'voice') {
      const h: HoldPoint = {
        at: t + span,
        kind: hold,
        line: c,
        fallbackMs: hold === 'tap' ? Infinity : linger,
      };
      tl.holds.push(h);
    }
    this.reach(t + span + BOX_OUT_MS);
    return span;
  }

  /** Lines end where the next one in their box starts, else after their own time and a fade. */
  private finishLines(): void {
    const lines = this.tl.lines.sort((a, b) => a.at - b.at);
    const joinsNext: boolean[] = [];
    let runStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const prev = lines[i - 1];
      const joins =
        !!prev &&
        prev.style === l.style &&
        l.at - prev.doneAt <= RUN_GAP_MS &&
        !this.clearedBetween(prev, l);
      if (i > 0) joinsNext[i - 1] = joins;
      if (!joins) runStart = l.at;
      l.runStart = runStart;
    }
    // Walk back so each line knows where its run ends.
    let runEnd = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]!;
      const next = lines[i + 1];
      if (!next || !joinsNext[i]) {
        const cleared = this.clears.find((c) => c >= l.at && c < l.doneAt + BOX_OUT_MS);
        runEnd = cleared !== undefined ? Math.max(l.at, cleared) : l.doneAt;
        l.end = runEnd + BOX_OUT_MS;
      } else l.end = next.at;
      l.runEnd = runEnd;
    }
  }

  private clearedBetween(a: CompiledLine, b: CompiledLine): boolean {
    return this.clears.some((c) => c >= a.at && c <= b.at);
  }

  private camera(s: CameraStep, t: number): number {
    const tl = this.tl;
    const cam = tl.camera;
    if (typeof s.shot !== 'string') {
      if (s.from) this.move(cam, t, 0, 'linear', { ...s.from });
      return this.move(cam, t, s.ms ?? 1200, s.ease ?? 'sine', { ...s.shot }, s.wait);
    }
    const amount = s.amount;
    /** Points a move at the subject: a point now, an actor once the actors' moves are known. */
    const aimAt = (seg: Segment<CameraPose>, at: number) => {
      const subject = s.subject;
      if (subject === undefined) return;
      if (typeof subject === 'string') {
        seg.to.x = 0.5;
        seg.to.y = 0.5;
        this.subjects.push({ seg, id: subject, t: at });
      } else {
        seg.to.x = subject[0];
        seg.to.y = subject[1];
      }
    };
    const go = (ms: number, e: Ease, to: Partial<CameraPose>, aim = false): number => {
      const d = s.ms ?? ms;
      if (s.from) this.move(cam, t, 0, 'linear', { ...s.from });
      const used = this.move(cam, t, d, s.ease ?? e, to, s.wait);
      if (aim) aimAt(cam.segs[cam.segs.length - 1]!, t + d);
      return used;
    };
    switch (s.shot) {
      case 'establish': {
        const d = s.ms ?? 3200;
        this.move(cam, t, 0, 'linear', { zoom: 1 + (amount ?? 0.22) });
        aimAt(cam.segs[cam.segs.length - 1]!, t);
        if (s.from) Object.assign(cam.segs[cam.segs.length - 1]!.to, s.from);
        return this.move(cam, t, d, s.ease ?? 'sine', { zoom: 1, x: 0.5, y: 0.5 }, s.wait);
      }
      case 'pushIn':
        return go(2200, 'sine', { zoom: 1 + (amount ?? 0.25) }, s.subject !== undefined);
      case 'pullBack':
        return go(1800, 'sine', { zoom: 1, x: 0.5, y: 0.5 });
      case 'pan':
        return go(2000, 'inOut', {}, true);
      case 'tilt': {
        const used = go(2000, 'inOut', {}, true);
        delete cam.segs[cam.segs.length - 1]!.to.x;
        return used;
      }
      case 'drift':
        return go(900, 'sine', { drift: amount ?? 0.5 });
      case 'handheld':
        return go(600, 'sine', { sway: amount ?? 0.4 });
      case 'still':
        return go(600, 'sine', { sway: 0, drift: 0 });
      case 'whip': {
        const d = s.ms ?? 320;
        tl.cues.push({ at: t, kind: 'whip', ms: d });
        return go(d, 'snap', {}, true);
      }
      case 'punch':
        tl.cues.push({ at: t, kind: 'punch', amount: amount ?? 0.08, ms: s.ms ?? 280 });
        return 0;
      case 'dutch':
        return go(900, 'inOut', { angle: amount ?? 6 });
      case 'level':
        return go(900, 'inOut', { angle: 0 });
      case 'follow': {
        const d = s.ms ?? 3000;
        const used = this.move(cam, t, d, 'linear', { x: 0.5, y: 0.5 }, s.wait);
        if (typeof s.subject === 'string')
          tl.follows.set(cam.segs[cam.segs.length - 1]!, s.subject);
        return used;
      }
      case 'rackFocus':
        return go(700, 'sine', { blur: amount ?? 0.6 });
      case 'reset':
        return go(900, 'inOut', { ...CAMERA_START });
    }
  }

  private actorTrack(id: ActorId): ActorTrack {
    let a = this.tl.actors.get(id);
    if (!a) {
      a = { pose: track(ACTOR_START), anims: [], faces: [] };
      this.tl.actors.set(id, a);
    }
    return a;
  }

  private actor(s: ActorStep, t: number): number {
    const a = this.actorTrack(s.id);
    const ms = s.ms ?? 700;
    let used = 0;
    const here = s.at ?? this.lastPos.get(s.id) ?? [ACTOR_START.x, ACTOR_START.y];
    const cut = (to: Partial<ActorPose>) => this.move(a.pose, t, 0, 'linear', to);
    if (s.at) this.lastPos.set(s.id, [s.at[0], s.at[1]]);

    if (s.enter) {
      const [x, y] = here;
      const scale = s.scale ?? 1;
      const off = entranceOffset(s.enter, x, y);
      cut({ x: off.x, y: off.y, alpha: off.alpha, scale: s.enter === 'pop' ? 0 : scale });
      if (s.enter === 'cut') cut({ x, y, alpha: s.alpha ?? 1, scale });
      else {
        const e = s.ease ?? (s.enter === 'fall' ? 'bounce' : s.enter === 'pop' ? 'back' : 'out');
        used = this.move(a.pose, t, ms, e, { x, y, scale }, s.wait);
        this.move(a.pose, t, s.enter === 'fall' ? ms * 0.3 : ms, 'out', { alpha: s.alpha ?? 1 });
      }
    } else if (s.at) cut({ x: s.at[0], y: s.at[1] });

    if (s.path && s.path.length) {
      let from: Vec = here;
      let dist = 0;
      for (const p of s.path) {
        dist += Math.hypot(p[0] - from[0], p[1] - from[1]);
        from = p;
      }
      let at = t;
      from = here;
      for (const p of s.path) {
        const leg =
          dist > 0 ? (ms * Math.hypot(p[0] - from[0], p[1] - from[1])) / dist : ms / s.path.length;
        this.move(a.pose, at, leg, 'linear', { x: p[0], y: p[1] });
        at += leg;
        from = p;
      }
      const last = s.path[s.path.length - 1]!;
      this.lastPos.set(s.id, [last[0], last[1]]);
      if (s.wait) used = Math.max(used, ms);
    }
    if (s.to) {
      used = Math.max(
        used,
        this.move(a.pose, t, ms, s.ease ?? 'inOut', { x: s.to[0], y: s.to[1] }, s.wait),
      );
      this.lastPos.set(s.id, [s.to[0], s.to[1]]);
    }
    const look: Partial<ActorPose> = {};
    if (s.alpha !== undefined && !s.enter) look.alpha = s.alpha;
    if (s.scale !== undefined && !s.enter) look.scale = s.scale;
    if (s.angle !== undefined) look.angle = s.angle;
    if (Object.keys(look).length)
      used = Math.max(used, this.move(a.pose, t, ms, s.ease ?? 'inOut', look, s.wait));

    if (s.exit) {
      const [x, y] = this.lastPos.get(s.id) ?? here;
      const off = entranceOffset(s.exit, x, y);
      const to: Partial<ActorPose> = { alpha: 0 };
      if (s.exit === 'pop') to.scale = 0;
      else if (s.exit !== 'fade' && s.exit !== 'cut') {
        to.x = off.x;
        to.y = off.y;
      }
      used = Math.max(
        used,
        this.move(a.pose, t, s.exit === 'cut' ? 0 : ms, s.ease ?? 'in', to, s.wait),
      );
    }
    if (s.anim !== undefined) a.anims.push({ at: t, value: s.anim });
    if (s.face) a.faces.push({ at: t, value: s.face });
    if (s.emote) this.tl.cues.push({ at: t, kind: 'emote', id: s.id, emote: s.emote });
    return used;
  }

  private ambient(s: Extract<Step, { do: 'ambient' }>, t: number): number {
    const key = s.key ?? s.fx;
    const open = this.openAmbient.get(key);
    const ms = s.ms ?? 1200;
    if (s.on) {
      if (open) {
        open.off = t;
        open.fadeOut = ms;
      }
      const a: CompiledAmbient = {
        key,
        fx: s.fx,
        depth: s.depth ?? 'board',
        intensity: s.intensity ?? 1,
        area: s.area,
        on: t,
        off: Infinity,
        fadeIn: ms,
        fadeOut: ms,
      };
      this.tl.ambient.push(a);
      this.openAmbient.set(key, a);
    } else if (open) {
      open.off = t;
      open.fadeOut = ms;
      this.openAmbient.delete(key);
      this.reach(t + ms);
    }
    return s.wait ? ms : 0;
  }

  private descend(s: Extract<Step, { do: 'descend' }>, t: number): number {
    const tl = this.tl;
    const ms = Math.max(1, s.ms);
    const peak = s.peak ?? 3.4;
    const land = s.land ?? this.def.closes.pace ?? 1;
    this.move(tl.backdrop, t, ms * 0.3, 'in', { pace: peak });
    tl.scenery.push({ at: t + ms * 0.5, value: { id: s.to } });
    this.move(tl.backdrop, t + ms * 0.62, ms * 0.38, 'out', { pace: land });
    if (s.through) {
      const key = `descend:${s.through}`;
      tl.ambient.push({
        key,
        fx: s.through,
        depth: 'front',
        intensity: 1,
        on: t + ms * 0.08,
        off: t + ms * 0.68,
        fadeIn: ms * 0.22,
        fadeOut: ms * 0.25,
      });
    }
    this.reach(t + ms);
    return ms;
  }
}

function entranceOffset(
  kind: Entrance,
  x: number,
  y: number,
): { x: number; y: number; alpha: number } {
  switch (kind) {
    case 'fall':
      return { x, y: y - 0.35, alpha: 0 };
    case 'rise':
      return { x, y: y + 0.06, alpha: 0 };
    case 'left':
      return { x: -0.3, y, alpha: 1 };
    case 'right':
      return { x: 1.3, y, alpha: 1 };
    case 'pop':
    case 'fade':
    case 'cut':
      return { x, y, alpha: 0 };
  }
}

// ---------------------------------------------------------------------------------------------
// Tracks: every key moves on its own, so a zoom that starts mid-pan leaves the pan running.

type Dyn<V> = (seg: Segment<V>, key: string, t: number) => number | undefined;

interface Keyed<V> extends Track<V> {
  byKey: Map<string, Segment<V>[]>;
  dyn?: Dyn<V>;
}

/** Sorts a track's moves and works out where each one starts from. */
function settle<V extends object>(tr: Track<V>, dyn?: Dyn<V>): void {
  const k = tr as Keyed<V>;
  tr.segs.sort((a, b) => a.at - b.at);
  k.byKey = new Map();
  k.dyn = dyn;
  for (const seg of tr.segs) {
    for (const key of Object.keys(seg.to)) {
      let list = k.byKey.get(key);
      if (!list) k.byKey.set(key, (list = []));
      (seg.from as Num)[key] = keyAt(k, key, seg.at, list, list.length, false);
      list.push(seg);
    }
  }
}

function keyAt<V extends object>(
  tr: Keyed<V>,
  key: string,
  t: number,
  list: readonly Segment<V>[],
  count: number,
  snap: boolean,
): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.at <= t) lo = mid + 1;
    else hi = mid;
  }
  const seg = list[lo - 1];
  const start = (tr.initial as Num)[key] ?? 0;
  if (!seg) return start;
  const dyn = tr.dyn?.(seg, key, snap ? seg.at + seg.ms : t);
  if (dyn !== undefined) return dyn;
  const from = (seg.from as Num)[key] ?? start;
  const to = (seg.to as Num)[key] ?? from;
  const p = snap || seg.ms <= 0 ? 1 : ease(seg.ease, (t - seg.at) / seg.ms);
  return tr.colorKeys.has(key as keyof V) ? lerpColor(from, to, p) : lerp(from, to, p);
}

/** A track's value at `t`, written into `out`. `snap` jumps every started move to its end. */
export function sampleTrack<V extends object>(tr: Track<V>, t: number, out?: V, snap = false): V {
  const k = tr as Keyed<V>;
  const o = (out ?? { ...tr.initial }) as Num;
  const init = tr.initial as Num;
  for (const key of Object.keys(init)) {
    const list = k.byKey?.get(key);
    o[key] = list ? keyAt(k, key, t, list, list.length, snap) : init[key]!;
  }
  return o as V;
}

function poseAt(tr: Track<ActorPose> | undefined, t: number): ActorPose {
  return tr ? sampleTrack(tr, t) : { ...ACTOR_START };
}

function markAt<T>(marks: readonly Mark<T>[], t: number): T | undefined {
  let lo = 0;
  let hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid]!.at <= t) lo = mid + 1;
    else hi = mid;
  }
  return marks[lo - 1]?.value;
}

/** Where an actor or point stands at `t`, as board fractions. */
export function pointAt(tl: Timeline, at: Vec | ActorId, t: number): Vec {
  if (typeof at !== 'string') return at;
  const pose = poseAt(tl.actors.get(at)?.pose, t);
  return [pose.x, pose.y];
}

export interface SampleOptions {
  /** Reduced motion: camera moves cut to their end, and no sway, drift or roll. */
  calm?: boolean;
}

/** Everything the scene shows at script time `t`. */
export function sampleFrame(tl: Timeline, t: number, opts: SampleOptions = {}): CutsceneFrame {
  const calm = !!opts.calm;
  const camera = sampleTrack(tl.camera, t, undefined, calm);
  if (calm) {
    camera.sway = 0;
    camera.drift = 0;
    camera.angle = 0;
  }
  const actors: ActorFrame[] = [];
  for (const [id, a] of tl.actors) {
    const pose = sampleTrack(a.pose, t);
    actors.push({
      id,
      ...pose,
      anim: markAt(a.anims, t) ?? null,
      face: markAt(a.faces, t) ?? 'right',
    });
  }
  return {
    t,
    letterbox: sampleTrack(tl.letterbox, t).v,
    fade: sampleTrack(tl.fade, t),
    grade: sampleTrack(tl.grade, t),
    camera,
    backdrop: sampleTrack(tl.backdrop, t),
    scenery: markAt(tl.scenery, t) ?? null,
    music: markAt(tl.music, t) ?? null,
    actors,
    dialog: dialogAt(tl, t, calm),
    card: cardAt(tl, t),
    plates: tl.plates
      .filter((p) => t >= p.at && t <= p.at + p.ms)
      .map((p) => {
        const k = ease(p.ease, (t - p.at) / Math.max(1, p.ms));
        const fade = Math.min(p.fadeMs, p.ms / 2);
        const ms = t - p.at;
        const alpha = Math.min(1, fade > 0 ? ms / fade : 1, fade > 0 ? (p.ms - ms) / fade : 1);
        return {
          plate: p,
          alpha: Math.max(0, alpha),
          frame: {
            x: lerp(p.from.x, p.to.x, k),
            y: lerp(p.from.y, p.to.y, k),
            zoom: lerp(p.from.zoom, p.to.zoom, k),
          },
        };
      }),
    ambient: ambientAt(tl, t),
  };
}

function dialogAt(tl: Timeline, t: number, calm: boolean): CutsceneFrame['dialog'] {
  // The clock stops at a held line's end, which is often where the next line starts: the held
  // line keeps the box until the clock moves on.
  const heldAt = (l: CompiledLine) =>
    (l.hold === 'tap' || l.hold === 'voice') && Math.abs(t - l.doneAt) < 0.5;
  let line: CompiledLine | undefined;
  for (const l of tl.lines) {
    if (l.at > t) break;
    if (line && heldAt(line) && l.at > t - 0.5) break;
    if (t < l.end || heldAt(l)) line = l;
  }
  if (!line) return null;
  const ms = t - line.at;
  const shown = calm ? line.line.glyphs.length : revealAt(line.line, ms);
  const rise = Math.min(1, (t - line.runStart) / BOX_IN_MS);
  const fall = t > line.runEnd ? Math.max(0, 1 - (t - line.runEnd) / BOX_OUT_MS) : 1;
  return {
    line,
    shown,
    complete: shown >= line.line.glyphs.length,
    alpha: Math.min(rise, fall),
    ms,
  };
}

function cardAt(tl: Timeline, t: number): CutsceneFrame['card'] {
  let out: CutsceneFrame['card'] = null;
  for (const c of tl.cards) {
    if (c.at > t) break;
    const ms = t - c.at;
    if (ms > c.ms) continue;
    const fade = Math.min(CARD_FADE_MS, c.ms / 2);
    out = { card: c, ms, alpha: Math.max(0, Math.min(1, ms / fade, (c.ms - ms) / fade)) };
  }
  return out;
}

function ambientAt(tl: Timeline, t: number): AmbientFrame[] {
  const out: AmbientFrame[] = [];
  for (const a of tl.ambient) {
    if (t < a.on || t >= a.off + a.fadeOut) continue;
    const rise = a.fadeIn > 0 ? Math.min(1, (t - a.on) / a.fadeIn) : 1;
    const fall = t > a.off ? (a.fadeOut > 0 ? Math.max(0, 1 - (t - a.off) / a.fadeOut) : 0) : 1;
    out.push({ ambient: a, intensity: a.intensity * Math.min(rise, fall) });
  }
  return out;
}

/** The cues a script fires, for tests and the dev scrubber. */
export function cuesOf(tl: Timeline): readonly Cue[] {
  return tl.cues;
}
