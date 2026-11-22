import { renderToStaticMarkup } from 'react-dom/server';
import { RoguelikeEncounterCard } from '../src/components/RoguelikeEncounterCard';
import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { regionForPoint } from '../src/engine/simulationRegionGeometry';
import { knownMapLocations } from '../src/engine/terrainEngine';
import { possessAvatar } from '../src/engine/avatarEngine';
import { activeRoguelikeEncounter, resolveGuidedRoguelikeChoice } from '../src/engine/roguelikeEncounterEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';

import {actor, month, other, openNativeGuidedEncounter} from './roguelikeEncounterNativeFixture';

const reOpen=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world);
  const restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
};

describe('guided encounters after an actual native journey',()=>{
  it('binds the offer to its real visiting body and exact active current save, not another actor',()=>{
    const {world,encounter}=openNativeGuidedEncounter();
    expect(activeRoguelikeEncounter(world,actor(world,other))).toBeUndefined();
    const read=renderToStaticMarkup(<RoguelikeEncounterCard encounter={encounter} actorName={actor(world).name}
      siteName={world.locations.find(site=>site.id===encounter.siteId)!.name} busy={false}
      onChoose={()=>undefined} onContinue={()=>undefined}/>);
    expect(read).toContain('半途奇遇');
    expect(read).toContain('aria-label="这一步如何走"');
    expect(read.match(/<button\b/g)).toHaveLength(3);
    const restored=reOpen(world);
    expect(activeRoguelikeEncounter(restored,actor(restored))).toEqual(encounter);
    const released=reOpen(world);
    expect(possessAvatar(released,null)).toBe(true);
    expect(resolveGuidedRoguelikeChoice(released,encounter.id,'cautious')).toBe(released);
    expect(resolveGuidedRoguelikeChoice(restored,'not-this-encounter','cautious')).toBe(restored);
  });

  it('accepts one immutable exact native choice and leaves explicit refusal once without advancing the month',()=>{
    const {world,encounter}=openNativeGuidedEncounter();
    for(const choice of ['cautious','bold','leave'] as const){
      const presented=reOpen(world);
      const output=resolveGuidedRoguelikeChoice(presented,encounter.id,choice);
      expect(output).not.toBe(presented);
      expect([output.tick,output.year,output.month]).toEqual([world.tick,world.year,world.month]);
      expect(output.roguelikeEncounters).toContainEqual(expect.objectContaining({
        id:encounter.id,status:'resolved',choice,resolvedTick:world.tick,outcome:expect.any(Object),
      }));
      const result=output.roguelikeEncounters?.find(row=>row.id===encounter.id)?.outcome!;
      const old=actor(presented),arrived=actor(output);
      expect(result).toMatchObject({qiDelta:arrived.qiProgress-old.qiProgress,hpDelta:arrived.hp-old.hp,
        karmaDelta:arrived.karma-old.karma,lifespanDelta:arrived.lifespan-old.lifespan});
      const added=output.events.filter(event=>!presented.events.some(original=>original.id===event.id));
      expect(added.length).toBeGreaterThan(0);
      expect(added.every(event=>event.witnessScope==='participants'&&event.actorIds.includes(encounter.actorId))).toBe(true);
      expect(activeRoguelikeEncounter(output,actor(output))).toBeUndefined();
      expect(resolveGuidedRoguelikeChoice(output,encounter.id,choice)).toBe(output);
      expect(activeRoguelikeEncounter(presented,actor(presented))).toEqual(encounter);
      expect(encodeEraWorldSave(month(output))).toBe(encodeEraWorldSave(month(reOpen(output))));
      if(choice==='leave'){
        for(const key of ['qiProgress','hp','karma','lifespan','spiritStones'] as const){
          expect(actor(output)[key]).toBe(actor(world)[key]);
        }
      }
    }
  });

  it('closes an unanswered offer on a real subsequent month and never applies the old choice',()=>{
    const {world,encounter}=openNativeGuidedEncounter();
    const next=month(world);
    expect(next.tick).toBe(world.tick+1);
    expect(next.roguelikeEncounters).toContainEqual(expect.objectContaining({id:encounter.id,status:'resolved',choice:'leave',resolvedTick:next.tick, outcome:{success:false,qiDelta:0,hpDelta:0,karmaDelta:0,lifespanDelta:0,affinityDelta:0}}));
    expect(activeRoguelikeEncounter(next,actor(next))).toBeUndefined();
    expect(resolveGuidedRoguelikeChoice(next,encounter.id,'bold')).toBe(next);
  });

  it('opens a genuine market encounter on successful cross-region travel with no ordinary exploration loot',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const body=actor(initial);
    expect(possessAvatar(initial,body.id)).toBe(true);
    const origin=initial.locations.find(row=>row.id===body.locationId)!;
    const east=initial.locations.find(row=>row.id==='loc-market-east')!;
    expect(east.type).toBe('market');
    expect(knownMapLocations(initial,body)).toContain(east);
    expect(regionForPoint(initial,origin)).toBe('west');
    expect(regionForPoint(initial,east)).toBe('east');
    const arrived=month(initial,{chosenAction:'EXPLORE',targetLocationId:east.id,innerMonologue:'去松灯坊市。'},()=>.90);
    expect(actor(arrived).locationId).toBe(east.id);
    expect(arrived.events.some(row=>row.id===`evt-${arrived.tick}-${body.id}-explore`)).toBe(false);
    const offer=activeRoguelikeEncounter(arrived,actor(arrived));
    expect(offer).toMatchObject({actorId:body.id,fromSiteId:origin.id,siteId:east.id,
      status:'offered',guided:true,openedTick:arrived.tick});
    expect(arrived.events).toContainEqual(expect.objectContaining({
      id:`evt-${offer?.id}-open`,witnessScope:'participants',actorIds:[body.id],locationId:east.id,
    }));
  });
});
