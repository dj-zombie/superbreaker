/**
 * The end credits, in the order they roll down the field in the credits stage. Edit the names
 * here; the stage lays out whatever is in the list, and the last plate is always `STARRING`.
 */

export interface CreditLine {
  /** The small line over the name, e.g. "Design". */
  role: string;
  name: string;
}

export const CREDITS: readonly CreditLine[] = [
  { role: 'A game by', name: 'Zombie Head Studios' },
  { role: 'Game design', name: 'Zombie Head Studios' },
  { role: 'Code', name: 'Zombie Head Studios' },
  { role: 'Art direction', name: 'Zombie Head Studios' },
  { role: 'Levels and story', name: 'Zombie Head Studios' },
  { role: 'Engine', name: 'Phaser' },
  { role: 'Level editor', name: 'Tiled' },
  { role: 'Art, music and sound', name: 'Ludo AI' },
  { role: 'Voices', name: 'Ludo AI and MiniMax' },
  { role: 'Built with', name: 'Cursor' },
  { role: 'Special thanks', name: 'Vesper, for the light' },
];

/** The plate the roll ends on. It takes a beating, and breaking it is the last thing in the game. */
export const STARRING: CreditLine = { role: 'Starring', name: 'You' };
