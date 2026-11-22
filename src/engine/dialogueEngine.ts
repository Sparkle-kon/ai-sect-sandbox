import { isChronicleStoryFact } from './chronicleLead';
import { llmScheduler } from './llmScheduler';
import { createPublicDialogueResolver } from './publicDialogueProvenance';
import { personaLine, personaOptions } from './wildPersonaEngine';
import type { Cultivator, DialogueExchange, DialogueTurn, LLMConfig, WorldEvent, WorldState } from '../types/world';

const line = (speaker:Cultivator,text:string):DialogueTurn => ({ speakerId:speaker.id, speakerName:speaker.name, text });

/** spokenLine here is already explicitly authorized for public use by the native caller. */
export function scriptedDialogue(
  kind:DialogueExchange['kind'], actor:Cultivator, target:Cultivator, closing:string, spokenLine?:string, fallen?:Cultivator,
):DialogueExchange {
  const opening=spokenLine?.trim().slice(0,90);
  const turns=[
    line(actor,opening||personaLine(actor,`${kind}_open`)),
    line(target,personaLine(target,`${kind}_reply`)),
  ];
  if(kind==='combat'&&actor.id!==target.id&&fallen&&(fallen===actor||fallen===target)&&!fallen.alive&&fallen.hp===0)
    turns.push(line(fallen,personaLine(fallen,'farewell')));
  turns.push(line(actor,closing));
  return {kind,source:'utility',turns};
}

const isRecord = (value:unknown):value is Record<string,unknown> => typeof value==='object'&&value!==null&&!Array.isArray(value);
const exact = (value:Record<string,unknown>,keys:readonly string[]) =>
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const samePair = (event:WorldEvent) => {
  const turns=event.dialogue?.turns;
  return !!turns&&turns.length>=3&&event.actorIds.length===2&&event.actorIds[0]!==event.actorIds[1]&&
    turns[0].speakerId===event.actorIds[0]&&turns[1].speakerId===event.actorIds[1]&&
    turns.every(turn=>event.actorIds.includes(turn.speakerId));
};

function rewriteOpenings(events:WorldEvent[],replacements:ReadonlyMap<string,readonly string[]>):WorldEvent[] {
  let changed=false;
  const after=events.map(event=>{
    const texts=replacements.get(event.id),dialogue=event.dialogue;
    if(!texts||!dialogue||texts.every((text,index)=>text===dialogue.turns[index].text))return event;
    changed=true;
    return {...event,dialogue:{...dialogue,source:'llm' as const,turns:dialogue.turns.map(
      (turn,index)=>index<2?{...turn,text:texts[index]}:turn
    )}};
  });
  return changed?after:events;
}

/** Legacy explicit, preauthorized lines; never used to interpret third-party model output. */
export function applyDialogueLanguage(events:WorldEvent[],allowedIds:string[],payload:unknown):WorldEvent[] {
  if(!isRecord(payload)||!exact(payload,['exchanges'])||!Array.isArray(payload.exchanges)||payload.exchanges.length>allowedIds.length)
    return events;
  const allowed=new Set(allowedIds), originals=new Map<string,WorldEvent|undefined>(), replacements=new Map<string,string[]>();
  for(const event of events)originals.set(event.id,originals.has(event.id)?undefined:event);
  for(const item of payload.exchanges as unknown[]){
    if(!isRecord(item)||!exact(item,['id','lines'])||typeof item.id!=='string'||!allowed.has(item.id)||replacements.has(item.id)||
        !Array.isArray(item.lines)||item.lines.length!==2) return events;
    const original=originals.get(item.id);
    if(!original||!isChronicleStoryFact(original,original.tick)||!samePair(original)) return events;
    const lines:string[]=[];
    for(const candidate of item.lines as unknown[]){
      if(typeof candidate!=='string')return events;
      const text=candidate.trim();
      if(text.length<2||text.length>90||/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/u.test(text))return events;
      lines.push(text);
    }
    replacements.set(item.id,lines);
  }
  return rewriteOpenings(events,replacements);
}

interface PersonaSlot {
  slot:1|2;
  speakerId:string;
  speakerName:string;
  options:readonly {id:string;text:string}[];
}
interface ApprovedExchange {
  id:string;
  kind:DialogueExchange['kind'];
  slots:readonly [PersonaSlot,PersonaSlot];
}

