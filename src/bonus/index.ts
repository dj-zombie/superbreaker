import type { BonusId } from '../core/Bonus';
import type { BonusDef } from '../systems/BonusDirector';
import { credits } from './credits';
import { gallery } from './gallery';
import { pinata } from './pinata';

/** Every bonus stage a level can name with its `bonus` map property. */
export const BONUSES: Record<BonusId, BonusDef> = { gallery, pinata, credits };
