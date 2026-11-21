import { registerFx } from '../FxEngine';
import { ABILITY_FX } from './abilities';
import { BRICK_FX } from './bricks';
import { ELEMENT_FX } from './elements';
import { FANFARE_FX } from './fanfare';
import { IMPACT_FX } from './impacts';

/** Every preset, grouped as the FX Lab shows them. */
export const FX_LIBRARY = {
  Bricks: BRICK_FX,
  Impacts: IMPACT_FX,
  Elements: ELEMENT_FX,
  Abilities: ABILITY_FX,
  Fanfare: FANFARE_FX,
} as const;

for (const group of Object.values(FX_LIBRARY)) registerFx(group);
