import type { BossId } from '../core/Boss';
import type { BossDef } from '../systems/BossDirector';
import { warden } from './warden';

/** Every boss a level can name with its `boss` map property. */
export const BOSSES: Record<BossId, BossDef> = { warden };
