import {describe,expect,it} from 'vitest';
import {chapterFocalScore,chapterFocalThreadKey} from '../src/engine/chapterFocalScene';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {ChronicleAnchor,WorldEvent} from '../src/types/world';
import {actualGrandSiege,actualSiege,siegeTurn} from './grandSiegeNativeFixture';
import {actualDestinyTrial} from './destinyTraitNativeFixture';

describe('typed novel focal scenes from retained native sources',()=>{
  it('finds the genuine seed-1 duel/death thread and leaves ordinary forging, collecting and small cultivation quiet',()=>{
    let world=createInitialWorld(1);
    while(world.tick<24)world=advanceWorldTick(world);
    const byId=new Map(world.chronicleArchive.anchors.map(row=>[row.id,row]));
    const early=byId.get('evt-17-elder-danxia-2-duel')!,late=byId.get('evt-21-elder-danxia-2-kill')!;
    expect({early:early?.category,late:late?.category}).toEqual({early:'combat',late:'death'});
    expect(chapterFocalScore(early)).toBe(72);
    expect(chapterFocalScore(late)).toBe(100);
    expect(chapterFocalThreadKey(early)).toBe(chapterFocalThreadKey(late));
    for(const nativeId of ['evt-18-npc-5-alchemy','evt-21-npc-6-bind_artifact-11','evt-7-elder-blood-1-forge_artifact-6','evt-13-npc-2-break']){
      expect(byId.has(nativeId)).toBe(true);
      expect(chapterFocalScore(byId.get(nativeId)!)).toBe(0);
    }
    const otherDirection={...early,actorIds:[early.actorIds[1],early.actorIds[0]],id:`evt-${early.tick}-${early.actorIds[1]}-duel`};
    expect(chapterFocalThreadKey(otherDirection)).toBe(chapterFocalThreadKey(late));
    // Archived anchors do not retain duelWinnerId; both orders can be clustered without declaring the winner.
    expect(chapterFocalThreadKey({...otherDirection,actorIds:[early.actorIds[0],early.actorIds[1]]})).toBeUndefined();
  });

  it('holds an actual arrived siege quiet until a committed round and groups that round with the finale',()=>{
    const {arrived,launched,siege}=actualGrandSiege();
    const get=(world:typeof arrived,id:string)=>world.events.find(row=>row.id===id)!;
    expect(chapterFocalScore(get(launched,siege.theatre!.sourceLaunchId))).toBe(0);
    const arrival=get(arrived,`evt-${arrived.tick}-dip-${siege.id}`);
    expect(chapterFocalScore(arrival)).toBe(0);
    let fought=siegeTurn(arrived);
    const paid=actualSiege(fought).theatre!.rounds[0];
    const wall=get(fought,paid.sourceEventId);
    expect(paid.wallBefore).toBeGreaterThan(paid.wallAfter);
    expect(chapterFocalScore(wall)).toBe(75);
    const launchStamp={...wall,title:'攻山退兵',description:'原山门已不是这场战事可守、可攻的宗门要地。联军撤回，未再交锋。'};
    expect(chapterFocalScore(launchStamp)).toBe(0);
    for(let i=0;i<7&&!actualSiege(fought).theatre?.terminal;i++)fought=siegeTurn(fought);
    const terminal=actualSiege(fought).theatre!.terminal!;
    expect(terminal.battlefield).toBe(true);
    const finale=get(fought,terminal.sourceEventId);
    expect(chapterFocalScore(finale)).toBeGreaterThan(chapterFocalScore(wall));
    expect(chapterFocalThreadKey(finale)).toBe(chapterFocalThreadKey(wall));
  });

  it('ranks actual completed native trial, never lightning alone, participant-only duplicates, or category/lurid titles unbound to identity',()=>{
    const {last,passed}=actualDestinyTrial();
    const climax=passed.events.find(event=>event.id===`evt-${passed.tick}-npc-1-tribulation-passed`)!;
    const wave=last.events.find(event=>event.id===`evt-${last.tick}-npc-1-tribulation-wave-3`)!;
    expect(chapterFocalScore(climax)).toBe(85);
    expect(chapterFocalScore(wave)).toBe(0);
    const privateCopy:WorldEvent={...climax,witnessScope:'participants'};
    expect(chapterFocalScore(privateCopy)).toBe(0);
    for(const contradiction of [
      {...climax,id:'poem-made-by-the-model',title:'四海血战，苍生尽陨',category:'death'},
      {...climax,id:`evt-${climax.tick}-someone-else-tribulation-passed`},
      {...climax,actorIds:[climax.actorIds[0],climax.actorIds[0]]},
      {...climax,locationId:undefined},
      {...climax,description:'外地流言断言天雷之终。'},
    ] satisfies ChronicleAnchor[])expect(chapterFocalScore(contradiction)).toBe(0);
  });
});
