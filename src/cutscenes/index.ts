import type { CutsceneDef } from '../core/cutscene';
import { CHAPTER_1 } from './chapter1';
import { CHAPTER_2 } from './chapter2';

/** Every cutscene, by the id that `levels/index.json` and save data use. */
export const CUTSCENES: Readonly<Record<string, CutsceneDef>> = {
  [CHAPTER_1.id]: CHAPTER_1,
  [CHAPTER_2.id]: CHAPTER_2,
};

export function cutsceneDef(id: string): CutsceneDef | undefined {
  return CUTSCENES[id];
}
