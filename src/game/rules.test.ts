import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circleIntersectsRect,
  circleIntersectsCircle,
  resolveCircleRectCollision,
  lineIntersectsCircle,
  calculateScore,
  updateCombo,
  addComboShard,
  calculateDifficultyParams,
  generateMazeLayout,
} from './rules.ts';

test('circleIntersectsRect accurately detects collision and separation', () => {
  // Overlapping
  assert.equal(circleIntersectsRect(50, 50, 15, 40, 40, 40, 40), true);
  // Tangent edge
  assert.equal(circleIntersectsRect(25, 50, 15, 40, 40, 40, 40), true);
  // Clear separation
  assert.equal(circleIntersectsRect(10, 10, 10, 100, 100, 50, 50), false);
});

test('circleIntersectsCircle accurately computes distance overlap', () => {
  // Touching / overlapping
  assert.equal(circleIntersectsCircle(10, 10, 10, 25, 10, 10), true);
  // Distant circles
  assert.equal(circleIntersectsCircle(0, 0, 5, 50, 50, 5), false);
});

test('resolveCircleRectCollision pushes circle out along normal', () => {
  const resolved = resolveCircleRectCollision(45, 50, 10, 50, 40, 40, 40);
  assert.equal(resolved.collided, true);
  // Should push circle to the left of the rectangle (x <= 40)
  assert.ok(resolved.x <= 40.01, `Expected x <= 40, got ${resolved.x}`);
});

test('lineIntersectsCircle detects laser beam intersection', () => {
  // Beam passes through circle at (50, 50)
  assert.equal(lineIntersectsCircle(0, 50, 100, 50, 50, 50, 10), true);
  // Beam misses circle
  assert.equal(lineIntersectsCircle(0, 0, 100, 0, 50, 50, 10), false);
  // Segment stops before circle
  assert.equal(lineIntersectsCircle(0, 50, 30, 50, 50, 50, 10), false);
});

test('calculateScore scales with combo multiplier and bonus', () => {
  assert.equal(calculateScore(100, 1), 100);
  assert.equal(calculateScore(100, 4), 400);
  assert.equal(calculateScore(500, 8, 1.5), 6000);
});

test('combo multiplier decays after timeout and caps at 8x', () => {
  // Add combo
  const c1 = addComboShard(1);
  assert.equal(c1.multiplier, 2);
  assert.ok(c1.timer > 0);

  // Cap at 8
  const cMax = addComboShard(8);
  assert.equal(cMax.multiplier, 8);

  // Normal decay
  const decayed = updateCombo(3, 0.1, 0.2);
  assert.equal(decayed.multiplier, 2);
  assert.equal(decayed.decayed, true);

  // Base multiplier floor is 1
  const floorDecay = updateCombo(1, 0.1, 0.5);
  assert.equal(floorDecay.multiplier, 1);
});

test('calculateDifficultyParams scales appropriately with sector progression', () => {
  const s1 = calculateDifficultyParams(1);
  const s3 = calculateDifficultyParams(3);

  assert.equal(s1.sector, 1);
  assert.ok(s3.shardsRequired > s1.shardsRequired);
  assert.ok(s3.speedMultiplier > s1.speedMultiplier);
  assert.ok(s3.hazardDensity > s1.hazardDensity);
});

test('generateMazeLayout produces navigable map with clear spawn and hazards', () => {
  const layout = generateMazeLayout(1);

  assert.ok(layout.walls.length > 4, 'Should generate perimeter + interior walls');
  assert.ok(layout.shards.length >= 10, 'Should generate enough shards');
  assert.ok(layout.hazards.length >= 3, 'Should generate multiple hazards');
  
  // Verify player spawn is far from exit gateway
  const spawnDistToExit = Math.hypot(
    layout.playerSpawn.x - layout.exitGateway.x,
    layout.playerSpawn.y - layout.exitGateway.y
  );
  assert.ok(spawnDistToExit > 500, 'Player spawn must be well separated from exit');

  // Verify player spawn does not overlap any wall
  const spawnInWall = layout.walls.some((w) =>
    circleIntersectsRect(
      layout.playerSpawn.x,
      layout.playerSpawn.y,
      20,
      w.x,
      w.y,
      w.w,
      w.h
    )
  );
  assert.equal(spawnInWall, false, 'Player spawn must not intersect walls');
});
