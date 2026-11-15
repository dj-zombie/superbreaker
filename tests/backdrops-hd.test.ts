import { describe, expect, it } from 'vitest';
import { WORLD_IDS, partKey, worldAssets, worldLayers } from '../src/art/backdrops';

describe('16:9 backdrops', () => {
  it('keeps the phone sheets on their own paths', () => {
    for (const world of WORLD_IDS) {
      const assets = worldAssets(world, false);
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) {
        expect(asset.path.startsWith(`images/backdrops/${world}/`)).toBe(true);
        expect(asset.key.endsWith('_hd')).toBe(false);
      }
    }
  });

  it('uses a 4x sheet on the wide stage', () => {
    for (const world of WORLD_IDS) {
      const sd = worldLayers(world, false);
      const hd = worldLayers(world, true);
      expect(sd && hd).toBeTruthy();
      expect(hd!.layers.near!.width).toBe(sd!.layers.near!.width * 4);
      // The loop cut is an integer band, so the tall sheet is 4x within a few pixels.
      const ratio = hd!.layers.near!.height / sd!.layers.near!.height;
      expect(ratio).toBeGreaterThan(3.9);
      expect(ratio).toBeLessThan(4.1);
      for (const asset of worldAssets(world, true)) {
        expect(asset.path.startsWith(`images/backdrops-hd/${world}/`)).toBe(true);
        expect(asset.key.endsWith('_hd')).toBe(true);
      }
    }
  });

  it('gives the two resolutions different texture keys', () => {
    const sd = partKey('images/backdrops/hell/near_l.webp');
    const hd = partKey('images/backdrops-hd/hell/near_l.webp');
    expect(sd).toBe('bd_hell_near_l');
    expect(hd).toBe('bd_hell_near_l_hd');
  });
});
