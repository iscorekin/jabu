import { CONFIG, createGame, getSpawnMix, mergeGame, spawnLevel } from '../game.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sorted = board => [...board].sort((a,b) => a-b);
const key = board => board.join(',');
const mass = board => board.reduce((sum, level) => sum + 2 ** level, 0);

// Partition both independent uniform draws at the actual game's thresholds.
// Keep one concrete RNG sequence for replay, aggregating identical spawns.
export function spawnOutcomes(maximum) {
  const { higherPairChance: p } = getSpawnMix(maximum);
  const intervals = threshold => [[0, threshold], [threshold, 1]]
    .filter(([a,b]) => b > a).map(([a,b]) => ({ roll: (a+b)/2, probability: b-a }));
  const pairs = p > 0 ? intervals(p) : [{ roll: null, probability: 1 }];
  const outcomes = new Map();
  for (const pair of pairs) for (const rarity of intervals(CONFIG.spawnLowerLevelProbability)) {
    const rolls = pair.roll === null ? [rarity.roll] : [pair.roll, rarity.roll];
    let cursor = 0;
    const level = spawnLevel(maximum, () => rolls[cursor++]);
    const probability = pair.probability * rarity.probability;
    const previous = outcomes.get(level);
    if (previous) previous.probability += probability;
    else outcomes.set(level, { level, probability, rolls });
  }
  return [...outcomes.values()];
}

// The generic model also permits independent small-model exhaustive tests.
export function enumerate(initialBoard, outcomesForMaximum = spawnOutcomes, { stopAt = 13 } = {}) {
  const initial = sorted(initialBoard);
  const nodes = [{ board: initial, parent: null, actions: [] }];
  const seen = new Map([[key(initial), 0]]);
  let transitions = 0;
  for (let head = 0; head < nodes.length; head++) {
    const node = nodes[head];
    const board = node.board;
    if (board.at(-1) >= stopAt) continue; // Success is absorbing; the game itself stays uncapped.
    for (let i = 0; i < board.length-1; i++) {
      if (board[i] !== board[i+1] || (i > 0 && board[i] === board[i-1])) continue;
      const mergedLevel = board[i];
      const outcomes = [];
      for (const spawn of outcomesForMaximum(Math.max(board.at(-1), mergedLevel+1))) {
        if (spawn.probability <= 0) continue;
        const next = [...board];
        next[i] = spawn.level;
        next[i+1] = mergedLevel+1;
        next.sort((a,b) => a-b);
        if (mass(next) <= mass(board)) throw new Error('Mass must strictly increase');
        let index = seen.get(key(next));
        if (index === undefined) {
          index = nodes.length;
          seen.set(key(next), index);
          nodes.push({ board: next, parent: { index: head, mergedLevel, spawnedLevel: spawn.level, rolls: spawn.rolls }, actions: [] });
        }
        outcomes.push({ index, probability: spawn.probability });
        transitions++;
      }
      if (Math.abs(outcomes.reduce((s,o) => s+o.probability,0)-1) > 1e-12) throw new Error('Invalid probability sum');
      node.actions.push({ mergedLevel, outcomes });
    }
  }
  return { nodes, transitions, stopAt };
}

export function optimalPolicy(graph, target) {
  const { nodes } = graph;
  const values = new Float64Array(nodes.length);
  const actions = new Int32Array(nodes.length).fill(-1);
  const order = nodes.map((_,i) => i).sort((a,b) => mass(nodes[b].board)-mass(nodes[a].board));
  for (const index of order) {
    if (nodes[index].board.at(-1) >= target) { values[index] = 1; continue; }
    nodes[index].actions.forEach((action,a) => {
      const value = action.outcomes.reduce((s,o) => s+o.probability*values[o.index],0);
      if (actions[index] === -1 || value > values[index]) { values[index] = value; actions[index] = a; }
    });
  }
  return { probability: values[0], values, actions };
}

export function witness(graph, target) {
  let index = graph.nodes.findIndex(node => node.board.at(-1) >= target);
  if (index === -1) return null;
  const steps = [];
  while (graph.nodes[index].parent) {
    const node = graph.nodes[index];
    steps.push({ ...node.parent, board: node.board });
    index = node.parent.index;
  }
  return steps.reverse();
}

export function replay(steps) {
  let state = createGame();
  for (const step of steps) {
    const source = state.board.indexOf(step.mergedLevel);
    const target = state.board.indexOf(step.mergedLevel,source+1);
    let cursor = 0;
    const result = mergeGame(state,source,target,() => {
      if (cursor >= step.rolls.length) throw new Error('Unexpected RNG draw');
      return step.rolls[cursor++];
    });
    if (!result.success || key(sorted(result.state.board)) !== key(step.board)) throw new Error('Witness replay mismatch');
    state = result.state;
  }
  return state;
}

async function main() {
  const args = process.argv.slice(2);
  const targetAt = args.indexOf('--target');
  const target = Number(targetAt >= 0 ? args[targetAt+1] : args.find(a => /^\d+$/.test(a)) ?? 13);
  if (!Number.isSafeInteger(target) || target < 1) throw new Error('Target must be a positive integer');
  const outputAt = args.indexOf('--output') >= 0 ? args.indexOf('--output') : args.indexOf('--out');
  const output = resolve(outputAt >= 0 ? args[outputAt+1] : '/tmp/jabu-search');
  const graph = enumerate(createGame().board, spawnOutcomes, { stopAt: Math.max(13, target) });
  const maximum = graph.nodes.reduce((best,node) => Math.max(best,node.board.at(-1)),0);
  const highestWitness = witness(graph,maximum);
  const targetWitness = witness(graph,target);
  const policyTarget = targetWitness === null ? maximum : target;
  const policy = optimalPolicy(graph,policyTarget);
  const summary = {
    target, policyTarget, exhaustive: true, stopAt: graph.stopAt, reachableBoards: graph.nodes.length, transitions: graph.transitions,
    terminalBoards: graph.nodes.filter(node => node.actions.length === 0 && node.board.at(-1) < graph.stopAt).length,
    successBoards: graph.nodes.filter(node => node.board.at(-1) >= graph.stopAt).length,
    maximumReachableLevel: maximum, targetReachable: targetWitness !== null,
    optimalChance: Object.fromEntries([...new Set([10,11,12,13,target])].map(level => [level,optimalPolicy(graph,level).probability])),
    witnessMerges: highestWitness.length, witnessReplayed: replay(highestWitness).maxLevelReached === maximum,
    explanation: 'All reachable sorted boards before the target, every distinct equal-level merge, and every positive-probability spawn are exhausted. Reaching stopAt is absorbing, since that already succeeds. Positions have no effect on moves. The board maximum never decreases and equals historical maximum from the initial game. Each edge strictly increases sum(2**level), allowing backward dynamic programming. Probabilities use floating point; reachability does not depend on rounding.',
  };
  await mkdir(output,{ recursive:true });
  await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2));
  await writeFile(resolve(output,'witnesses.json'),JSON.stringify({ initialBoard: createGame().board, highest: highestWitness, target: targetWitness },null,2));
  await writeFile(resolve(output,'policy.json'),JSON.stringify({ target: policyTarget, requestedTarget: target, initialBoard: sorted(createGame().board), states: graph.nodes.map((node,i) => ({ board: node.board, probability: policy.values[i], mergedLevel: policy.actions[i] < 0 ? null : node.actions[policy.actions[i]].mergedLevel, goalReached: node.board.at(-1) >= policyTarget })) }));
  console.log(JSON.stringify({ ...summary, output },null,2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
