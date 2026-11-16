import { describe, expect, it } from 'vitest';
import { actionsFor, guessLayout, keyName, labelFor } from '../src/core/KeyLayout';

describe('actionsFor', () => {
  it('binds by physical position, whatever the key types', () => {
    // AZERTY: the key at QWERTY's A types "q" and still moves left.
    expect(actionsFor('KeyA', 'q')).toEqual(['left']);
    expect(actionsFor('KeyQ', 'a')).toEqual(['slot1']);
    expect(actionsFor('KeyW', 'z')).toEqual(['launch']);
    expect(actionsFor('Space', ' ')).toEqual(['launch']);
    expect(actionsFor('Digit1', '&')).toEqual(['stock1']);
    expect(actionsFor('Numpad4', '4')).toEqual(['stock4']);
  });

  it('pauses on the P character, or where P sits when the layout has no Latin letters', () => {
    expect(actionsFor('KeyP', 'p')).toEqual(['pause']);
    expect(actionsFor('KeyR', 'p')).toEqual(['pause']);
    expect(actionsFor('KeyP', 'l')).toEqual([]);
    expect(actionsFor('KeyP', 'з')).toEqual(['pause']);
  });
});

describe('guessLayout', () => {
  it('picks AZERTY for French and Belgian keyboards only', () => {
    expect(guessLayout(['fr-FR', 'en'])).toBe('azerty');
    expect(guessLayout(['fr'])).toBe('azerty');
    expect(guessLayout(['fr-BE'])).toBe('azerty');
    expect(guessLayout(['nl-BE'])).toBe('azerty');
    expect(guessLayout(['fr-CA'])).toBe('qwerty');
    expect(guessLayout(['fr-CH'])).toBe('qwerty');
    expect(guessLayout(['en-US', 'fr-FR'])).toBe('qwerty');
    expect(guessLayout([])).toBe('qwerty');
  });
});

describe('keyName', () => {
  it('keeps printable ASCII only', () => {
    expect(keyName('q')).toBe('Q');
    expect(keyName(',')).toBe(',');
    expect(keyName(' ')).toBeNull();
    expect(keyName('ф')).toBeNull();
    expect(keyName('Dead')).toBeNull();
  });
});

describe('labelFor', () => {
  it('fixes arrows, Space and digits', () => {
    expect(labelFor('ArrowLeft', { guess: 'azerty' })).toBe('←');
    expect(labelFor('Space', { guess: 'qwerty' })).toBe('SPACE');
    expect(labelFor('Digit2', { guess: 'azerty', learned: new Map([['Digit2', 'É']]) })).toBe('2');
  });

  it('prefers typed keys, then the layout map, then the guess', () => {
    expect(labelFor('KeyA', { guess: 'qwerty' })).toBe('A');
    expect(labelFor('KeyA', { guess: 'azerty' })).toBe('Q');
    expect(labelFor('KeyW', { guess: 'azerty' })).toBe('Z');
    expect(labelFor('KeyD', { guess: 'azerty' })).toBe('D');
    const map = new Map([['KeyA', 'q']]);
    expect(labelFor('KeyA', { guess: 'qwerty', map })).toBe('Q');
    const learned = new Map([['KeyA', 'A']]);
    expect(labelFor('KeyA', { guess: 'azerty', map, learned })).toBe('A');
  });

  it('falls back to the QWERTY letter when the map names a non-Latin character', () => {
    expect(labelFor('KeyA', { guess: 'qwerty', map: new Map([['KeyA', 'ф']]) })).toBe('A');
  });
});
