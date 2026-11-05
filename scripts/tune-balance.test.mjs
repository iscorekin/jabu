import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, getSpawnMix, spawnLevel } from '../game.js';
import { balanceSpawns, candidateGraph } from './tune-balance.mjs';

test('tuning model matches installed game probability branches and retains base pair',()=>{
  for(let max=1;max<=20;max++) {
    const mix=getSpawnMix(max);
    const expected=new Map();
    const pairs=mix.higherPairChance>0
      ? [[mix.higherPairChance/2,mix.higherPairChance],[(1+mix.higherPairChance)/2,1-mix.higherPairChance]]
      : [[null,1]];
    for(const [pair,p] of pairs) for(const [rarity,q] of [[CONFIG.spawnLowerLevelProbability/2,CONFIG.spawnLowerLevelProbability],[(1+CONFIG.spawnLowerLevelProbability)/2,1-CONFIG.spawnLowerLevelProbability]]) {
      const rolls=pair===null?[rarity]:[pair,rarity];let i=0;
      const level=spawnLevel(max,()=>rolls[i++]);
      expected.set(level,(expected.get(level)??0)+p*q);
    }
    const actual=new Map(balanceSpawns(max,CONFIG).map(o=>[o.level,o.probability]));
    assert.deepEqual([...actual.keys()].sort(),[...expected.keys()].sort());
    for(const [level,p] of expected) assert.ok(Math.abs(actual.get(level)-p)<1e-14);
    assert.ok(actual.get(1)>0);
    assert.ok(actual.get(2)>0);
    assert.ok(Math.abs([...actual.values()].reduce((s,p)=>s+p,0)-1)<1e-14);
  }
});

test('incomplete search is signaled and never returned as a complete graph',()=>{
  assert.equal(candidateGraph(CONFIG,{limit:1}),null);
});
