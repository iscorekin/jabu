import { createGame, mergeGame } from '../game.js';

const runs = Number(process.argv[2] ?? 100000);
if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('Expected a positive number of games');

// Deterministic Mulberry32 generator; separate streams for moves and spawning.
function random(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

for (const policy of ['random', 'highest', 'lowest']) {
  const reach = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 6, 0]));
  let maxReached = 0, truncated = 0, totalMerges = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const spawnRng = random(seed);
    const moveRng = random(seed ^ 0x12345678);
    let state = createGame();
    while (state.status === 'playing' && state.mergeCount < 100000) {
      const pairs = [];
      for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
        if (state.board[i] === state.board[j]) pairs.push([i, j]);
      }
      if (!pairs.length) throw new Error('Playing state has no legal moves');
      let pair;
      if (policy === 'random') pair = pairs[Math.floor(moveRng() * pairs.length)];
      else {
        pairs.sort((a, b) => policy === 'highest'
          ? state.board[b[0]] - state.board[a[0]]
          : state.board[a[0]] - state.board[b[0]]);
        pair = pairs[0];
      }
      state = mergeGame(state, ...pair, spawnRng).state;
    }
    for (const level of Object.keys(reach)) reach[level] += state.maxLevelReached >= Number(level);
    maxReached = Math.max(maxReached, state.maxLevelReached);
    totalMerges += state.mergeCount;
    truncated += state.status === 'playing';
  }
  console.log(JSON.stringify({ policy, runs, reach, maxReached, averageMerges: totalMerges / runs, truncated }));
}
