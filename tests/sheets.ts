import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ASSETS = join(__dirname, '..', 'public', 'assets');

interface MultiAtlas {
  textures: { image: string; frames: { filename: string }[] }[];
}

/** A PNG's or WebP's width and height, from its header. */
function imageSize(path: string, b: Buffer): [number, number] {
  // A PNG's are the two big-endian words that follow its IHDR tag.
  if (b.toString('latin1', 12, 16) === 'IHDR') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    switch (b.toString('latin1', 12, 16)) {
      case 'VP8X':
        return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
      case 'VP8L': {
        const bits = b.readUInt32LE(21);
        return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
      }
      case 'VP8 ':
        return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
  }
  throw new Error(`${path} is neither a PNG nor a WebP`);
}

/**
 * The frame names an animation sheet under public/assets holds: a multi-page atlas's own (with
 * every page checked to exist), or an image cut into equal frames numbered in reading order.
 */
export function sheetFrames(path: string, frameWidth = 0, frameHeight = 0): Set<string> {
  const file = join(ASSETS, path);
  if (path.endsWith('.json')) {
    const atlas = JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas;
    const names = new Set<string>();
    for (const page of atlas.textures) {
      if (!existsSync(join(dirname(file), page.image))) throw new Error(`${path}: no page ${page.image}`);
      for (const f of page.frames) names.add(f.filename);
    }
    return names;
  }
  const [width, height] = imageSize(path, readFileSync(file));
  const across = width / frameWidth;
  const down = height / frameHeight;
  if (!Number.isInteger(across) || !Number.isInteger(down)) throw new Error(`${path} is not whole frames`);
  return new Set(Array.from({ length: across * down }, (_, i) => String(i)));
}
