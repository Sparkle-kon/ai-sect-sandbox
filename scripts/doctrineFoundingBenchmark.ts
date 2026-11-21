import {campaignSHA256} from '../src/engine/campaignMemento';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {foundActor,foundPayload,foundSect,foundSite,foundTurn,foundingFixture,preparedDoctrineFounding}
  from '../tests/fixtures/doctrineFoundingNativeFixture';
import type {DoctrineFoundingMove,DoctrineMaturityMove,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const f=foundingFixture, founder=f.authorId, parent=f.parentId, leader=f.leaderId;
const [a,b]=f.members.filter(id=>id!==founder);
const p=preparedDoctrineFounding();
const charter=(w:WorldState)=>w.doctrineFoundings.foundings[0];
const before=foundTurn(p.world,{[founder]:foundPayload('DOCTRINE_FOUNDING',{
  doctrineFoundingMove:'propose',targetDoctrineSchoolId:p.schoolId,targetRelocationId:p.relocationId})});
const id=charter(before).id,child=charter(before).independentSectId;
const sign=(doctrineFoundingMove:DoctrineFoundingMove)=>foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove,targetDoctrineFoundingId:id});
const mature=(doctrineMaturityMove:DoctrineMaturityMove)=>foundPayload('DOCTRINE_MATURITY',{doctrineMaturityMove,targetDoctrineFoundingId:id});
const approved=foundTurn(before,{[leader]:sign('authorize'),[a]:sign('join'),[b]:sign('join')});
const founded=foundTurn(approved,{[founder]:sign('establish')});
if(charter(founded).status!=='established')throw Error('没有取得原生立宗凭据。');
const claim=foundSite(founded,f.oldSiteId);
const point={x:claim.x,y:claim.y};
const weather=(world:WorldState)=>applyMapBrush(world,'cursed_miasma',[point]);
const risk=foundTurn(foundTurn(foundTurn(weather(weather(founded)))));
const mergedProposal=foundTurn(risk,{[founder]:mature('offer_merge')});
const recovered=foundTurn(foundTurn(mergedProposal));
const renewedRisk=weather(mergedProposal);
const accept=foundTurn(renewedRisk,{[leader]:mature('accept_merge'),[a]:mature('approve_member')});
const all=foundTurn(accept,{[b]:mature('approve_member')});
const merged=foundTurn(all,{[founder]:mature('finalize_merge')});
let selective=founded;
for(let i=0;i<3;i++)selective=executeGodIntervention(selective,{type:'TRIBULATION_STRIKE',targetCultivatorId:founder});
const successor=foundTurn(applyMapBrush(selective,'meteor',[point]));
let none=risk;
for(const actorId of f.members)for(let i=0;i<4;i++)none=executeGodIntervention(none,{type:'TRIBULATION_STRIKE',targetCultivatorId:actorId});
const dispersed=foundTurn(applyMapBrush(none,'meteor',[point]));
if(charter(merged).maturity?.settlement?.kind!=='merged'||charter(dispersed).maturity?.settlement?.kind!=='dispersed'||
    !charter(successor).continuity||charter(recovered).maturity?.offers[0]?.status!=='invalidated')
  throw Error('未取得完整原生续宗对照。');
for(const [label,w] of [['established',founded],['safe_recovery_invalidates_offer',recovered],['merged',merged],
    ['native_successor',successor],['dispersed',dispersed]] as const){
  const raw=encodeEraWorldSave(w);
  if(encodeEraWorldSave(decodeEraWorldSave(raw))!==raw)throw Error('读回原生旧宗状态不一致。');
  const receipt=charter(w), sect=foundSect(w,child), prior=foundSect(w,parent);
  console.log(JSON.stringify({label,seed:w.random.seed,rule:__SECT_UTILITY_RULE_VERSION__,tick:w.tick,year:w.year,month:w.month,
    child:{name:sect.name,leader:sect.leaderId?foundActor(w,sect.leaderId).name:null,stones:sect.spiritStones,
      title:foundSite(w,f.oldSiteId).ownerSectId===child,archived:sect.inactiveSinceTick!==undefined},
    parent:{name:prior.name,heldOriginalCopy:prior.pavilion.some(item=>item.id===p.originalId)},
    foundation:{opened:receipt.proposedTick,authorized:receipt.authorization?.tick,established:receipt.settlement?.tick,
      signers:receipt.settlement?.memberIds?.length,transfer:receipt.settlement?.transferredStones},
    closure:receipt.maturity?.settlement,offerStatus:receipt.maturity?.offers.at(-1)?.status,successor:receipt.continuity,
    sha:await campaignSHA256(new TextEncoder().encode(raw)),byteExactRestore:true,bytes:new TextEncoder().encode(raw).length}));
}