function currentApprovalMenus(world:WorldState):ApprovedExchange[] {
  const dialogue=createPublicDialogueResolver(world);
  const eventsById=new Map<string,number>(), actors=new Map<string,Cultivator|undefined>(), sites=new Map<string,WorldState['locations'][number]|undefined>();
  for(const event of world.events)eventsById.set(event.id,(eventsById.get(event.id)??0)+1);
  for(const actor of world.cultivators)actors.set(actor.id,actors.has(actor.id)?undefined:actor);
  for(const site of world.locations)sites.set(site.id,sites.has(site.id)?undefined:site);
  const exchanges:ApprovedExchange[]=[];
  for(const event of world.events){
    if(event.tick!==world.tick||event.year!==world.year||event.month!==world.month||event.witnessScope!==undefined||
        event.dialogue?.source!=='utility'||eventsById.get(event.id)!==1||!event.locationId||!samePair(event))continue;
    const site=sites.get(event.locationId);
    if(!site||site.type==='secret_realm'||site.type==='abyss'||site.expeditionOmenId!==undefined)continue;
    const source=dialogue.event(event.id);
    if(source?.status!=='verified')continue;
    const [first,second]=event.actorIds.map(id=>actors.get(id));
    if(!first||!second||first.positionPlane!==undefined||second.positionPlane!==undefined)continue;
    const base=`evt-${world.tick}-${first.id}-`,{kind}=source;
    if(kind==='combat'){
      if((event.id!==base+'duel'||event.category!=='combat')&&(event.id!==base+'kill'||event.category!=='death'))continue;
      if(event.duelWinnerId!==first.id&&event.duelWinnerId!==second.id)continue;
    }else if(event.category!=='diplomacy'||event.id!==base+kind)continue;
    const menu=(actor:Cultivator,slot:1|2):PersonaSlot=>({
      slot,speakerId:actor.id,speakerName:source.turns[slot-1].speakerName,
      options:personaOptions(actor,slot===1?`${kind}_open`:`${kind}_reply`).map(option=>({
        id:JSON.stringify([event.id,actor.id,slot,option.id]),text:option.text,
      })),
    });
    exchanges.push({id:event.id,kind,slots:[menu(first,1),menu(second,2)]});
    if(exchanges.length===5)break;
  }
  return exchanges;
}

/** Structural allowlist: the model selects authored petals, never writes public prose. */
function selectOpenings(events:WorldEvent[],menus:readonly ApprovedExchange[],payload:unknown):WorldEvent[]|undefined {
  if(!isRecord(payload)||!exact(payload,['exchanges'])||!Array.isArray(payload.exchanges)||
    payload.exchanges.length<1||payload.exchanges.length>menus.length)return undefined;
  const byId=new Map(menus.map(menu=>[menu.id,menu])),replacements=new Map<string,string[]>();
  for(const item of payload.exchanges as unknown[]){
    if(!isRecord(item)||!exact(item,['id','choices'])||typeof item.id!=='string'||replacements.has(item.id)||
      !Array.isArray(item.choices)||item.choices.length!==2)return undefined;
    const menu=byId.get(item.id);
    if(!menu)return undefined;
    const lines:string[]=[];
    for(const [index,choice] of (item.choices as unknown[]).entries()){
      const slot=menu.slots[index];
      if(!isRecord(choice)||!exact(choice,['slot','speakerId','optionId'])||choice.slot!==slot.slot||
          choice.speakerId!==slot.speakerId||typeof choice.optionId!=='string')return undefined;
      const selected=slot.options.find(option=>option.id===choice.optionId);
      if(!selected)return undefined;
      lines.push(selected.text);
    }
    replacements.set(item.id,lines);
  }
  return rewriteOpenings(events,replacements);
}

export async function enrichTickDialogues(world:WorldState,config:LLMConfig):Promise<WorldState>{
  if(!config.enabled||!config.apiKey.trim())return world;
  const originalEvents=world.events, exchanges=currentApprovalMenus(world);
  if(!exchanges.length)return world;
  const boundMenu=JSON.stringify(exchanges);
  try{
    const model=config.model||'gpt-4o-mini';
    const result=await llmScheduler.requestJson<WorldEvent[]>('dialogue',`${config.apiBaseUrl.replace(/\/+$/,'')}/chat/completions`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey.trim()}`},
      signal:AbortSignal.timeout(5000),
      body:JSON.stringify({
        model,
        messages:[
          {role:'system',content:'为虚构修仙对白从给定选项里各选一句，不写新台词。按顺序返回每个事件位置1和2、对应说话者ID及完整选项ID。可以略过整个事件。仅输出JSON：{"exchanges":[{"id":"事件ID","choices":[{"slot":1,"speakerId":"原说话者ID","optionId":"给定选项ID"},{"slot":2,"speakerId":"原说话者ID","optionId":"给定选项ID"}]}]}。'},
          {role:'user',content:boundMenu},
        ],
        temperature:0.5,max_tokens:800,response_format:{type:'json_object'},
      }),
    },{tick:world.tick,model,decode:data=>{
      if(!isRecord(data)||!Array.isArray(data.choices))return undefined;
      const first:unknown=data.choices[0];
      if(!isRecord(first)||!isRecord(first.message)||typeof first.message.content!=='string')return undefined;
      let payload:unknown;
      try{payload=JSON.parse(first.message.content.trim().replace(/^(?:```(?:json)?\s*)|(?:```$)/gi,'').trim());}
      catch{return undefined;}
      if(world.events!==originalEvents||JSON.stringify(currentApprovalMenus(world))!==boundMenu)return undefined;
      return selectOpenings(originalEvents,exchanges,payload);
    }});
    return result.status==='ok'&&result.data!==world.events?{...world,events:result.data}:world;
  }catch{
    return world;
  }
}
