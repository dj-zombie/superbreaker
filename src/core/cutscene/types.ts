import type { SceneryId } from '../../art/backdrops';
import type { Ease } from './ease';
import type { Grade, GradeId } from './grades';
import type { ParsedLine } from './text';

/** A point on the board as fractions of its width and height, so scenes fit any screen height. */
export type Vec = readonly [x: number, y: number];

export type ActorId = string;
/** Who speaks a line: a cast member, or the narrator, who has no face. */
export type Speaker = ActorId | 'narrator';

/** How a line is shown. */
export type BoxStyle = 'box' | 'bubble' | 'caption' | 'card';

/**
 * What a line waits for once it is fully shown: `tap` waits for the player, `voice` for its clip
 * to end (or the reading time without one), `auto` the reading time, a number that many ms.
 */
export type Hold = 'tap' | 'voice' | 'auto' | number;

export type CameraPreset =
  | 'establish'
  | 'pushIn'
  | 'pullBack'
  | 'pan'
  | 'tilt'
  | 'drift'
  | 'handheld'
  | 'still'
  | 'whip'
  | 'punch'
  | 'dutch'
  | 'level'
  | 'follow'
  | 'rackFocus'
  | 'reset';

/** Where the camera looks: center as board fractions, zoom (1 = the whole board), roll. */
export interface Shot {
  x: number;
  y: number;
  zoom: number;
  /** Roll in degrees. */
  angle: number;
}

/** The camera's sampled state. `sway` and `drift` are noise amplitudes the runtime adds. */
export interface CameraPose extends Shot {
  /** Handheld noise, 0..1. */
  sway: number;
  /** Slow breathing float, 0..1. */
  drift: number;
  /** Depth-of-field blur, 0..1. High tier only. */
  blur: number;
}

/** The backdrop's sampled state. */
export interface BackdropPose {
  /** Scroll speed multiplier. */
  pace: number;
  /** -1..1 parallax slide, as the paddle does in play. */
  sway: number;
  /** 0..0.6 extra brightness on the backdrop's lights. */
  glow: number;
  /** Multiply color over the art. */
  tint: number;
  /** 0..1 the floor giving way (ParallaxBackdrop.fall). */
  fall: number;
}

export interface ActorPose {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  angle: number;
}

/** How an actor arrives and leaves. */
export type Entrance = 'fade' | 'fall' | 'rise' | 'left' | 'right' | 'pop' | 'cut';
export type Emote = 'bounce' | 'shake' | 'nod' | 'shiver' | 'flash';

/** Changes inside a cutscene, drawn over the picture. */
export type TransitionKind =
  'flash' | 'dip' | 'wipe' | 'iris' | 'pixelate' | 'burn' | 'shroud' | 'glitch';

/** Where an ambient field sits: behind the far art, between the parallax layers, or over everything. */
export type AmbientDepth = 'back' | 'between' | 'front' | 'board';

export interface Frame {
  x: number;
  y: number;
  zoom: number;
}

// ---------------------------------------------------------------------------------------------
// Steps. Beats (say, card, wait, hold, descend) take their time in a sequence; moves start and
// let the script go on, unless they are given `wait: true`.

interface Timed {
  ms?: number;
  ease?: Ease;
  /** A move that holds the sequence until it is done. */
  wait?: boolean;
}

export interface SeqStep {
  do: 'seq';
  steps: Step[];
}
export interface TogetherStep {
  do: 'together';
  steps: Step[];
}
export interface WaitStep {
  do: 'wait';
  ms: number;
}
/** Stops the clock until the player taps. */
export interface HoldStep {
  do: 'hold';
}
export interface LabelStep {
  do: 'label';
  name: string;
}

