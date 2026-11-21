import type { CutsceneDef } from '../core/cutscene';
import { CHAPTER_2 } from './chapter2';

/** Every cutscene, by the id that `levels/index.json` and save data use. */
export const CUTSCENES: Readonly<Record<string, CutsceneDef>> = {
  [CHAPTER_2.id]: CHAPTER_2,
};

export function cutsceneDef(id: string): CutsceneDef | undefined {
  return CUTSCENES[id];
}
