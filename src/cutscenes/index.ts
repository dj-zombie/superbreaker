import type { CutsceneDef } from '../core/cutscene';
import { CHAPTER_1 } from './chapter1';
import { CHAPTER_2 } from './chapter2';
import { CHAPTER_3 } from './chapter3';
import { THE_DOOR } from './door';
import { ENDING } from './ending';
import { LURE } from './lure';

/** Every cutscene, by the id that `levels/index.json` and save data use. */
export const CUTSCENES: Readonly<Record<string, CutsceneDef>> = {
  [CHAPTER_1.id]: CHAPTER_1,
  [CHAPTER_2.id]: CHAPTER_2,
  [LURE.id]: LURE,
  [CHAPTER_3.id]: CHAPTER_3,
  [THE_DOOR.id]: THE_DOOR,
  [ENDING.id]: ENDING,
};

export function cutsceneDef(id: string): CutsceneDef | undefined {
  return CUTSCENES[id];
}
