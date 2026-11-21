import {campaignSHA256} from '../src/engine/campaignMemento';
import {createInitialWorld} from '../src/data/initialWorld';
import {ERA_DESIGN_STORAGE_KEY,createEraDesignDraft,encodeEraDesignDraft,previewEraDesignDraft,readEraDesignDraft,writeEraDesignDraft}
  from '../src/engine/eraDesignDraft';
import {encodeWorldSave} from '../src/engine/storageEngine';

const live=createInitialWorld(2031);
const before=encodeWorldSave(live);
const anchor={year:live.year,month:live.month};
const target={year:1021,month:3};
const north='loc-vein-north';
const members=['npc-6','elder-danxia-1','elder-danxia-2'];
const make=(spiritQi:number)=>createEraDesignDraft(2031,'classic',anchor,target,[
  {kind:'jade_vein_depleted',siteId:north,spiritQi,jadeCapacity:0},
  {kind:'danxia_branch_moves_north',destinationId:north,memberIds:members,stones:120},
]);
const textMap=new Map([['existing-world-slot','fixture-unmodified']]);
const storage={getItem:(key:string)=>textMap.get(key)??null,setItem:(key:string,value:string)=>{textMap.set(key,value);}};
for(const [label,draft,currentDate] of [
    ['compatible',make(50),anchor],['insufficient_local_support',make(35),anchor],['older_draft_reopened',make(50),{year:1022,month:1}],
  ] as const){
  if(!writeEraDesignDraft(draft,storage))throw Error('没有写成草案；原局不应被替换。');
  const saved=readEraDesignDraft(storage);
  if(!saved||encodeEraDesignDraft(saved)!==encodeEraDesignDraft(draft)||textMap.get('existing-world-slot')!=='fixture-unmodified'||
      textMap.size!==2||!textMap.has(ERA_DESIGN_STORAGE_KEY)||encodeWorldSave(live)!==before)
    throw Error('草案与游玩档意外混用。');
  const plan=previewEraDesignDraft(saved,currentDate);
  console.log(JSON.stringify({label,seed:draft.seed,start:draft.anchor,target:draft.target,months:plan.monthsAhead,
    compatible:plan.ready,issues:plan.issues.map(issue=>({code:issue.code,severity:issue.severity})),
    conditions:plan.conditions.map(row=>({origin:row.origin,kind:row.kind,site:row.targetName,declaredQi:row.effectiveQi})),
    draftRoundTrip:true,liveTick:live.tick,liveSha:await campaignSHA256(new TextEncoder().encode(before)),unchanged:true}));
}
