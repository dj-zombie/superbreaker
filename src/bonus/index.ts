import type { BonusId } from '../core/Bonus';
import type { BonusDef } from '../systems/BonusDirector';
import { gallery } from './gallery';

/** Every bonus stage a level can name with its `bonus` map property. */
export const BONUSES: Record<BonusId, BonusDef> = { gallery };
