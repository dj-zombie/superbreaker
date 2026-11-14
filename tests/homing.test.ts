import { describe, expect, it } from 'vitest';
import { pickHomingTarget, type HomingBox } from '../src/core/Homing';

const box = (x: number, y: number, halfW = 15, halfH = 8): HomingBox => ({ x, y, halfW, halfH });

describe('pickHomingTarget', () => {
  it('homes on the nearest brick above the ball when the path is clear', () => {
    const near = box(40, 40);
    const far = box(200, 20);
    expect(pickHomingTarget(50, 180, [far, near], [])).toBe(near);
  });

  it('ignores bricks below the ball', () => {
    const below = box(50, 220);
    const above = box(80, 40);
    expect(pickHomingTarget(50, 180, [below, above], [])).toBe(above);
  });

  it('does not pull toward a brick sitting behind steel when a gap is open', () => {
    const ballX = 100;
    const ballY = 200;
    // Steel bars with a one-column gap between x = 70 and x = 110.
    const left = box(40, 100, 30, 8);
    const right = box(140, 100, 30, 8);
    const behindSteel = box(40, 70);
    const throughGap = box(90, 40);
    const aim = pickHomingTarget(ballX, ballY, [behindSteel, throughGap], [left, right], 11);
    expect(aim).toBe(throughGap);
  });

  it('aims nowhere when steel walls off every brick above', () => {
    const slab = box(100, 100, 80, 8);
    const above = box(100, 40);
    expect(pickHomingTarget(100, 200, [above], [slab], 11)).toBeNull();
  });

  it('ignores a wall that sits beside the path', () => {
    const target = box(100, 40);
    const beside = box(200, 100);
    expect(pickHomingTarget(100, 200, [target], [beside])).toBe(target);
  });

  it('rejects a path that would clip the ball into steel', () => {
    const wall = box(0, 0, 15, 8);
    const target = box(16, -100);
    expect(pickHomingTarget(16, 100, [target], [wall], 0)).toBe(target);
    expect(pickHomingTarget(16, 100, [target], [wall], 2)).toBeNull();
  });
});
