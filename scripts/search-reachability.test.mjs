import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createGame, spawnLevel } from '../game.js';
import { enumerate, optimalPolicy, spawnOutcomes, witness, replay } from './search-reachability.mjs';

test('spawn partitions reproduce actual RNG branches, aggregate overlap, and sum to one', () => {
  for (const maximum of [3,6,7,10,15,16,17,26]) {
    const outcomes = spawnOutcomes(maximum);
    assert.ok(Math.abs(outcomes.reduce((s,o) => s+o.probability,0)-1) < 1e-14);
    assert.equal(new Set(outcomes.map(o=>o.level)).size,outcomes.length);
    for (const o of outcomes) {
      let i=0;
      assert.equal(spawnLevel(maximum,()=>o.rolls[i++]),o.level);
      assert.ok(o.probability > 0);
    }
  }
  assert.equal(spawnOutcomes(3)[0].probability,CONFIG.spawnLowerLevelProbability);
});

test('canonical graph and policy match independent labeled recursive exhaustive solver', () => {
  const spawns = () => [{level:1,probability:.7},{level:2,probability:.3}];
  // No symmetry reduction or memoization: enumerate every ordered cell pair.
  function brute(board,goal) {
    if (Math.max(...board) >= goal) return 1;
    let best=0;
    for(let a=0;a<board.length;a++) for(let b=0;b<board.length;b++) {
      if(a===b || board[a]!==board[b]) continue;
      let expected=0;
      for(const spawn of spawns()) {
        const next=[...board]; next[b]++; next[a]=spawn.level;
        expected+=spawn.probability*brute(next,goal);
      }
      best=Math.max(best,expected);
    }
    return best;
  }
  for(const initial of [[1,1],[1,1,2],[2,2,1]]) {
    const graph=enumerate(initial,spawns);
    for(const goal of [3,4,5]) {
      const policy=optimalPolicy(graph,goal);
      assert.ok(Math.abs(policy.probability-brute(initial,goal)) < 1e-12);
      graph.nodes.forEach((node,i)=> {
        if(node.board.at(-1)>=goal) { assert.equal(policy.values[i],1); return; }
        const options=node.actions.map(a=>a.outcomes.reduce((s,o)=>s+o.probability*policy.values[o.index],0));
        assert.equal(policy.values[i],Math.max(0,...options));
        if(options.length) assert.equal(options[policy.actions[i]],policy.values[i]);
      });
    }
  }
});

test('real graph exhausts all branches and highest witness replays in real game', () => {
  const graph=enumerate(createGame().board);
  const maximum=graph.nodes.reduce((best,node)=>Math.max(best,node.board.at(-1)),0);
  assert.equal(maximum,13);
  assert.ok(witness(graph,13));
  assert.ok(optimalPolicy(graph,13).probability>0);
  assert.ok(optimalPolicy(graph,11).probability > 0);
  const steps=witness(graph,maximum);
  assert.equal(replay(steps).maxLevelReached,maximum);
  for(const node of graph.nodes) {
    const counts=new Map();
    for(const level of node.board) counts.set(level,(counts.get(level)??0)+1);
    assert.equal(node.actions.length,node.board.at(-1)>=graph.stopAt ? 0 : [...counts.values()].filter(n=>n>=2).length);
    for(const action of node.actions) {
      const maximum=Math.max(node.board.at(-1),action.mergedLevel+1);
      assert.equal(action.outcomes.length,spawnOutcomes(maximum).length);
      assert.ok(Math.abs(action.outcomes.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
      const mass=board=>board.reduce((s,l)=>s+2**l,0);
      for(const o of action.outcomes) assert.ok(mass(graph.nodes[o.index].board)>mass(node.board));
    }
  }
});
