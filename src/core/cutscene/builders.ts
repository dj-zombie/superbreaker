import type { SceneryId } from '../../art/backdrops';
import type { Ease } from './ease';
import type { Grade, GradeId } from './grades';
import type {
  ActorId,
  ActorStep,
  AmbientStep,
  BackdropStep,
  CameraPreset,
  CameraStep,
  CardStep,
  CutsceneDef,
  DescendStep,
  FxStep,
  PlateStep,
  SayStep,
  Shot,
  Speaker,
  Step,
  TransitionKind,
  Vec,
} from './types';

/**
 * Small builders that return plain step data, so a script reads like a shot list:
 *
 *   say('warden', 'The fire was the lid.', { hold: 'tap' }),
 *   together(shake(600, 0.01), descend('crypt', { ms: 5000 })),
 *
 * Beats (say, card, wait, hold, descend) take their time; every other step starts and lets the
 * script go on at once, unless it is given `wait: true`.
 */

type Opts<S, K extends keyof S = never> = Partial<Omit<S, K | 'do'>>;

export function cutscene(
  id: string,
  frame: Pick<CutsceneDef, 'opens' | 'closes'> &
    Partial<Pick<CutsceneDef, 'cast' | 'assets' | 'skip' | 'scored'>>,
  script: Step[],
): CutsceneDef {
  return { id, skip: frame.skip ?? 'always', ...frame, script };
}

export const seq = (...steps: Step[]): Step => ({ do: 'seq', steps });
export const together = (...steps: Step[]): Step => ({ do: 'together', steps });
export const wait = (ms: number): Step => ({ do: 'wait', ms });
export const hold = (): Step => ({ do: 'hold' });
export const label = (name: string): Step => ({ do: 'label', name });

export const say = (
  who: Speaker,
  text: string,
  opts: Opts<SayStep, 'who' | 'text'> = {},
): Step => ({
  do: 'say',
  who,
  text,
  ...opts,
});
export const narrate = (text: string, opts: Opts<SayStep, 'who' | 'text'> = {}): Step =>
  say('narrator', text, opts);
export const card = (kicker: string, title: string, ms = 3200, world?: SceneryId): CardStep => ({
  do: 'card',
  kicker,
  title,
  ms,
  world,
});
export const clear = (): Step => ({ do: 'clear' });

export const camera = (
  shot: CameraPreset | Partial<Shot>,
  opts: Opts<CameraStep, 'shot'> = {},
): Step => ({ do: 'camera', shot, ...opts });
export const shake = (ms: number, intensity: number): Step => ({ do: 'shake', ms, intensity });
export const flash = (ms = 220, color = 0xffffff, amount = 0.9): Step => ({
  do: 'flash',
  ms,
  color,
  amount,
});

export const grade = (to: GradeId | Partial<Grade>, ms = 1200, ease?: Ease): Step => ({
  do: 'grade',
  to,
  ms,
  ease,
});
export const fade = (to: number, ms = 600, color?: number): Step => ({ do: 'fade', to, ms, color });
export const letterbox = (to: number, ms = 700): Step => ({ do: 'letterbox', to, ms });
export const transition = (kind: TransitionKind, ms?: number, color?: number): Step => ({
  do: 'transition',
  kind,
  ms,
  color,
});

export const backdrop = (opts: Opts<BackdropStep>): Step => ({ do: 'backdrop', ...opts });
export const descend = (to: SceneryId, opts: Opts<DescendStep, 'to'> & { ms: number }): Step => ({
  do: 'descend',
  to,
  ...opts,
});
export const scenery = (to: SceneryId, pace?: number): Step => ({ do: 'scenery', to, pace });
export const plate = (image: string, opts: Opts<PlateStep, 'image'> & { ms: number }): Step => ({
  do: 'plate',
  image,
  ...opts,
});

export const actor = (id: ActorId, opts: Opts<ActorStep, 'id'>): Step => ({
  do: 'actor',
  id,
  ...opts,
});
export const enter = (id: ActorId, at: Vec, how: ActorStep['enter'] = 'fade', ms?: number): Step =>
  actor(id, { at, enter: how, ms });
export const exit = (id: ActorId, how: ActorStep['exit'] = 'fade', ms?: number): Step =>
  actor(id, { exit: how, ms });

export const ambient = (fx: string, opts: Opts<AmbientStep, 'fx' | 'on'> = {}): Step => ({
  do: 'ambient',
  fx,
  on: true,
  ...opts,
});
export const ambientOff = (fx: string, ms?: number, key?: string): Step => ({
  do: 'ambient',
  fx,
  on: false,
  ms,
  key,
});
export const fx = (id: string, at: Vec | ActorId, opts: Opts<FxStep, 'fx' | 'at'> = {}): Step => ({
  do: 'fx',
  fx: id,
  at,
  ...opts,
});

export const sfx = (key: string, volume?: number, detune?: number): Step => ({
  do: 'sfx',
  key,
  volume,
  detune,
});
export const voice = (key: string, volume?: number): Step => ({ do: 'voice', key, volume });
export const music = (bed: string | null, ms?: number, volume?: number): Step => ({
  do: 'music',
  bed,
  ms,
  volume,
});
export const haptic = (kind: 'light' | 'medium' | 'heavy' = 'medium'): Step => ({
  do: 'haptic',
  kind,
});
