import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {validateTianjiGazetteHistory} from '../src/engine/storageTianjiGazetteValidation';
import type {WorldState} from '../src/types/world';
import {actualGazetteBounty,actualGazetteCampaign,actualGazetteYear} from './tianjiGazetteNativeFixture';

const latest=(world:WorldState)=>world.tianjiGazette!.issues.at(-1)!;
function exact(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
function reject(world:WorldState,alter:(copy:WorldState)=>void,field:RegExp){
  const copy=structuredClone(world);alter(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(field);
}

describe('native Tianji Gazette editorial provenance',()=>{
  it('does not migrate an older no-issue save',()=>{
    const old=createInitialWorld(1,'spirit-bloom');
    const raw=encodeWorldSave(old);
    expect(raw).not.toContain('"tianjiGazette"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });

  it('keeps a real year-turn page with both exact original rival encounters, not raw secret text',()=>{
    const {world,privateSource}=actualGazetteYear();
    expect(latest(exact(world))).toEqual(latest(world));
    expect(latest(world)).toMatchObject({tick:world.tick,year:world.year,month:1,trigger:'year_turn'});
    const rivalry=(state:WorldState)=>{
      const row=latest(state).entries.find(entry=>entry.kind==='rivalry');
      if(row?.kind!=='rivalry')throw Error('Missing exact native rivalry');
      return row;
    };
    reject(world,w=>{latest(w).month=2;},/tianjiGazette.issue/);
    reject(world,w=>{w.tianjiGazette!.issues.push(latest(w));},/tianjiGazette.issue/);
    reject(world,w=>{latest(w).entries=[];},/tianjiGazette.issue/);
    reject(world,w=>{latest(w).entries.push(rivalry(w));},/tianjiGazette.entries/);
    reject(world,w=>{rivalry(w).sourceEventId=privateSource.id;},/tianjiGazette.rivalry/);
    reject(world,w=>{rivalry(w).earlier.tick=rivalry(w).tick;},/tianjiGazette.rivalry/);
    reject(world,w=>{rivalry(w).actorIds.reverse();},/tianjiGazette.rivalry/);
    reject(world,w=>{Object.assign(rivalry(w),{cardBody:'虚构旁白'});},/cardBody/);
  });

  it('binds the battle headline to its actual fought terminal, not arrival, a fabricated winner, or private source',()=>{
    const {closed,ended,source}=actualGazetteCampaign();
    const battle=latest(exact(closed));
    expect(battle).toMatchObject({trigger:'battle',entries:expect.arrayContaining([expect.objectContaining({
      kind:'headline',story:'siege',siegeId:ended.id,sourceEventId:source.id,
    })])});
    function headline(w:WorldState){
      const entry=latest(w).entries[0];
      if(entry.kind!=='headline'||entry.story!=='siege')throw Error('Missing genuine fought report');
      return entry;
    }
    reject(closed,w=>{headline(w).sourceEventId=`evt-${ended.theatre!.arrivedTick}-dip-${ended.id}`;},/tianjiGazette.siege/);
    reject(closed,w=>{headline(w).outcome='repelled';},/tianjiGazette.siege/);
    reject(closed,w=>{headline(w).attackerSectId=headline(w).defenderSectId;},/tianjiGazette.siege/);
    reject(closed,w=>{latest(w).trigger='finale';},/tianjiGazette.trigger/);
    // The dedicated proof also rejects private source conversion, independently
    // of the older Grand Siege validator which verifies the very same source.
    const reclassified=structuredClone(closed);
    reclassified.events.find(event=>event.id===source.id)!.witnessScope='participants';
    expect(()=>validateTianjiGazetteHistory(reclassified,path=>{throw Error(path);}))
      .toThrow(/tianjiGazette.source/);
  });

  it('checks a real posted independent bounty without republishing motives or turning it into a reward estimate',()=>{
    const {world,bounty}=actualGazetteBounty();
    const row=latest(exact(world)).entries.find(entry=>entry.kind==='bounty');
    expect(row).toMatchObject({bountyId:bounty.id,reward:bounty.reward,sponsorSectId:bounty.sponsorSectIds[0]});
    reject(world,w=>{
      const changed=latest(w).entries.find(entry=>entry.kind==='bounty')!;
      if(changed.kind==='bounty')changed.reward++;
    },/tianjiGazette.bounty/);
  });
});
