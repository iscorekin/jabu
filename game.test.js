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
  const state = { ...createGame(), board: [9, 9, 1, 2, 4, 5, 6, 7, 8], maxLevelReached: 9 };
  const result = mergeGame(state, 0, 1, () => 0.5);
  assert.deepEqual(result.state.board, [3, 10, 1, 2, 4, 5, 6, 7, 8]);
  assert.equal(result.state.status, 'game_over');
  assert.equal(result.state.board.length, 9);
  assert.equal(hasAvailableMerge(result.state.board), false);
  assert.equal(mergeGame(result.state, 0, 1).success, false);
});

test('availability is checked after the replacement frog spawns', () => {
  const state = { ...createGame(), board: [9, 9, 1, 2, 4, 5, 6, 7, 8], maxLevelReached: 9 };
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

test('boost frequency ramps gradually and respects fixed level milestones', () => {
  for (let max=1;max<=30;max++) {
    const mix = getSpawnMix(max);
    assert.equal(mix.lowerLevel,1);
    assert.equal(mix.higherLevel,2+Math.floor(Math.max(0,max-6)/3));
    assert.ok(mix.higherPairChance>=0 && mix.higherPairChance<=CONFIG.spawnBoostMaxChance);
    assert.equal(spawnLevel(max,()=>.999),mix.higherPairChance===1 ? mix.higherLevel+1 : 2);
    if(max<=CONFIG.spawnBoostStartsAt) assert.equal(mix.higherPairChance,0);
    if(max>1) {
      const delta=mix.higherPairChance-getSpawnMix(max-1).higherPairChance;
      assert.ok(delta>=-1e-12 && delta<=CONFIG.spawnBoostMaxChance/CONFIG.spawnBoostRampLevels+1e-12);
    }
  }
});

test('boost selection and the 85/15 roll use independent exact boundaries', () => {
  const max=8;
  const {higherPairChance:p,higherLevel}=getSpawnMix(max);
  assert.equal(spawnLevel(max,sequence(p/2,.849999)),higherLevel);
  assert.equal(spawnLevel(max,sequence(p/2,.85)),higherLevel+1);
  assert.equal(spawnLevel(max,sequence(p,.849999)),1);
  assert.equal(spawnLevel(max,sequence(p,.85)),2);
});

test('newly opened level affects the replacement and saved progress is respected', () => {
  const before={...createGame(),board:[5,5,1,1,2,2,3,3,1],maxLevelReached:5};
  assert.equal(mergeGame(before,0,1,sequence(0,.5)).state.board[0],getSpawnMix(6).higherLevel);
  const advanced={...createGame(),maxLevelReached:13};
  assert.equal(mergeGame(advanced,0,1,sequence(0,.5)).state.board[0],getSpawnMix(13).higherLevel);
  assert.equal(mergeGame(createGame(),0,1,sequence(.5)).state.board[0],1);
});

test('spawn levels follow fixed milestones even with the luckiest possible rolls', () => {
  for(const [max,highest] of [[3,2],[5,2],[6,3],[7,3],[8,3],[9,4],[10,4],[11,4],[12,5],[13,5],[14,5],[15,6],[17,6],[18,7]]) {
    const rolls = max<=5 ? [.999] : [0,.999];
    assert.equal(spawnLevel(max,()=>rolls.shift()),highest);
  }
});
