import {describe,expect,it} from 'vitest';
import {projectProtagonistSuccession,qualifiesProtagonistOpening} from '../src/engine/protagonistSuccession';
import {electNativeHandoff,nativeHandoffCompetition} from './fixtures/protagonistHandoffSuccessionFixture';

describe('a real departure allows old ties to resolve a choice between already earned protagonists',()=>{
  it('prefers the actual full triple over a newer ordinary contender on both native runtimes',()=>{
    const f=nativeHandoffCompetition(),base=JSON.stringify(f.world);
    const ordinary=structuredClone(f.world);
    if(!ordinary.dramaticBonds)throw Error('Native relation records absent');
    ordinary.dramaticBonds.facts=ordinary.dramaticBonds.facts.filter(row=>row.sourceEventId!==f.ties[1].sourceEventId);
    const standard=electNativeHandoff(ordinary);
    expect(standard.protagonistSuccession.arcs.at(-1)).toMatchObject({actorId:f.ordinaryContenderId});
    expect(standard.protagonistSuccession.arcs.at(-1)?.handoff).toBeUndefined();
    for(const mode of ['utility','deferred'] as const){
      const world=electNativeHandoff(f.world,mode);
      const chosen=world.protagonistSuccession.arcs.at(-1);
      expect(chosen?.actorId).toBe(f.successorId);
      expect(qualifiesProtagonistOpening(chosen?.opening??[])).toBe(true);
      expect(chosen?.handoff).toMatchObject({exitKind:'public_death',exitEventId:f.exitId,ties:f.ties.map(row=>({
        kind:row.kind,tick:row.tick,eventId:row.sourceEventId,siteId:row.siteId,
      }))});
      const view=projectProtagonistSuccession(world);
      expect(view.active?.handoff?.ties.map(row=>row.eventId)).toEqual(f.ties.map(row=>row.sourceEventId));
      expect(view.archived.at(-1)).toMatchObject({actorId:f.leadId,endedTick:f.world.tick,closeReason:'public_death'});
      expect(projectProtagonistSuccession(world,f.world.tick-1).active?.actorId).toBe(f.leadId);
      expect(projectProtagonistSuccession(world,f.world.tick-1).active?.handoff).toBeUndefined();
      for(const chapter of f.world.chronicleArchive.chapters){
        const read=world.chronicleArchive.chapters.find(row=>row.id===chapter.id)??world.coldHistory.chapters.find(row=>row.id===chapter.id);
        expect(read).toEqual(chapter);
      }
    }
    expect(JSON.stringify(f.world)).toBe(base);
  });

  it('does not use a participant-only replacement or an already pre-departure fork to force the handoff',()=>{
    const f=nativeHandoffCompetition(),disputed=structuredClone(f.world);
    const source=disputed.events.find(row=>row.id===f.ties[1].sourceEventId);
    if(!source)throw Error('Expected the live native practice original');
    disputed.events.unshift({...source,witnessScope:'participants'});
    const ordinary=electNativeHandoff(disputed);
    expect(projectProtagonistSuccession(ordinary).active?.actorId).toBe(f.ordinaryContenderId);
    expect(projectProtagonistSuccession(ordinary).active?.handoff).toBeUndefined();
    const stillPresent=electNativeHandoff(f.beforeDeparture);
    expect(projectProtagonistSuccession(stillPresent).active?.actorId).toBe(f.leadId);
    expect(projectProtagonistSuccession(stillPresent).active?.handoff).toBeUndefined();
  });
});