export interface SayStep {
  do: 'say';
  who: Speaker;
  text: string;
  voice?: string;
  box?: BoxStyle;
  hold?: Hold;
  /** Letters per second, before `{speed}` tags. */
  cps?: number;
  /** A blip sound per few letters, when there is no voice. False for none. */
  blip?: string | false;
  /** The portrait's expression, a frame of the cast member's portrait sheet. */
  mood?: string;
  /** Which side the portrait sits on. */
  side?: 'left' | 'right';
}
export interface CardStep {
  do: 'card';
  kicker: string;
  title: string;
  ms: number;
  /** Whose lettering to use; the scene's closing world by default. */
  world?: SceneryId;
}
export interface ClearStep {
  do: 'clear';
}

export interface CameraStep extends Timed {
  do: 'camera';
  shot: CameraPreset | Partial<Shot>;
  /** What to look at: a point, or an actor followed for as long as the move lasts. */
  subject?: Vec | ActorId;
  /** Preset strength: zoom for push and punch, degrees for dutch, amplitude for sway and drift. */
  amount?: number;
  /** Where a pan or tilt starts; a cut there first. */
  from?: Partial<Shot>;
}
export interface ShakeStep {
  do: 'shake';
  ms: number;
  intensity: number;
}
export interface FlashStep {
  do: 'flash';
  ms: number;
  color?: number;
  amount?: number;
}
export interface GradeStep extends Timed {
  do: 'grade';
  to: GradeId | Partial<Grade>;
}
export interface FadeStep extends Timed {
  do: 'fade';
  /** 0 clear, 1 the color covers everything. */
  to: number;
  color?: number;
}
export interface LetterboxStep extends Timed {
  do: 'letterbox';
  to: number;
}
export interface TransitionStep {
  do: 'transition';
  kind: TransitionKind;
  ms?: number;
  color?: number;
}

export interface BackdropStep extends Timed {
  do: 'backdrop';
  pace?: number;
  sway?: number;
  glow?: number;
  tint?: number;
  fall?: number;
}
/** Falls through the floor into another world: the scroll races, the art changes mid-fall. */
export interface DescendStep {
  do: 'descend';
  to: SceneryId;
  ms: number;
  /** An ambient field to fall through, which also hides the change of art. */
  through?: string;
  /** Top scroll speed. */
  peak?: number;
  /** Scroll speed on arrival. */
  land?: number;
}
/** Changes the backdrop's world with its own crossfade. */
export interface SceneryStep {
  do: 'scenery';
  to: SceneryId;
  pace?: number;
}
/** A full-screen illustration with a slow pan and zoom (a Ken Burns move). */
export interface PlateStep {
  do: 'plate';
  image: string;
  ms: number;
  from?: Partial<Frame>;
  to?: Partial<Frame>;
  fadeMs?: number;
  ease?: Ease;
  /** Over the backdrop but under the cast and the effects: a set the actors stand in front of. */
  behind?: boolean;
}

export interface ActorStep extends Timed {
  do: 'actor';
  id: ActorId;
  /** Places the actor here at once (with `enter`, where it arrives). */
  at?: Vec;
  enter?: Entrance;
  exit?: Entrance;
  to?: Vec;
  path?: readonly Vec[];
  anim?: string;
  face?: 'left' | 'right';
  emote?: Emote;
  alpha?: number;
  scale?: number;
  angle?: number;
}

export interface AmbientStep extends Timed {
  do: 'ambient';
  fx: string;
  on: boolean;
  /** Names this field, so a second one of the same effect can run beside it. */
  key?: string;
  depth?: AmbientDepth;
  intensity?: number;
  /** Part of the board to fill, as fractions [x, y, w, h]. The whole stage by default. */
  area?: readonly [number, number, number, number];
}
export interface FxStep {
  do: 'fx';
  fx: string;
  at: Vec | ActorId;
  scale?: number;
  tint?: number;
  intensity?: number;
  angle?: number;
}
export interface SfxStep {
  do: 'sfx';
  key: string;
  volume?: number;
  detune?: number;
}
export interface VoiceStep {
  do: 'voice';
  key: string;
  volume?: number;
}
export interface MusicStep {
  do: 'music';
  /** A music bed's key, or null for silence. */
  bed: string | null;
  volume?: number;
  ms?: number;
}
export interface HapticStep {
  do: 'haptic';
  kind: 'light' | 'medium' | 'heavy';
}

