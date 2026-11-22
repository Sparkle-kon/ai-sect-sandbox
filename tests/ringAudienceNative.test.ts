import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableRingAudienceAims,closeRingAudience,exchangeRingAudience,RING_AUDIENCE_TABOO_TECHNIQUE,sealRingAudience} from '../src/engine/ringAudienceEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualAcceptedAudience,audienceActor,audienceCursor,audienceId,audienceRow,audienceTurn,privateLines} from './ringAudienceNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

describe('multi-turn native ring audience and its subsequent exact execution',()=>{
  it('records multiple same-month real paid turns but does not depart until sealed and the next turn settles',()=>{
    const {initial,opened,world,row,exchangeWorlds}=actualAcceptedAudience();
    const start=audienceActor(initial);
    expect(exchangeWorlds.length).toBeGreaterThan(1);
    expect(opened.playerAvatar.essence).toBe(initial.playerAvatar.essence);
    for(const [index,state] of exchangeWorlds.entries()){
      expect(state.tick).toBe(initial.tick);
      expect(state.playerAvatar.essence).toBe(initial.playerAvatar.essence-3*(index+1));
      expect(audienceRow(state).turns[index]).toMatchObject({tick:initial.tick,cost:3,message:privateLines[index]});
      expect(audienceActor(state)).toEqual(start);
      expect(state.events).toEqual(initial.events);
    }
    expect(row.wavering).toBeGreaterThan(row.initialWavering);
    const cursor=audienceCursor(row);
    expect(exchangeRingAudience(world,{...cursor,expectedTurn:0,message:'这是旧回合。'})).toBe(world);
    expect(sealRingAudience(world,{...cursor,targetId:'npc-7'})).toBe(world);
    const sealed=sealRingAudience(strict(world),cursor);
    expect(sealed).not.toBe(world);
    expect(audienceRow(sealed)).toMatchObject({status:'sealed',sealedTick:world.tick});
    expect(audienceRow(sealed).execution).toBeUndefined();
    expect(sealed.playerAvatar.essence).toBe(world.playerAvatar.essence);
    expect(audienceActor(sealed)).toEqual(start);
    const executed=audienceTurn(sealed),entry=audienceRow(executed);
    expect(entry).toMatchObject({status:'executed',execution:{tick:world.tick+1,effect:'left'}});
    expect(audienceActor(executed).sectId).toBe('');
    expect(audienceActor(executed).locationId).toBe(start.locationId);
    expect(executed.events).toContainEqual(expect.objectContaining({id:entry.execution?.eventId,actorIds:[audienceId]}));
    expect(JSON.stringify(executed.events)).not.toContain(privateLines[0]);
    expect(encodeEraWorldSave(audienceTurn(strict(sealed)))).toBe(encodeEraWorldSave(executed));
    expect(audienceRow(audienceTurn(executed)).execution).toEqual(entry.execution);
  });

  it('teaches the actual forbidden technique to the consenting target only, with a real quiet cost',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    audienceActor(initial).qiProgress=35;
    const {world,row}=actualAcceptedAudience('heaven','learn_taboo',initial);
    expect(audienceActor(world).technique.id).not.toBe(RING_AUDIENCE_TABOO_TECHNIQUE);
    const sealed=sealRingAudience(world,audienceCursor(row));
    const after=audienceTurn(strict(sealed),{[audienceId]:{chosenAction:'CULTIVATE',innerMonologue:'不理此约。'}});
    expect(audienceRow(after)).toMatchObject({status:'executed',execution:{effect:'learned',tick:world.tick+1}});
    expect(audienceActor(after)).toMatchObject({qiProgress:25,techniqueMastery:10,technique:{id:RING_AUDIENCE_TABOO_TECHNIQUE}});
    expect(audienceActor(after).sectId).toBe(audienceActor(world).sectId);
    expect(after.events.find(row=>row.id===audienceRow(after).execution?.eventId)?.witnessScope).toBe('participants');
    strict(after);
  });

  it('uses the actual duel with the current same-site leader and adds no private words to it',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const target=initial.cultivators.find(actor=>availableRingAudienceAims(initial,actor.id,'ring').includes('challenge_master'))!;
    expect(target).toBeDefined();
    const {world,row}=actualAcceptedAudience('ring','challenge_master',initial,target.id);
    expect(row.leaderId).toBeDefined();
    const sealed=sealRingAudience(world,audienceCursor(row));
    const after=audienceTurn(strict(sealed)), result=audienceRow(after);
    expect(result).toMatchObject({status:'executed',execution:{effect:'confronted',tick:world.tick+1}});
    const event=after.events.find(row=>row.id===result.execution?.eventId);
    expect(event?.actorIds).toEqual([target.id,row.leaderId]);
    expect(event?.actorIds).toContain(event?.duelWinnerId);
    for(const message of privateLines)expect(JSON.stringify(event)).not.toContain(message);
    strict(after);
  });

  it('never carries an unsealed or explicitly ended same-month audience into a real departure',()=>{
    const {initial,world,row}=actualAcceptedAudience();
    const closed=closeRingAudience(strict(world),audienceCursor(row));
    expect(closed.playerAvatar.essence).toBe(world.playerAvatar.essence);
    expect(audienceRow(closed).status).toBe('closed');
    const next=audienceTurn(world),declined=audienceTurn(closed);
    for(const branch of [next,declined]){
      expect(audienceActor(branch).sectId).toBe(audienceActor(initial).sectId);
      expect(audienceRow(branch).execution).toBeUndefined();
      expect(sealRingAudience(branch,audienceCursor(row))).toBe(branch);
    }
    expect(audienceRow(next).status).toBe('expired');
  });
});
