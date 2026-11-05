import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createGame, hasAvailableMerge, mergeGame, spawnLevel, getSpawnMix } from './game.js';

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
  const state = { ...createGame(), board: [8, 8, 2, 3, 4, 5, 6, 7, 10], maxLevelReached: 10 };
  const result = mergeGame(state, 0, 1, () => 0.5);
  assert.deepEqual(result.state.board, [1, 9, 2, 3, 4, 5, 6, 7, 10]);
  assert.equal(result.state.status, 'game_over');
  assert.equal(result.state.board.length, 9);
  assert.equal(hasAvailableMerge(result.state.board), false);
  assert.equal(mergeGame(result.state, 0, 1).success, false);
});

test('availability is checked after the replacement frog spawns', () => {
  const state = { ...createGame(), board: [8, 8, 2, 3, 4, 5, 6, 7, 10], maxLevelReached: 10 };
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

const sequence = (...values) => () => {
  assert.ok(values.length, 'Unexpected random draw');
  return values.shift();
};

test('spawn help increases by ten percentage points per unlocked level after six', () => {
  for (const [level, lower, chance] of [[1,1,0],[6,1,0],[7,1,.1],[8,1,.2],[9,1,.3],[10,1,.4],[15,1,.9],[16,2,0],[17,2,.1],[26,3,0]]) {
    assert.deepEqual(getSpawnMix(level), { lowerLevel: lower, higherPairChance: chance });
  }
});

test('pair selection and the 85/15 roll are independent at their exact boundaries', () => {
  assert.equal(spawnLevel(8, sequence(.199999, .849999)), 2);
  assert.equal(spawnLevel(8, sequence(.199999, .85)), 3);
  assert.equal(spawnLevel(8, sequence(.2, .849999)), 1);
  assert.equal(spawnLevel(8, sequence(.2, .85)), 2);
  assert.equal(spawnLevel(16, sequence(.849999)), 2);
  assert.equal(spawnLevel(16, sequence(.85)), 3);
});

test('combined probabilities match the two-stage distribution across the progression', () => {
  for (const max of [6,7,8,9,10,15,16,17,26]) {
    const { lowerLevel: low, higherPairChance: p } = getSpawnMix(max);
    const counts = [0,0,0];
    for(let pair=0;pair<100;pair++) for(let rarity=0;rarity<100;rarity++) {
      const rng = p > 0 ? sequence((pair+.5)/100,(rarity+.5)/100) : sequence((rarity+.5)/100);
      counts[spawnLevel(max,rng)-low]++;
    }
    assert.deepEqual(counts, [Math.round(10000*(1-p)*.85), Math.round(10000*((1-p)*.15+p*.85)), Math.round(10000*p*.15)]);
  }
});

test('new unlock applies immediately; low merges retain progress and new games reset it', () => {
  const before = { ...createGame(), board: [6,6,1,1,2,2,3,3,1], maxLevelReached: 6 };
  assert.equal(mergeGame(before,0,1,sequence(.05,.5)).state.board[0],2);
  const advanced = { ...createGame(), maxLevelReached: 16 };
  assert.equal(mergeGame(advanced,0,1,sequence(.5)).state.board[0],2);
  assert.equal(mergeGame(createGame(),0,1,sequence(.5)).state.board[0],1);
});
