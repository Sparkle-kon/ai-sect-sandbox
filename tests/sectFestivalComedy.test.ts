import {describe,expect,it} from 'vitest';
import {findSectComedyTemplate} from '../src/data/sectComedy';
import {projectSectComicMoment,sectComicEventId} from '../src/engine/sectComedy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处。'};

function advance(world:WorldState,board:readonly SectJobAssignment[]=[]){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(person=>!board.some(order=>order.discipleId===person.id))
    .map(person=>[person.id,rest])),undefined,'utility',undefined,{
    sectJobAssignments:board,capturePresentation:false,captureTrace:false,
  });
}
function starter(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw new Error('Expected canonical managed origin');
  return world;
}

describe('节令笑话跟着实际差事和旧月走',()=>{
  it('春招只到村口，趣闻和存档不能把熟路写成入门',()=>{
    const original=starter(),oldSave=encodeEraWorldSave(original);
    expect(encodeEraWorldSave(decodeEraWorldSave(oldSave))).toBe(oldSave);
    let world=advance(original);
    const id=world.sectManagement?.foundingDiscipleIds[0];
    const person=world.cultivators.find(actor=>actor.id===id);
    if(!person)throw new Error('Expected native managed worker');
    person.exploredTileIds=world.terrain.tiles.filter(tile=>tile.biome!=='魔渊'&&tile.biome!=='毒沼').map(tile=>tile.id);
    world=advance(world,[{discipleId:person.id,jobId:'festival-recruit'}]);
    expect(world.month).toBe(3);
    const moment=world.sectManagement?.comedy?.moments.at(-1);
    expect(moment).toMatchObject({tick:world.tick,templateId:'h6-festival-recruit-route',speakerId:person.id,
      source:{phase:'on_route',jobId:'festival-recruit'},effects:[]});
    expect(world.sectManagement?.latestReport?.rows[0]).toMatchObject({discipleId:person.id,phase:'on_route'});
    expect(world.settlements.records.some(record=>record.actorId===person.id&&record.tick===world.tick&&record.kind==='recruitment')).toBe(false);
    expect(world.events.find(event=>event.id===sectComicEventId(world.tick,world.sectManagement?.sectId??'')))
      .toMatchObject({witnessScope:'participants',actorIds:[person.id]});
    expect(projectSectComicMoment(world,moment)?.report).toContain('倒掉鞋里的沙');

    const april=advance(world),saved=encodeEraWorldSave(april);
    const reloaded=decodeEraWorldSave(saved);
    const oldMoment=reloaded.sectManagement?.comedy?.moments.find(row=>row.tick===world.tick);
    expect(encodeEraWorldSave(reloaded)).toBe(saved);
    expect(projectSectComicMoment(reloaded,oldMoment)?.report).toContain('倒掉鞋里的沙');

    const forged=structuredClone(april),managed=forged.sectManagement;
    if(!managed?.comedy)throw new Error('Expected archive of actual seasonal note');
    managed.comedy={moments:managed.comedy.moments.map(row=>row.tick!==world.tick?row:
      {...row,templateId:'festival-social-route',source:{phase:'on_route',jobId:'festival-social'}})};
    expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement\.comedy\.source/u);
  });

  it('每种节令都有前一程及未办成的台词；挂卖不冒充成交',()=>{
    for(const id of ['recruit','social','market','review','debt'] as const){
      expect(findSectComedyTemplate(`h6-festival-${id}-route`)?.match.phase).toBe('on_route');
      expect(findSectComedyTemplate(`h6-festival-${id}-blocked`)?.match.phase).toBe('unavailable');
      if(id==='market')expect(findSectComedyTemplate('h6-festival-market-done-success')).toBeUndefined();
      else for(const tier of ['success','windfall','mishap'] as const){
        expect(findSectComedyTemplate(`h6-festival-${id}-done-${tier}`)).toMatchObject({match:{phase:'performed',tier},
          effects:expect.arrayContaining([expect.objectContaining({kind:expect.any(String)})])});
      }
    }
  });
});
