import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveCeasefireAction} from '../../src/engine/ceasefireEngine';
import {resolveDiplomacyAction} from '../../src/engine/diplomacyEngine';
import {advanceMarkets,marketClosureReason,resolveMarketAction} from '../../src/engine/marketEngine';
import {archiveChronicleEvents,availableChronicleChapter,resolveChronicleChapter} from '../../src/engine/novelGenerator';
import {maintainSectPolitics} from '../../src/engine/sectPoliticsEngine';
import {resolveServiceRetirementAction} from '../../src/engine/serviceRetirementEngine';
import type {WorldEvent,WorldState} from '../../src/types/world';

export const turningPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const siteAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
export function publishTurningFacts(world:WorldState,facts:WorldEvent[]){
  world.events.unshift(...facts);
  archiveChronicleEvents(world,facts);
}
export function sealTurningChapter(world:WorldState){
  const plan=availableChronicleChapter(world,true);
  if(!plan)throw Error('fixture canonical chapter planning');
  const actual=resolveChronicleChapter(world,plan);
  if(!actual)throw Error('fixture canonical chapter seal');
  return actual;
}
export function marketTurningChapter(cross=false){
  const world=createInitialWorld(9);
  const west=siteAt(world,'loc-market'),east=siteAt(world,'loc-market-east');
  if(cross){east.x=west.x+120;east.y=west.y;} // Nearby but independent desks for exact fog coverage below.
  const [buyer,seller,unrelated,outsider]=world.cultivators;
  world.tick=24;world.month=5;
  while(marketClosureReason(world,west.id)||marketClosureReason(world,east.id))world.tick++;
  for(const actor of [buyer,seller,unrelated,outsider]){
    actor.locationId=west.id;actor.spiritStones=1000;actor.pills.foundation=0;actor.guardAssignment=undefined;
  }
  buyer.realm='金丹';
  if(cross)seller.locationId=east.id;
  unrelated.pills.foundation=2;seller.pills.foundation=2;
  outsider.locationId='loc-taixu';
  const place=(actorId:string,side:'buy'|'sell',price:number)=>{
    const row=resolveMarketAction(world,turningPerson(world,actorId),{
      chosenAction:side==='buy'?'PLACE_MARKET_BUY':'PLACE_MARKET_SELL',marketGood:'foundation',marketQuantity:2,
      marketLimitPrice:price,innerMonologue:'只用实物托管成交。',
    });
    if(!row)throw Error('fixture actual order');
    publishTurningFacts(world,[row]);
    return row;
  };
  const isolated=place(unrelated.id,'sell',200),sold=place(seller.id,'sell',20),bought=place(buyer.id,'buy',30);
  const advance=()=>{
    const rows=advanceMarkets(world);
    if(rows.length!==1)throw Error('fixture actual market result');
    publishTurningFacts(world,rows);
    return rows[0];
  };
  const first=advance();
  let result=first;
  if(cross){
    const shipment=world.markets.shipments[0];
    world.tick=shipment.arrivalTick;
    while(marketClosureReason(world,west.id))world.tick++;
    result=advance();
  }
  const chapter=sealTurningChapter(world);
  return {world,chapter,west:west.id,east:east.id,viewerId:buyer.id,outsiderId:outsider.id,
    sourceIds:{buy:bought.id,sell:sold.id,isolated:isolated.id,first:first.id,terminal:result.id}};
}

export function politicalTurningChapter(){
  const world=createInitialWorld(621);
  world.tick=24;world.month=5;
  const sect=world.sects[0];
  const previous=turningPerson(world,sect.leaderId!);
  const viewer=world.cultivators.find(row=>row.sectId===sect.id&&row.id!==previous.id)!;
  previous.locationId=sect.headquartersId;viewer.locationId=sect.headquartersId;
  const retired=resolveServiceRetirementAction(world,previous,{
    chosenAction:'SECT_SERVICE',serviceMove:'retire',innerMonologue:'个人原因没有公开。',
  });
  if(!retired)throw Error('fixture actual private role leave');
  const events=maintainSectPolitics(world);
  publishTurningFacts(world,[retired,...events]);
  const chapter=sealTurningChapter(world);
  const vacancy=events.find(row=>row.id.endsWith('-office-vacant'))!;
  const succession=events.find(row=>row.id.includes('-leadership-vacancy-'))!;
  return {world,chapter,viewerId:viewer.id,vacancyId:vacancy.id,successionId:succession.id,privateId:retired.id};
}

export function troopTurningChapter(){
  const world=createInitialWorld(45);
  world.tick=24;world.month=5;
  const [attacker,defender,ally]=world.sects;
  const from=turningPerson(world,attacker.leaderId!),to=turningPerson(world,defender.leaderId!);
  from.locationId=attacker.headquartersId;to.locationId=defender.headquartersId;
  attacker.spiritStones=5000;defender.spiritStones=300;
  defender.facilities.defense_array=2;defender.arrayMaxHp=400;defender.arrayHp=150;
  world.diplomacy=[
    {sectAId:attacker.id,sectBId:defender.id,pact:'war',affinity:-80,sinceTick:1},
    {sectAId:attacker.id,sectBId:ally.id,pact:'alliance',affinity:70,sinceTick:1},
  ];
  const started=resolveDiplomacyAction(world,from,{
    chosenAction:'LAUNCH_SIEGE',targetSectId:defender.id,innerMonologue:'按真实出征。',
  });
  if(!started)throw Error('fixture native sortie');
  publishTurningFacts(world,[started]);
  world.tick++;
  const offer=resolveCeasefireAction(world,from,{
    chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:defender.id,innerMonologue:'双方各自决定。',
  });
  if(!offer)throw Error('fixture native truce proposal');
  publishTurningFacts(world,[offer]);
  world.tick++;
  const id=world.ceasefires.agreements[0].id;
  const signed=resolveCeasefireAction(world,to,{
    chosenAction:'CEASEFIRE',ceasefireMove:'accept',targetCeasefireId:id,innerMonologue:'真的签署、撤军。',
  });
  if(!signed)throw Error('fixture native signed withdrawal');
  publishTurningFacts(world,[signed]);
  return {world,chapter:sealTurningChapter(world),viewerId:from.id,siegeId:started.id,signedId:signed.id,privateId:offer.id};
}
