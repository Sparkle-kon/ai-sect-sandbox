import {campaignSHA256} from '../src/engine/campaignMemento';
import {readBranchFateOrigin} from '../src/engine/branchFateComparison';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {verifiableDanxiaScenarioOutcome} from '../src/engine/scenarioDanxiaOutcome';
import type {ScenarioDanxiaOutcome} from '../src/types/world';
import {danxiaSeasonUiFixture} from '../tests/fixtures/danxiaSeasonUiFixture';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const f=danxiaSeasonUiFixture();
const source=readBranchFateOrigin(f.timeline,f.mainId,f.deliveryId,f.throughTick);
if(!source||source.tick!==108)throw Error('未找到实际共同原案。');
for(const [label,world] of [['observed_then_refused',f.left],['signed_delivery_then_renewed',f.right]] as const){
  const row=world.danxiaReviews.reviews.find(review=>review.shortageId===f.shortageId);
  if(!row)throw Error('未找到该支次季核约。');
  const native=encodeEraWorldSave(world);
  if(encodeEraWorldSave(decodeEraWorldSave(native))!==native)throw Error('读回结果不同。');
  const required=['delivered','renewed','switched','refused'] satisfies ScenarioDanxiaOutcome[];
  const goals=Object.fromEntries(required.map(wanted=>[wanted,verifiableDanxiaScenarioOutcome(world,
    {kind:'danxia_medicine_outcome',actorId:f.discipleId,settlementId:f.settlementId,required:wanted},f.throughTick)]));
  console.log(JSON.stringify({label,rule:__SECT_UTILITY_RULE_VERSION__,seed:world.random.seed,originTick:source.tick,
    tick:world.tick,year:world.year,month:world.month,
    disciple:world.cultivators.find(actor=>actor.id===f.discipleId)?.name,
    village:world.settlements.villages.find(place=>place.id===f.settlementId)?.name,
    past:row.source,review:{opened:row.openedTick,proposed:row.proposal?.proposedTick,decided:row.decision?.tick,status:row.status},
    goals,bytes:new TextEncoder().encode(native).length,sha:await campaignSHA256(new TextEncoder().encode(native)),byteExactRestore:true}));
}
