import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {RoguelikeEncounterCard} from '../src/components/RoguelikeEncounterCard';
import {projectRoguelikeEncounterStage} from '../src/components/roguelikeEncounterStage';
import {projectSceneStage} from '../src/components/sceneStageModel';
import {ROGUELIKE_ENCOUNTER_CATALOG} from '../src/engine/roguelikeEncounterCatalog';
import {resolveGuidedRoguelikeChoice} from '../src/engine/roguelikeEncounterEngine';
import {actor,openNativeGuidedEncounter,other} from './roguelikeEncounterNativeFixture';

const fixture=()=>{
  const {world,encounter}=openNativeGuidedEncounter(),viewer=actor(world);
  const site=world.locations.find(row=>row.id===encounter.siteId)!;
  return {world,encounter,viewer,site};
};

describe('registered storylets illustrate only an authenticated native encounter',()=>{
  it('paints the true held actor but preserves native choices and no extra visible controls',()=>{
    const {world,encounter,viewer,site}=fixture(),before=JSON.stringify(world);
    const stage=projectRoguelikeEncounterStage(world,viewer,encounter);
    expect(stage?.siteName).toBe(site.name);
    expect(stage?.cast.some(row=>row.id===viewer.id)).toBe(true);
    const choose=vi.fn(),resume=vi.fn();
    const html=renderToStaticMarkup(<RoguelikeEncounterCard encounter={encounter} actorName={viewer.name}
      siteName={site.name} stage={stage} busy={false} onChoose={choose} onContinue={resume}/>);
    expect(html).toContain('data-roguelike-stage');
    expect(html).toContain('data-scene-stage');
    expect(html).toContain(ROGUELIKE_ENCOUNTER_CATALOG[encounter.kind].title);
    expect((html.match(/<button\b/g)??[]).length).toBe(3);
    for(const option of ROGUELIKE_ENCOUNTER_CATALOG[encounter.kind].choices)expect(html).toContain(option.label);
    expect(choose).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(JSON.stringify(world)).toBe(before);
  });

  it('never moves a private storylet into a public scene or transfers the guarded pose',()=>{
    const {world,encounter,viewer}=fixture();
    expect(projectRoguelikeEncounterStage(world,actor(world,other),encounter)).toBeUndefined();
    expect(projectRoguelikeEncounterStage(world,{...viewer},encounter)).toBeUndefined();
    expect(projectRoguelikeEncounterStage(world,viewer,{...encounter})).toBeUndefined();
    const eventId=`evt-${encounter.id}-open`;
    expect(world.events.find(event=>event.id===eventId)?.witnessScope).toBe('participants');
    const publicStage=projectSceneStage(world,{eventId,viewer});
    expect(publicStage.siteName).toBeUndefined();
    expect(publicStage.cast).toEqual([]);
    const settled=resolveGuidedRoguelikeChoice(world,encounter.id,'leave');
    expect(settled).not.toBe(world);
    expect(projectRoguelikeEncounterStage(settled,actor(settled),encounter)).toBeUndefined();
  });
});
