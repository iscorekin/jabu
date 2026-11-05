import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createGame, hasAvailableMerge, mergeGame, spawnLevel } from './game.js';

test('new games reset progress and do not share their board', () => {
  const first = createGame();
  first.board[0] = 99;
  first.score = 500;
  const fresh = createGame();
  assert.deepEqual(fresh, {
    board: [1, 1, 2, 1, 2, 3, 2, 3, 1],
    score: 0, mergeCount: 0, maxLevelReached: 3, status: 'playing',
  });
  assert.equal(CONFIG.initialBoard[0], 1);
});

test('opposite corners merge into the target with one atomic progress update', () => {
  const state = createGame();
  const snapshot = structuredClone(state);
  let calls = 0;
  const result = mergeGame(state, 0, 8, () => { calls++; return 0; });
  assert.equal(result.success, true);
  assert.equal(result.points, 20);
  assert.equal(result.newLevel, 2);
  assert.deepEqual(result.state.board, [1, 1, 2, 1, 2, 3, 2, 3, 2]);
  assert.equal(result.state.score, 20);
  assert.equal(result.state.mergeCount, 1);
  assert.equal(result.state.maxLevelReached, 3);
  assert.equal(calls, 1);
  assert.deepEqual(state, snapshot);
});

test('spawn probability boundary chooses level one below .85 and two at .85', () => {
  assert.equal(mergeGame(createGame(), 0, 1, () => 0.849999).state.board[0], 1);
  assert.equal(mergeGame(createGame(), 0, 1, () => 0.85).state.board[0], 2);
});

test('invalid actions preserve the entire state and never draw randomness', () => {
  const state = createGame();
  for (const [source, target] of [[0, 0], [0, 2], [-1, 0], [0, 9], [0.5, 1], [NaN, 1], [0, undefined]]) {
    const result = mergeGame(state, source, target, () => assert.fail('unexpected spawn'));
    assert.deepEqual(result, { success: false, state, newLevel: null, points: 0 });
    assert.equal(result.state, state);
  }
});

test('last available pair ends the game after spawning and further actions are blocked', () => {
  const state = { ...createGame(), board: [9, 9, 1, 2, 3, 5, 6, 7, 8], maxLevelReached: 9 };
  const result = mergeGame(state, 0, 1, () => 0);
  assert.deepEqual(result.state.board, [4, 10, 1, 2, 3, 5, 6, 7, 8]);
  assert.equal(result.state.status, 'game_over');
  assert.equal(result.state.board.length, 9);
  assert.equal(hasAvailableMerge(result.state.board), false);
  assert.equal(mergeGame(result.state, 0, 1).success, false);
});

test('availability is checked after the replacement frog spawns', () => {
  const state = { ...createGame(), board: [9, 9, 1, 2, 3, 5, 6, 7, 8], maxLevelReached: 9 };
  const result = mergeGame(state, 0, 1, () => 0.99);
  assert.equal(result.state.status, 'playing');
  assert.equal(hasAvailableMerge(result.state.board), true);
});

test('high levels have no artificial cap and scoring accumulates', () => {
  const state = { ...createGame(), board: [15, 15, 1, 2, 3, 4, 5, 6, 7], score: 40, mergeCount: 2, maxLevelReached: 15 };
  const result = mergeGame(state, 0, 1, () => 0);
  assert.equal(result.newLevel, 16);
  assert.equal(result.state.maxLevelReached, 16);
  assert.equal(result.state.score, 40 + 10 * 2 ** 15);
  assert.equal(result.state.mergeCount, 3);
  assert.equal(result.state.board.every(level => Number.isInteger(level) && level >= 1), true);
});

test('spawn tiers use the 85/15 boundary and persist above the last threshold', () => {
  for (const [maxLevel, lower] of [[1,1],[3,1],[5,1],[6,2],[7,2],[8,3],[9,3],[10,4],[11,4],[12,5],[13,5],[30,5]]) {
    assert.equal(spawnLevel(maxLevel, () => 0), lower);
    assert.equal(spawnLevel(maxLevel, () => 0.849999), lower);
    assert.equal(spawnLevel(maxLevel, () => 0.85), lower + 1);
    assert.equal(spawnLevel(maxLevel, () => 0.999999), lower + 1);
  }
});

test('unlocking a tier changes the replacement frog in the same merge', () => {
  for (const [unlocked, lower] of [[6,2],[8,3],[10,4],[12,5]]) {
    const state = { ...createGame(), board: [unlocked - 1, unlocked - 1, 1, 1, 2, 2, 3, 3, 1], maxLevelReached: unlocked - 1 };
    assert.equal(mergeGame(state, 0, 1, () => 0).state.board[0], lower);
    assert.equal(mergeGame(state, 0, 1, () => 0.85).state.board[0], lower + 1);
  }
});

test('low-level merges use the highest level previously unlocked in the current game', () => {
  const state = { ...createGame(), maxLevelReached: 12 };
  assert.equal(mergeGame(state, 0, 1, () => 0).state.board[0], 5);
  assert.equal(mergeGame(state, 0, 1, () => 0.85).state.board[0], 6);
  assert.equal(mergeGame(createGame(), 0, 1, () => 0).state.board[0], 1);
});
