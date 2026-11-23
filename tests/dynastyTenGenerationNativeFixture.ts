import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {availableCultivationClanActions} from '../src/engine/cultivationClanEngine';
import {clanChildActorId} from '../src/engine/cultivationClanTerms';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import {projectProtagonistSuccession,qualifiesProtagonistOpening} from '../src/engine/protagonistSuccession';
import type {ActionType,LLMDecisionPayload} from '../src/types/world';

export function actualTenGenerationDynasty(){
  let world=createInitialWorld(1,'spirit-bloom');
  const site='loc-danxia',founders=world.cultivators.map(row=>row.id),used=new Set<string>();
  const lineage:{generation:number;parent:string;partner:string;childId:string;actorId:string;born:number;adult:number;name:string;earnedTicks:number[]}[]=[];
  const checkpoints:number[]=[];
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候原生月。'};
  const actor=(id:string)=>world.cultivators.find(row=>row.id===id);
  const turn=(choices:Record<string,LLMDecisionPayload>={},draw=.37)=>{
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(person=>[person.id,choices[person.id]??rest])),
      ()=>draw,'utility',undefined,{captureTrace:false,capturePresentation:false});
  };
  const order=(chosenAction:ActionType,fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
    ({chosenAction,...fields,innerMonologue:'只按本人已能作的选择。'});
  function check(truth:unknown,message:string):asserts truth {if(!truth)throw new Error(`${message} (T${world.tick})`);}
  const offer=(id:string,move:ReturnType<typeof availableCultivationClanActions>[number]['clanMove'],target:string)=>{
    const a=actor(id);
    const legal=a&&availableCultivationClanActions(a,world,world.tick+1).find(option=>option.clanMove===move&&
      (option.clanMove==='propose'?option.targetCultivatorId===target:option.targetCultivationUnionId===target));
    check(legal,`No lawful ${move} from ${id} to ${target}`);
    const {action,...fields}=legal;
    return order(action,fields);
  };
  const explore=(targetLocationId:string)=>order('EXPLORE',{targetLocationId});
  const reach=(id:string)=>turn({[id]:explore(site)});
  const reopen=()=>{
    const native=encodeEraWorldSave(world);
    world=decodeEraWorldSave(native);
    check(native===encodeEraWorldSave(world),'Nonexact save round-trip');
    checkpoints.push(world.tick);
  };
  let heir='npc-5';
  for(let generation=2;generation<=10;generation++){
    if(actor(heir)?.locationId!==site)reach(heir);
    const nativeParent=actor(heir);
    check(nativeParent?.alive,'Parent not alive');
    const peers=generation===2?['elder-danxia-2']:founders.filter(id=>{
      const peer=actor(id);return id!==heir&&!used.has(id)&&peer?.alive&&peer.age+2<peer.lifespan;
    });
    let partner:string|undefined;
    for(const candidate of peers){
      if(actor(candidate)?.locationId!==site)reach(candidate);
      if(availableCultivationClanActions(actor(heir)!,world,world.tick+1).some(option=>
        option.clanMove==='propose'&&option.targetCultivatorId===candidate)){partner=candidate;break;}
    }
    check(partner,`No available partner for generation ${generation}`);
    const spouses=[heir,partner];
    for(let count=0;count<30&&spouses.some(id=>actor(id)!.qiProgress<8);count++)
      turn(Object.fromEntries(spouses.filter(id=>actor(id)!.qiProgress<8).map(id=>[id,order('CULTIVATE')])));
    check(spouses.every(id=>actor(id)!.qiProgress>=8),'Unable to earn ceremonial Qi');
    used.add(partner);
    turn({[heir]:offer(heir,'propose',partner)});
    const first=world.cultivationClans?.unions.at(-1);
    check(first?.parents[0]===heir&&first.parents[1]===partner,'Wrong independent parents');
    const id=first.id;
    turn({[partner]:offer(partner,'accept',id)});
    turn({[heir]:offer(heir,'ceremony_offer',id)});
    turn({[partner]:offer(partner,'ceremony',id)});
    turn({[heir]:offer(heir,'family_offer',id)});
    turn({[partner]:offer(partner,'family_accept',id)});
    const readChild=()=>world.cultivationClans?.children.find(row=>row.unionId===id);
    for(let attempt=0;attempt<15&&!readChild();attempt++)turn();
    const child=readChild();
    check(child,'No real birth');
    const born=child.birthTick,actorId=clanChildActorId(child.id);
    check(!actor(actorId)&&child.parentIds[0]===heir&&child.parentIds[1]===partner,'Wrong parents or premature actor');
    check(world.events.some(event=>event.tick===born&&event.id.endsWith(`${id}-birth`)),'No native birth receipt');
    while(world.tick<born+216){check(!actor(actorId),'Premature actor');turn();}
    const adult=actor(actorId);
    check(adult?.alive&&adult.age===18&&readChild()?.maturedTick===born+216,'Incorrect adulthood');
    check(world.events.some(event=>event.tick===world.tick&&event.id.endsWith(`${id}-mature`)),'No native adulthood receipt');
    const earnedTicks=world.cultivationClans?.unions.find(row=>row.id===id)?.plan?.earnedTicks;
    check(earnedTicks?.length===9&&new Set(earnedTicks).size===9&&earnedTicks.at(-1)===born,'Incorrect gestational evidence');
    lineage.push({generation,parent:heir,partner,childId:child.id,actorId,born,adult:world.tick,name:adult.name,earnedTicks:[...earnedTicks]});
    if([4,7,10].includes(generation))reopen();
    heir=actorId;
  }
  const livingAtLastMaturity=world.cultivators.filter(row=>row.alive).length,rosterAtLastMaturity=world.cultivators.length;
  const outgoing='elder-taixu-1',witness='npc-8',market='loc-market',east='loc-market-east';
  check(!projectProtagonistSuccession(world).active,'Family alone incorrectly earned protagonist role');
  turn({[outgoing]:explore(market),[witness]:explore(market)},.1);
  turn({[outgoing]:order('SOCIALIZE',{targetCultivatorId:witness})},.1);
  turn({[outgoing]:explore(east)},.1);
  turn({},.99);
  check(projectProtagonistSuccession(world).active?.actorId===outgoing,'Outgoing protagonist not independently earned');
  reopen();
  for(let count=0;count<4;count++)turn({},.99);
  turn({[heir]:explore(market)},.1);
  turn({[heir]:order('SOCIALIZE',{targetCultivatorId:witness})},.1);
  turn({[heir]:explore(east)},.1);
  for(let count=0;count<18&&projectProtagonistSuccession(world).active?.actorId!==heir;count++)turn({},.99);
  const view=projectProtagonistSuccession(world),next=view.active,archived=view.archived.find(row=>row.actorId===outgoing);
  check(next?.actorId===heir&&archived?.closeReason==='receded'&&next.predecessorArcId===archived.id,'No actual native handoff');
  const arcs=world.protagonistSuccession?.arcs;
  const old=arcs?.find(arc=>arc.id===archived.id),successor=arcs?.find(arc=>arc.id===next.id);
  check(old&&successor&&qualifiesProtagonistOpening(old.opening)&&qualifiesProtagonistOpening(successor.opening),'No independent opening evidence');
  reopen();
  return {world,lineage,checkpoints,livingAtLastMaturity,rosterAtLastMaturity,old,successor};
}
