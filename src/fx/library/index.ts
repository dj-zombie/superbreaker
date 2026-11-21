import { registerFx } from '../FxEngine';
import { ABILITY_FX } from './abilities';
import { AMBIENT_FX } from './ambient';
import { BOSS_FX } from './boss';
import { BRICK_FX } from './bricks';
import { ELEMENT_FX } from './elements';
import { FANFARE_FX } from './fanfare';
import { IMPACT_FX } from './impacts';
import { POWERUP_FX } from './powerups';
import { SCREEN_FX } from './screen';
import { WEAPON_FX } from './weapons';
import { WEATHER_FX } from './weather';

/** Every preset, grouped as the FX Lab shows them. */
export const FX_LIBRARY = {
  Bricks: BRICK_FX,
  Impacts: IMPACT_FX,
  Elements: ELEMENT_FX,
  Weapons: WEAPON_FX,
  Abilities: ABILITY_FX,
  Powerups: POWERUP_FX,
  Boss: BOSS_FX,
  Fanfare: FANFARE_FX,
  Weather: WEATHER_FX,
  Ambient: AMBIENT_FX,
  Screen: SCREEN_FX,
} as const;

for (const group of Object.values(FX_LIBRARY)) registerFx(group);
