import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {ScribeCommissionRead,reviewedScribeCommission} from '../src/components/ScribeCommissionRead';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarScribeCommission} from '../src/engine/avatarEngine';
import {availableScribeCommissionActions,type ScribeCommissionOption} from '../src/engine/scribeCommissionEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候原卷。'};
const body=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const turn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),()=>.99,'utility');
const payload=(c:ScribeCommissionOption):LLMDecisionPayload=>({chosenAction:c.action,innerMonologue:rest.innerMonologue,
  scribeCommissionMove:c.scribeCommissionMove,...(c.scribeCommissionMove==='offer'?
    {targetCultivatorId:c.targetCultivatorId,targetChronicleSourceId:c.targetChronicleSourceId}:
    {targetScribeCommissionId:c.targetScribeCommissionId})});
function setup(){
  let world=createInitialWorld(106);
  const site=world.settlements.villages.find(row=>row.locationId==='loc-market')!;
  const [donor,scribe,outsider]=world.cultivators;
  for(const who of [donor,scribe]){
    who.locationId=site.locationId;who.hp=who.maxHp;who.spiritStones=100;who.herbs.jade_leaf=4;
  }
  outsider.locationId='loc-market-east';
  site.stress=80;
  world=turn(world,{[donor.id]:{...rest,chosenAction:'DELIVER_RELIEF',targetSettlementId:site.id}});
  const source=world.chronicleErrata.sources.find(row=>row.kind==='relief')!;
  expect(source).toBeTruthy();
  const offer=availableScribeCommissionActions(body(world,donor.id),world,world.tick+1)
    .find(option=>option.scribeCommissionMove==='offer'&&option.targetCultivatorId===scribe.id&&option.targetChronicleSourceId===source.sourceEventId);
  if(!offer||offer.scribeCommissionMove!=='offer')throw Error('Missing exact local source or named scribe');
  return {world,patronId:donor.id,scribeId:scribe.id,outsiderId:outsider.id,offer};
}
function quote(world:WorldState,actorId:string,move:ScribeCommissionOption['scribeCommissionMove']){
  const option=availableScribeCommissionActions(body(world,actorId),world,world.tick+1).find(row=>row.scribeCommissionMove===move);
  expect(option).toBeTruthy();return option!;
}
function read(world:WorldState,actorId:string){
  return renderToStaticMarkup(<ScribeCommissionRead world={world} viewer={body(world,actorId)}/>);
}
it('only an actual next-month avatar queue uses essence, survives strict restore, and creates an unfunded offer',()=>{
  let {world,offer,patronId,scribeId}=setup();
  expect(queueAvatarScribeCommission(world,patronId,offer)).toBe(false);
  expect(possessAvatar(world,patronId)).toBe(true);
  const balance=body(world,patronId).spiritStones,essence=world.playerAvatar.essence;
  expect(queueAvatarScribeCommission(world,scribeId,offer)).toBe(false);
  const wrong:ScribeCommissionOption={action:'SCRIBE_COMMISSION',scribeCommissionMove:'offer',
    targetChronicleSourceId:offer.targetChronicleSourceId,targetCultivatorId:'wrong-person'};
  expect(queueAvatarScribeCommission(world,patronId,wrong)).toBe(false);
  expect(queueAvatarScribeCommission(world,patronId,offer)).toBe(true);
  expect(queueAvatarScribeCommission(world,patronId,offer)).toBe(false);
  expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
  expect(body(world,patronId).spiritStones).toBe(balance);
  expect(world.scribeCommissions).toBeUndefined();
  const raw=encodeEraWorldSave(world);
  world=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(world)).toBe(raw);
  world=turn(world);
  expect(world.scribeCommissions?.commissions[0]).toMatchObject({status:'offered',escrowStones:0});
  expect(read(world,patronId)).toContain('没有实扣托管');
  expect(read(world,scribeId)).toContain('本人承写');
});
it('keeps the finished sourced scene private and shows the proof separately only after native delivery',()=>{
  let {world,offer,patronId,scribeId,outsiderId}=setup();
  if(offer.scribeCommissionMove!=='offer')throw Error('Expected physical source offer');
  const retell:LLMDecisionPayload={...rest,chosenAction:'CHRONICLE_ERRATA',chronicleErrataMove:'retell',
    targetChronicleSourceId:offer.targetChronicleSourceId,chronicleReliefReading:'full_supplies'};
  world=turn(world,{[patronId]:retell});
  world=turn(world,{[scribeId]:{...retell,chronicleReliefReading:'unfunded'}});
  expect(world.eraHeritage?.facts.find(fact=>fact.source.sourceEventId===retell.targetChronicleSourceId)?.retellings).toHaveLength(2);
  world=turn(world,{[patronId]:payload(offer)});
  expect(read(world,outsiderId)).toBe('');
  expect(read(world,patronId)).not.toContain('交付原稿');
  expect(possessAvatar(world,scribeId)).toBe(true);
  const current=()=>world.scribeCommissions!.commissions[0];
  const perform=(move:'accept'|'verify'|'deliver',expectedEscrow:number)=>{
    const funds=body(world,patronId).spiritStones,wage=body(world,scribeId).spiritStones,essence=world.playerAvatar.essence;
    const choice=quote(world,scribeId,move);
    expect(queueAvatarScribeCommission(world,scribeId,choice)).toBe(true);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(current().escrowStones).toBe(expectedEscrow);
    expect(body(world,patronId).spiritStones).toBe(funds);
    expect(body(world,scribeId).spiritStones).toBe(wage);
    const raw=encodeEraWorldSave(world);
    world=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(world)).toBe(raw);
    world=turn(world);
    expect(world.playerAvatar.pendingOrder).toBeUndefined();
  };
  perform('accept',0);
  expect(read(world,patronId)).toContain('8 灵石托管');
  perform('verify',8);
  expect(read(world,patronId)).toContain('2 灵石购墨');
  expect(read(world,patronId)).not.toContain('看原稿所据与异文');
  perform('deliver',6);
  expect(read(world,outsiderId)).toBe('');
  const html=read(world,patronId);
  expect(html).toContain('6 灵石');
  expect(html).toContain('看原稿所据与异文');
  expect(html).toContain('已核史料');
  expect(html).toContain('坊中赈济开账');
  expect(html).toContain('两则署名传本说法不同');
  expect(html).toContain('记作实物足额交付');
  expect(html).toContain('记作未实付');
  expect(html).not.toContain(world.scribeCommissions!.commissions[0].id);
  expect(html).not.toContain('<button');
});
it('cannot confirm a menu item from an old frame or a duplicate exact row',()=>{
  const {world,offer}=setup(),stage={choice:offer,revision:world};
  expect(reviewedScribeCommission(stage,{},[offer])).toBeUndefined();
  expect(reviewedScribeCommission(stage,world,[offer,offer])).toBeUndefined();
  expect(reviewedScribeCommission(stage,world,[offer])).toEqual(offer);
});
