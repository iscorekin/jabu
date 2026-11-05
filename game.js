export const CONFIG = Object.freeze({
  boardSize: 9,
  spawnLowerLevelProbability: 0.85,
  spawnBoostStartsAt: 5,
  spawnBoostRampLevels: 5,
  spawnBoostMaxChance: 0.025,
  spawnBoostLevelGap: 2,
  pointsMultiplier: 10,
  initialBoard: Object.freeze([1, 1, 2, 1, 2, 3, 2, 3, 1]),
});

export function getSpawnMix(maxLevelReached) {
  const ramp = Math.min(1, Math.max(0,
    (maxLevelReached - CONFIG.spawnBoostStartsAt) / CONFIG.spawnBoostRampLevels));
  return {
    lowerLevel: 1,
    higherLevel: Math.max(2, maxLevelReached - CONFIG.spawnBoostLevelGap),
    higherPairChance: CONFIG.spawnBoostMaxChance * ramp,
  };
}

export function spawnLevel(maxLevelReached, rng = Math.random) {
  const { lowerLevel, higherLevel, higherPairChance } = getSpawnMix(maxLevelReached);
  const base = higherPairChance > 0 && rng() < higherPairChance ? higherLevel : lowerLevel;
  return base + (rng() < CONFIG.spawnLowerLevelProbability ? 0 : 1);
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
