import { compile } from './compile';
import { isGradeId } from './grades';
import { parseLine } from './text';
import type { CutsceneDef, Step, Vec } from './types';

/** What the game knows exists, for checks that reach outside the script. All optional. */
export interface KnownAssets {
  /** One-shot effects, for `fx()`. Without `field`, ambient fields are checked with it too. */
  fx?: (id: string) => boolean;
  /** Long-running fields, for `ambient()` and a descent's `through`. */
  field?: (id: string) => boolean;
  sfx?: (key: string) => boolean;
  /** Built-in sprites: `breaker`, and rigs named `<prefix>:<arg>` such as `boss:<id>`. */
  sprite?: (key: string) => boolean;
}

/** Everything wrong with a script, as sentences. An empty list means it can be played. */
export function scriptProblems(def: CutsceneDef, known: KnownAssets = {}): string[] {
  const out: string[] = [];
  const cast = def.cast ?? {};
  const images = new Set(
    [...(def.assets?.images ?? []), ...(def.assets?.sheets ?? [])].map((a) => a.key),
  );
  const voices = new Set((def.assets?.voice ?? []).map((a) => a.key));
  const sounds = new Set((def.assets?.sfx ?? []).map((a) => a.key));
  const beds = new Set((def.assets?.music ?? []).map((a) => a.key));
  const labels = new Set<string>();
  const on = new Set<string>();
  const field = known.field ?? known.fx;

  const actor = (id: string, where: string) => {
    if (!cast[id]) out.push(`${where}: no cast member "${id}"`);
  };
  const point = (at: Vec | string, where: string) => {
    if (typeof at === 'string') actor(at, where);
    else if (!at.every((v) => Number.isFinite(v))) out.push(`${where}: position is not a number`);
  };
  const sound = (key: string, where: string) => {
    if (!sounds.has(key) && known.sfx && !known.sfx(key)) out.push(`${where}: no sound "${key}"`);
  };

  for (const [id, a] of Object.entries(cast)) {
    for (const key of [a.sprite, a.portrait]) {
      if (!key) continue;
      const builtIn = key === 'breaker' || key.includes(':');
      if (builtIn ? known.sprite && !known.sprite(key) : !images.has(key)) {
        out.push(`cast "${id}": no image "${key}" in the assets`);
      }
    }
    if (a.idle && !a.anims?.[a.idle])
      out.push(`cast "${id}": idle "${a.idle}" is not one of its anims`);
  }

  const walk = (steps: readonly Step[], path: string) => {
    steps.forEach((s, i) => {
      const where = `${path}${i} (${s.do})`;
      switch (s.do) {
        case 'seq':
        case 'together':
          walk(s.steps, `${where} > `);
          break;
        case 'wait':
          if (!(s.ms >= 0)) out.push(`${where}: negative wait`);
          break;
        case 'label':
          if (labels.has(s.name)) out.push(`${where}: label "${s.name}" is used twice`);
          labels.add(s.name);
          break;
        case 'say': {
          if (s.who !== 'narrator') actor(s.who, where);
          const line = parseLine(s.text);
          for (const tag of line.unknown) out.push(`${where}: unknown tag ${tag}`);
          if (!line.text.trim()) out.push(`${where}: empty line`);
          if (s.voice && !voices.has(s.voice))
            out.push(`${where}: no voice "${s.voice}" in the assets`);
          if (s.mood && s.who !== 'narrator' && !cast[s.who]?.moods?.[s.mood]) {
            out.push(`${where}: "${s.who}" has no mood "${s.mood}"`);
          }
          break;
        }
        case 'card':
          if (!(s.ms > 0)) out.push(`${where}: a card needs a length`);
          break;
        case 'camera':
          if (s.subject !== undefined) point(s.subject, where);
          if (s.shot === 'follow' && typeof s.subject !== 'string')
            out.push(`${where}: follow needs an actor`);
          break;
        case 'grade':
          if (typeof s.to === 'string' && !isGradeId(s.to))
            out.push(`${where}: no grade "${s.to}"`);
          break;
        case 'descend':
          if (s.to === def.opens.scenery)
            out.push(`${where}: descends into the world it starts in`);
          if (s.through && field && !field(s.through))
            out.push(`${where}: no effect "${s.through}"`);
          break;
        case 'plate':
          if (!images.has(s.image)) out.push(`${where}: no image "${s.image}" in the assets`);
          break;
        case 'actor':
          actor(s.id, where);
          if (s.anim && !cast[s.id]?.anims?.[s.anim])
            out.push(`${where}: "${s.id}" has no anim "${s.anim}"`);
          if (s.enter && !s.at) out.push(`${where}: an entrance needs \`at\``);
          break;
        case 'ambient': {
          const key = s.key ?? s.fx;
          if (field && !field(s.fx)) out.push(`${where}: no effect "${s.fx}"`);
          if (s.on) on.add(key);
          else if (!on.delete(key)) out.push(`${where}: turns off "${key}", which is not on`);
          break;
        }
        case 'fx':
          point(s.at, where);
          if (known.fx && !known.fx(s.fx)) out.push(`${where}: no effect "${s.fx}"`);
          break;
        case 'sfx':
          sound(s.key, where);
          break;
        case 'voice':
          if (!voices.has(s.key)) out.push(`${where}: no voice "${s.key}" in the assets`);
          break;
        case 'music':
          if (s.bed !== null && !beds.has(s.bed))
            out.push(`${where}: no music "${s.bed}" in the assets`);
          break;
        default:
          break;
      }
    });
  };
  walk(def.script, '');

  const tl = compile(def);
  if (tl.lengthMs <= 0) out.push('the script takes no time');
  const end = tl.lengthMs;
  for (const c of tl.cues)
    if (c.at > end) out.push(`a ${c.kind} cue at ${c.at} ms is past the end`);
  return out;
}