export type Step =
  | SeqStep
  | TogetherStep
  | WaitStep
  | HoldStep
  | LabelStep
  | SayStep
  | CardStep
  | ClearStep
  | CameraStep
  | ShakeStep
  | FlashStep
  | GradeStep
  | FadeStep
  | LetterboxStep
  | TransitionStep
  | BackdropStep
  | DescendStep
  | SceneryStep
  | PlateStep
  | ActorStep
  | AmbientStep
  | FxStep
  | SfxStep
  | VoiceStep
  | MusicStep
  | HapticStep;

// ---------------------------------------------------------------------------------------------
// The scene.

export interface AssetRef {
  key: string;
  /** Under public/assets/. */
  path: string;
}
/** A sheet of equal frames, or an atlas when `path` is its JSON (src/art/sheets.ts). */
export interface SheetRef extends AssetRef {
  /** Size of one frame in a sheet. An atlas says its own. */
  frameWidth?: number;
  frameHeight?: number;
}

export interface ActorAnim {
  frames: readonly number[];
  fps: number;
  loop?: boolean;
}

/** A member of the cast: how they look on stage and in the dialog box. */
export interface ActorDef {
  name: string;
  /** Name plate and text accent, 0xRRGGBB. */
  color?: number;
  /**
   * What stands on stage: an image or sheet key from the assets, a built-in (`breaker` is the
   * paddle and ball, `boss:<id>` a boss's sheet), or nothing for a voice only.
   */
  sprite?: string;
  /** Height on stage in board units. */
  size?: number;
  anims?: Record<string, ActorAnim>;
  /** Plays when no other animation has been asked for. */
  idle?: string;
  /** Portrait image or sheet key, and its moods by frame. */
  portrait?: string;
  moods?: Record<string, number>;
  /** Blip sound for typed lines without a voice. */
  blip?: string;
  /** A light that travels with the actor. */
  light?: { color: number; radius: number; intensity?: number };
}

export interface CutsceneDef {
  id: string;
  /** What shows when it starts. `inherit` takes over the screen it was started from. */
  opens: { scenery: SceneryId | 'inherit'; grade?: GradeId; pace?: number };
  /** What it leaves on screen, so the next one can take over without a cut. */
  closes: { scenery: SceneryId; pace?: number; handoff: 'continuous' | 'dissolve' | 'theme' };
  cast?: Record<ActorId, ActorDef>;
  assets?: {
    images?: readonly AssetRef[];
    sheets?: readonly SheetRef[];
    voice?: readonly AssetRef[];
    sfx?: readonly AssetRef[];
    music?: readonly AssetRef[];
  };
  /** `after-seen` lets a player skip only once they have watched it through. */
  skip: 'always' | 'after-seen' | 'never';
  /**
   * Keeps time with its music: a tap doesn't hurry the lines, which would run the picture ahead
   * of the score. Holds still wait for a tap.
   */
  scored?: boolean;
  script: Step[];
}

// ---------------------------------------------------------------------------------------------
// The compiled timeline and its frames.

/** A move along one track: from whatever it was at `at` to `to`, over `ms`. */
export interface Segment<V> {
  at: number;
  ms: number;
  ease: Ease;
  to: Partial<V>;
  /** Filled in by compile: the track's value when the move starts. */
  from: V;
}

export interface Track<V> {
  initial: V;
  segs: Segment<V>[];
  colorKeys: ReadonlySet<keyof V>;
}

export interface Mark<T> {
  at: number;
  value: T;
}

export interface CompiledLine {
  at: number;
  /** When it stops being the line on screen (the next line, a clear, or its own end). */
  end: number;
  /** When the line's own time is over (where a held line waits). */
  doneAt: number;
  who: Speaker;
  style: BoxStyle;
  line: ParsedLine;
  hold: Hold;
  voice?: string;
  blip?: string | false;
  mood?: string;
  side: 'left' | 'right';
  /** First and last line of a run of lines shown in one box. */
  runStart: number;
  runEnd: number;
}

