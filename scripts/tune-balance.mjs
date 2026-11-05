import { CONFIG } from '../game.js';
import { optimalPolicy } from './search-reachability.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function balanceSpawns(maximum, config) {
  const p=config.spawnBoostMaxChance*Math.min(1,Math.max(0,(maximum-config.spawnBoostStartsAt)/config.spawnBoostRampLevels));
  const higher=Math.max(2,maximum-config.spawnBoostLevelGap);
  const result=new Map();
  for(const [base,weight] of [[1,1-p],[higher,p]]) for(const [offset,chance] of [[0,CONFIG.spawnLowerLevelProbability],[1,1-CONFIG.spawnLowerLevelProbability]]) {
    if(weight*chance>0) result.set(base+offset,(result.get(base+offset)??0)+weight*chance);
  }
  return [...result].map(([level,probability])=>({level,probability}));
}

export function candidateGraph(config,{limit=400000,target=13}={}) {
  const board=[...CONFIG.initialBoard].sort((a,b)=>a-b);
  const nodes=[{board,actions:[]}];
  const seen=new Map([[board.join(','),0]]);
  for(let head=0;head<nodes.length;head++) {
    const {board,actions}=nodes[head];
    if(board.at(-1)>=target) continue;
    for(let i=0;i<board.length-1;i++) {
      if(board[i]!==board[i+1] || i>0&&board[i]===board[i-1]) continue;
      const mergedLevel=board[i];
      const outcomes=[];
      for(const spawn of balanceSpawns(Math.max(board.at(-1),mergedLevel+1),config)) {
        const next=[...board];next[i]=spawn.level;next[i+1]=mergedLevel+1;next.sort((a,b)=>a-b);
        const key=next.join(',');
        let index=seen.get(key);
        if(index===undefined) {
          if(nodes.length>=limit) return null;
          index=nodes.length;seen.set(key,index);nodes.push({board:next,actions:[]});
        }
        outcomes.push({index,probability:spawn.probability});
      }
      actions.push({mergedLevel,outcomes});
    }
  }
  return {nodes};
}

export async function main(args=process.argv.slice(2)) {
  const targets=[.4,.1,.02,.002];
  const results=[];
  let best;
  for(const cap of [.01,.015,.02,.025,.03,.04]) {
    const config={spawnBoostStartsAt:5,spawnBoostRampLevels:5,spawnBoostMaxChance:cap,spawnBoostLevelGap:2};
    const graph=candidateGraph(config);
    if(!graph) { const result={config,incomplete:true};results.push(result);console.log(JSON.stringify(result));continue; }
    const probabilities=[10,11,12,13].map(level=>optimalPolicy(graph,level).probability);
    const loss=probabilities.some(p=>p===0)?Infinity:probabilities.reduce((sum,p,i)=>sum+Math.log(p/targets[i])**2,0);
    const result={config,states:graph.nodes.length,probabilities,loss:Number.isFinite(loss)?loss:null,incomplete:false};
    results.push(result);
    console.log(JSON.stringify(result));
    if(Number.isFinite(loss)&&(!best||loss<best.loss)) best=result;
  }
  const at=args.indexOf('--output');
  const output=resolve(at>=0?args[at+1]:'/tmp/jabu-balance-tuning.json');
  const report={targets,best,results,explanation:'Exact optimal-policy dynamic programming; target13 states are absorbing. Incomplete state-limited candidates are excluded from selection. Probabilities describe optimal play, not typical play. Search covers the listed parameter grid, not all possible balance rules.'};
  await writeFile(output,JSON.stringify(report,null,2));
  if(args.includes('--apply')) {
    if(!best) throw new Error('No completely evaluated candidate');
    const gamePath=new URL('../game.js',import.meta.url);
    let source=await readFile(gamePath,'utf8');
    for(const [name,value] of Object.entries(best.config)) {
      const pattern=new RegExp(`(${name}:\\s*)(\\d+(?:\\.\\d+)?)(\\s*,)`,'g');
      if([...source.matchAll(pattern)].length!==1) throw new Error(`Expected exactly one numeric CONFIG field: ${name}`);
      source=source.replace(pattern,(_match,prefix,_old,suffix)=>`${prefix}${value}${suffix}`);
    }
    await writeFile(gamePath,source);
  }
  console.log(JSON.stringify({best,output}));
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
