import {describe,it,expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeSiegeForActor,adjustSectAffinity,advanceDiplomacy,resolveDiplomacyAction} from '../src/engine/diplomacyEngine';
import {rankOrdinaryIntents} from '../src/engine/ordinaryIntentEngine';
import type {LLMDecisionPayload} from '../src/types/world';
describe('ordinary options must not nominate canonical military duty actors',()=>{
 it('withholds native on-duty attackers from ordinary choices and co-located fellowship suggestions',()=>{
  const world=createInitialWorld(2031),[own,target,ally,other]=world.sects;
  const leader=world.cultivators.find(actor=>actor.id===own.leaderId)!;
  const defender=world.cultivators.find(actor=>actor.id===target.leaderId)!;
  world.diplomacy=[];world.sieges=[];
  for(const actor of world.cultivators){
    actor.locationId=world.sects.find(sect=>sect.id===actor.sectId)!.headquartersId;
    actor.hp=actor.maxHp=500;
    actor.combatPower=actor.sectId===target.id?200:1500;
  }
  const doAct=(chosenAction:LLMDecisionPayload['chosenAction'],targetSectId=target.id)=>
    resolveDiplomacyAction(world,leader,{chosenAction,targetSectId,innerMonologue:'按真实战争规则。'});
  for(const friendly of [ally,other]){
    adjustSectAffinity(world,own.id,friendly.id,60);
    expect(doAct('OFFER_ALLIANCE',friendly.id)).not.toBeNull();
  }
  adjustSectAffinity(world,own.id,target.id,-60);
  expect(doAct('DECLARE_WAR')).not.toBeNull();
  world.tick+=3;world.month+=3;
  expect(doAct('LAUNCH_SIEGE')).not.toBeNull();
  for(let i=0;i<2;i++){world.tick++;world.month++;advanceDiplomacy(world,()=>.5);}
  expect(activeSiegeForActor(world,leader)?.status).toBe('sieging');
  expect(leader.locationId).toBe(defender.locationId);
  expect(rankOrdinaryIntents(world,leader).map(row=>row.action)).toEqual([]);
  expect(rankOrdinaryIntents(world,defender).some(row=>row.action==='SOCIALIZE'&&row.targetCultivatorId===leader.id)).toBe(false);
 });
});