export interface CompiledCard {
  at: number;
  ms: number;
  kicker: string;
  title: string;
  world?: SceneryId;
}

export interface CompiledPlate {
  at: number;
  ms: number;
  image: string;
  from: Frame;
  to: Frame;
  fadeMs: number;
  ease: Ease;
  behind: boolean;
}

export interface CompiledAmbient {
  key: string;
  fx: string;
  depth: AmbientDepth;
  intensity: number;
  area?: readonly [number, number, number, number];
  on: number;
  /** When it starts fading out; Infinity while it runs to the end. */
  off: number;
  fadeIn: number;
  fadeOut: number;
}

/** One-shot events. Each fires once as the playhead passes it, and never on a skip or seek. */
export type Cue =
  | { at: number; kind: 'sfx'; step: SfxStep }
  | { at: number; kind: 'voice'; step: VoiceStep; line?: CompiledLine }
  | { at: number; kind: 'fx'; step: FxStep }
  | { at: number; kind: 'shake'; step: ShakeStep }
  | { at: number; kind: 'flash'; step: FlashStep }
  | { at: number; kind: 'punch'; amount: number; ms: number }
  | { at: number; kind: 'whip'; ms: number }
  | { at: number; kind: 'emote'; id: ActorId; emote: Emote }
  | { at: number; kind: 'transition'; step: TransitionStep }
  | { at: number; kind: 'haptic'; step: HapticStep }
  | { at: number; kind: 'label'; name: string };

export interface HoldPoint {
  at: number;
  /** `tap` waits for the player; `voice` for the line's clip, or `fallbackMs` of real time. */
  kind: 'tap' | 'voice';
  line?: CompiledLine;
  fallbackMs: number;
}

export interface ActorTrack {
  pose: Track<ActorPose>;
  anims: Mark<string | null>[];
  faces: Mark<'left' | 'right'>[];
}

export interface Timeline {
  def: CutsceneDef;
  lengthMs: number;
  letterbox: Track<{ v: number }>;
  fade: Track<{ v: number; color: number }>;
  grade: Track<Grade>;
  camera: Track<CameraPose>;
  /** Camera moves that look at an actor, by segment index. */
  follows: Map<Segment<CameraPose>, ActorId>;
  backdrop: Track<BackdropPose>;
  scenery: Mark<{ id: SceneryId; pace?: number }>[];
  music: Mark<{ bed: string | null; volume: number; ms: number }>[];
  actors: Map<ActorId, ActorTrack>;
  lines: CompiledLine[];
  cards: CompiledCard[];
  plates: CompiledPlate[];
  ambient: CompiledAmbient[];
  cues: Cue[];
  holds: HoldPoint[];
  labels: Map<string, number>;
}

export interface DialogFrame {
  line: CompiledLine;
  /** Glyphs showing. */
  shown: number;
  /** All of it is showing. */
  complete: boolean;
  /** The box's opacity, 0..1, for the run of lines it belongs to. */
  alpha: number;
  /** ms into the line. */
  ms: number;
}

export interface CardFrame {
  card: CompiledCard;
  ms: number;
  alpha: number;
}

export interface PlateFrame {
  plate: CompiledPlate;
  alpha: number;
  frame: Frame;
}

export interface AmbientFrame {
  ambient: CompiledAmbient;
  intensity: number;
}

export interface ActorFrame extends ActorPose {
  id: ActorId;
  anim: string | null;
  face: 'left' | 'right';
}

/** Everything a cutscene shows at one moment. The views draw this and keep no time of their own. */
export interface CutsceneFrame {
  t: number;
  letterbox: number;
  fade: { v: number; color: number };
  grade: Grade;
  camera: CameraPose;
  backdrop: BackdropPose;
  scenery: { id: SceneryId; pace?: number } | null;
  music: { bed: string | null; volume: number; ms: number } | null;
  actors: ActorFrame[];
  dialog: DialogFrame | null;
  card: CardFrame | null;
  plates: PlateFrame[];
  ambient: AmbientFrame[];
}
