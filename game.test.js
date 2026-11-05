import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createGame, hasAvailableMerge, mergeGame } from './game.js';

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
  const state = { ...createGame(), board: [8, 8, 2, 3, 4, 5, 6, 7, 10] };
  const result = mergeGame(state, 0, 1, () => 0);
  assert.deepEqual(result.state.board, [1, 9, 2, 3, 4, 5, 6, 7, 10]);
  assert.equal(result.state.status, 'game_over');
  assert.equal(result.state.board.length, 9);
  assert.equal(hasAvailableMerge(result.state.board), false);
  assert.equal(mergeGame(result.state, 0, 1).success, false);
});

test('availability is checked after the replacement frog spawns', () => {
  const state = { ...createGame(), board: [8, 8, 2, 3, 4, 5, 6, 7, 10] };
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
