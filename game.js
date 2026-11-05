export const CONFIG = Object.freeze({
  boardSize: 9,
  spawnLowerLevelProbability: 0.85,
  spawnProgressionStartsAt: 6,
  spawnLevelsPerStep: 10,
  pointsMultiplier: 10,
  initialBoard: Object.freeze([1, 1, 2, 1, 2, 3, 2, 3, 1]),
});

export function getSpawnMix(maxLevelReached) {
  const progress = Math.max(0, maxLevelReached - CONFIG.spawnProgressionStartsAt);
  return {
    lowerLevel: 1 + Math.floor(progress / CONFIG.spawnLevelsPerStep),
    higherPairChance: (progress % CONFIG.spawnLevelsPerStep) / CONFIG.spawnLevelsPerStep,
  };
}

export function spawnLevel(maxLevelReached, rng = Math.random) {
  const { lowerLevel, higherPairChance } = getSpawnMix(maxLevelReached);
  const pairOffset = higherPairChance > 0 && rng() < higherPairChance ? 1 : 0;
  return lowerLevel + pairOffset + (rng() < CONFIG.spawnLowerLevelProbability ? 0 : 1);
}

export function hasAvailableMerge(board) {
  return new Set(board).size < board.length;
}

export function createGame() {
  return {
    board: [...CONFIG.initialBoard],
    score: 0,
    mergeCount: 0,
    maxLevelReached: Math.max(...CONFIG.initialBoard),
    status: 'playing',
  };
}

export function mergeGame(state, source, target, rng = Math.random) {
  if (
    state.status !== 'playing' ||
    !Number.isInteger(source) ||
    !Number.isInteger(target) ||
    source === target ||
    source < 0 || source >= CONFIG.boardSize ||
    target < 0 || target >= CONFIG.boardSize ||
    state.board[source] !== state.board[target]
  ) {
    return { success: false, state, newLevel: null, points: 0 };
  }

  const level = state.board[source];
  const newLevel = level + 1;
  const maxLevelReached = Math.max(state.maxLevelReached, newLevel);
  const points = CONFIG.pointsMultiplier * 2 ** level;
  const board = [...state.board];
  board[target] = newLevel;
  board[source] = spawnLevel(maxLevelReached, rng);

  return {
    success: true,
    state: {
      ...state,
      board,
      score: state.score + points,
      mergeCount: state.mergeCount + 1,
      maxLevelReached,
      status: hasAvailableMerge(board) ? 'playing' : 'game_over',
    },
    newLevel,
    points,
  };
}
