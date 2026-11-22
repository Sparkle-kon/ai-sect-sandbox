import { expect } from 'vitest';
import { resolveCeasefireAction } from '../src/engine/ceasefireEngine';
import {createInitialWorld} from '../src/data/initialWorld';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {actualCommonBond,actualPrivateBond,actualPublicBondDuel,bondTurn,firstId,secondId} from "./dramaticBondNativeFixture";
import type { LLMDecisionPayload,WorldState } from '../src/types/world';
import { actualGrandSiege,actualSiege,attackSect,commander,patriarch,siegeActor,siegeTurn } from './grandSiegeNativeFixture';

export function actualGazetteCampaign(){
  const march=actualGrandSiege();
  let closed=march.arrived;
  const reports:WorldState[]=[];
  for(let count=0;count<8&&actualSiege(closed).status==='sieging';count++){
    closed=siegeTurn(closed);
    reports.push(closed);
  }
  const siege=actualSiege(closed);
  expect(siege.status).toBe('victory');
  expect(siege.theatre?.rounds.length).toBeGreaterThan(0);
  expect(siege.theatre?.terminal).toMatchObject({status:'victory',battlefield:true,tick:closed.tick});
  const source=closed.events.find(event=>event.id===siege.theatre?.terminal?.sourceEventId)!;
  expect(source).toMatchObject({tick:closed.tick,title:'攻山告捷',locationId:siege.destinationId});
  return {...march,reports,closed,ended:siege,source};
}

export function actualGazettePeace(){
  const march=actualGrandSiege(1);
  const blank=structuredClone(march.arrived);
  const nativeOffer=resolveCeasefireAction(blank,siegeActor(blank,patriarch),{
    chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:attackSect,innerMonologue:'兵锋未交，只求双方实议。',
  });
  expect(nativeOffer).toMatchObject({tick:blank.tick,witnessScope:'participants'});
  const signed=siegeTurn(blank,{[commander]:{chosenAction:'CEASEFIRE',ceasefireMove:'accept',
    targetCeasefireId:blank.ceasefires.agreements[0].id,innerMonologue:'按当面提出的真实条件罢兵。'}});
  const outcome=signed.sieges.find(siege=>siege.id===march.siege.id)!;
  expect(outcome).toMatchObject({status:'withdrawn',rounds:0,theatre:{terminal:{tick:signed.tick,battlefield:false}}});
  return {signed,outcome,march};
}

export function rotateGazetteHotEvidence(world:WorldState,sourceId:string){
  let current=world;
  for(let month=0;month<78&&current.events.some(row=>row.id===sourceId);month++){
    const witnesses=current.cultivators.filter(row=>row.alive&&row.locationId==='loc-taixu'&&row.positionPlane===undefined);
    const orders:Record<string,LLMDecisionPayload>={};
    for(let idx=0;idx<witnesses.length;idx++){
      if(witnesses.length<2)break;
      orders[witnesses[idx].id]={chosenAction:'SOCIALIZE',targetCultivatorId:witnesses[(idx+1)%witnesses.length].id,
        innerMonologue:'与真实同地的熟人论道。'};
    }
    current=siegeTurn(current,orders);
  }
  expect(current.tick).toBeGreaterThan(world.tick);
  expect(current.events.some(row=>row.id===sourceId)).toBe(false);
  return current;
}

export function actualGazetteYear(){
  const {clash}=actualCommonBond();
  const withPrivate=actualPrivateBond(clash),quiet=bondTurn(clash);
  const privateSource=withPrivate.events.find(row=>row.tick===withPrivate.tick&&row.witnessScope==='participants'&&
    row.actorIds.includes(firstId)&&row.actorIds.includes(secondId))!;
  expect(privateSource).toBeDefined();
  const more=(state:WorldState)=>{
    let warmed=bondTurn(state);
    warmed=bondTurn(warmed);
    const dueling=actualPublicBondDuel(warmed);
    const source=dueling.events.find(row=>row.tick===dueling.tick&&row.duelWinnerId&&row.actorIds.includes(firstId)&&
      row.actorIds.includes(secondId))!;
    expect(source).toMatchObject({locationId:'loc-market',category:'combat'});
    let world=dueling;
    while(world.month<12)world=bondTurn(world);
    const lastDecember=world;
    world=bondTurn(world);
    expect(world.year).toBe(lastDecember.year+1);
    expect(world.month).toBe(1);
    return {world,lastDecember,source};
  };
  const year=more(withPrivate),control=more(quiet);
  const publicBefore=clash.events.find(row=>row.tick===clash.tick&&row.duelWinnerId)!;
  return {...year,control,privateSource,publicBefore};
}

export function actualGazetteBounty(){
  const killer='npc-3',fallen='npc-6',market='loc-market';
  let world=createInitialWorld(1,'spirit-bloom');
  world=siegeTurn(world,{[killer]:{chosenAction:'EXPLORE',targetLocationId:market,innerMonologue:'前往地图上熟悉的坊市。'}});
  expect(siegeActor(world,killer).locationId).toBe(market);
  for(let i=0;i<2;i++)world=executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:fallen});
  expect(siegeActor(world,fallen).hp/siegeActor(world,fallen).maxHp).toBeLessThan(.15);
  world=siegeTurn(world,{[killer]:{chosenAction:'DUEL',targetCultivatorId:fallen,innerMonologue:'对当面的人出手。'}});
  expect(siegeActor(world,fallen).alive).toBe(false);
  expect(world.events).toContainEqual(expect.objectContaining({id:`evt-${world.tick}-${killer}-kill`,duelWinnerId:killer}));
  const bounty=world.bounties.find(row=>row.targetCultivatorId===killer)!;
  expect(bounty).toMatchObject({status:'open',issuedTick:world.tick});
  expect(bounty.escrow.reduce((total,row)=>total+row.amount,0)).toBe(bounty.reward);
  const source=world.events.find(row=>row.id===`evt-${world.tick}-bounty-${bounty.id}`)!;
  expect(source).toMatchObject({tick:world.tick,category:'diplomacy',actorIds:[]});
  while(world.tick<13)world=siegeTurn(world);
  return {world,bounty,source};
}
