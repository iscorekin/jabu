import { createGame, hasAvailableMerge } from './game.js?v=6';

const KEY = 'jabu.save.v1';
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function restoreState(value) {
  if (!value || !Array.isArray(value.board) || value.board.length !== 9 ||
      !value.board.every(level => Number.isSafeInteger(level) && level >= 1) ||
      !nonnegativeInteger(value.score) || !nonnegativeInteger(value.mergeCount) ||
      !Number.isSafeInteger(value.maxLevelReached) ||
      value.maxLevelReached < Math.max(...value.board)) return createGame();
  return {
    board: [...value.board], score: value.score, mergeCount: value.mergeCount,
    maxLevelReached: value.maxLevelReached,
    status: hasAvailableMerge(value.board) ? 'playing' : 'game_over',
  };
}

export function loadGame(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY));
    const state = restoreState(saved?.state);
    const bestScore = Math.max(nonnegativeInteger(saved?.bestScore) ? saved.bestScore : 0, state.score);
    return { state, bestScore };
  } catch {
    return { state: createGame(), bestScore: 0 };
  }
}

export function saveGame(state, bestScore, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify({ state, bestScore: Math.max(bestScore, state.score) }));
    return true;
  } catch {
    // Private browsing, disabled storage, or a full quota must not interrupt play.
    return false;
  }
}
