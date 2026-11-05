import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, mergeGame } from './game.js';
import { loadGame, saveGame } from './storage.js';
const memory = () => {
  let value = null;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
};

test('reload restores merged board and progress; new game keeps the record', () => {
  const storage = memory();
  const { state } = mergeGame(createGame(), 0, 1, () => 0);
  assert.equal(saveGame(state, 0, storage), true);
  assert.deepEqual(loadGame(storage), { state, bestScore: 20 });
  saveGame(createGame(), 20, storage);
  assert.deepEqual(loadGame(storage), { state: createGame(), bestScore: 20 });
});

test('finished games remain finished after reload', () => {
  const storage = memory();
  const state = { board: [1,2,3,4,5,6,7,8,9], score: 100, mergeCount: 5, maxLevelReached: 9, status: 'game_over' };
  saveGame(state, 200, storage);
  assert.deepEqual(loadGame(storage), { state, bestScore: 200 });
});

test('invalid saved boards reset safely while retaining a valid record', () => {
  const storage = memory();
  storage.setItem('', JSON.stringify({ state: { ...createGame(), board: [1] }, bestScore: 100 }));
  assert.deepEqual(loadGame(storage), { state: createGame(), bestScore: 100 });
  storage.setItem('', '{broken');
  assert.deepEqual(loadGame(storage), { state: createGame(), bestScore: 0 });
});

test('unavailable storage does not prevent playing', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadGame(storage), { state: createGame(), bestScore: 0 });
  assert.equal(saveGame(createGame(), 0, storage), false);
});
