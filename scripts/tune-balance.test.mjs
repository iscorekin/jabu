import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, getSpawnMix, spawnLevel } from '../game.js';
import { balanceSpawns, candidateGraph } from './tune-balance.mjs';

test('tuning model matches every installed game probability branch',()=>{
  for(let max=1;max<=20;max++) {
    const mix=getSpawnMix(max);
    const expected=new Map();
    const pairs=mix.higherPairChance>0
      ? [[mix.higherPairChance/2,mix.higherPairChance],[(1+mix.higherPairChance)/2,1-mix.higherPairChance]]
      : [[null,1]];
    for(const [pair,p] of pairs) for(const [rarity,q] of [[CONFIG.spawnLowerLevelProbability/2,CONFIG.spawnLowerLevelProbability],[(1+CONFIG.spawnLowerLevelProbability)/2,1-CONFIG.spawnLowerLevelProbability]]) {
      if(p*q===0) continue;
      const rolls=pair===null?[rarity]:[pair,rarity];let i=0;
      const level=spawnLevel(max,()=>rolls[i++]);
      expected.set(level,(expected.get(level)??0)+p*q);
    }
    const actual=new Map(balanceSpawns(max,CONFIG).map(o=>[o.level,o.probability]));
    assert.deepEqual([...actual.keys()].sort(),[...expected.keys()].sort());
    for(const [level,p] of expected) assert.ok(Math.abs(actual.get(level)-p)<1e-14);
    if(mix.higherPairChance<1) { assert.ok(actual.get(1)>0);assert.ok(actual.get(2)>0); }
    assert.ok(Math.abs([...actual.values()].reduce((s,p)=>s+p,0)-1)<1e-14);
  }
});

test('incomplete search is signaled and never returned as a complete graph',()=>{
  assert.equal(candidateGraph(CONFIG,{limit:1}),null);
});

test('optimizer cannot introduce high-level spawns before their milestones',()=>{
  for(const cap of [.01,.025,.04,1]) {
    const config={...CONFIG,spawnBoostMaxChance:cap};
    for(const [maximum,allowed] of [[6,3],[8,3],[9,4],[11,4],[12,5],[14,5]]) {
      assert.ok(balanceSpawns(maximum,config).every(outcome=>outcome.level<=allowed));
    }
  }
});
