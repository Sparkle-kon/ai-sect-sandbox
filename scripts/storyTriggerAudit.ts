import { runStoryTriggerAudit } from './storyTriggerAuditRunner';
import { storyTriggerAuditPhase19_20 } from './storyTriggerAuditPhase19_20';
import { storyTriggerAuditPhase21_22 } from './storyTriggerAuditPhase21_22';

const probes = [...storyTriggerAuditPhase19_20, ...storyTriggerAuditPhase21_22];
if(probes.length!==40||new Set(probes.map(row=>row.id)).size!==40)throw new Error('Audit coverage must include 40 distinct roadmap items');

const processRef=(globalThis as typeof globalThis&{process?:{argv?:string[]}}).process;
const args=processRef?.argv?.slice(2)??[];
const flags=new Map<string,string>();
for(const arg of args){
  const match=/^--(seed|months|lane)=([^=]+)$/u.exec(arg);
  if(!match||flags.has(match[1]))throw new Error(`Unexpected audit argument: ${arg}`);
  flags.set(match[1],match[2]);
}
const seed=Number(flags.get('seed')??13071);
const ticks=Number(flags.get('months')??1200);
const lane=flags.get('lane')??'autonomous';
if(lane!=='autonomous'&&lane!=='scripted')throw new Error('Audit lane must be autonomous or scripted');

const result=runStoryTriggerAudit({seed,ticks,probes,
  onProgress(progress){console.error(JSON.stringify({kind:'completed-months',...progress}));},
  playHighlights:lane==='scripted'});
console.log(JSON.stringify(result,null,2));
