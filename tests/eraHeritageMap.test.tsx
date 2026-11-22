import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {createInitialWorld} from '../src/data/initialWorld';
import {resolveRelicAction} from '../src/engine/relicEngine';
import type {LLMDecisionPayload} from '../src/types/world';

describe('old evidence on existing map',()=>{
  it('marks a firsthand current original only on the owner side of an opened map tool',()=>{
    const world=createInitialWorld(11321);
    const sect=world.sects[0],location=world.locations.find(site=>site.id===sect.headquartersId)!;
    const owner=world.cultivators.find(actor=>actor.sectId===sect.id&&actor.id!==sect.leaderId)!;
    const outsider=world.cultivators.find(actor=>actor.id!==owner.id)!;
    const wild=world.locations.find(site=>site.type==='spirit_vein')!;
    location.furnaceGrade=3;owner.locationId=wild.id;owner.spiritStones=800;owner.herbs.earth_root=20;
    const take=(fields:Partial<LLMDecisionPayload>):LLMDecisionPayload=>({chosenAction:'RELIC',innerMonologue:'按原生位置核对器物。',...fields});
    for (const slot of ['frame','core'] as const) {
      const fragment=world.relics.fragments.find(row=>row.holder.kind==='site'&&row.holder.id===wild.id&&row.slot===slot)!;
      expect(resolveRelicAction(world,owner,take({relicMove:'recover',targetRelicFragmentId:fragment.id}))).not.toBeNull();
    }
    owner.locationId=outsider.locationId=location.id;
    expect(resolveRelicAction(world,owner,take({relicMove:'assemble',targetRelicSetId:'star-balance'}))).not.toBeNull();
    const render=(observer:string,toolsOpen:boolean)=>renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={observer} onSelectCultivator={() => undefined} toolsOpen={toolsOpen}/>);
    const label='此处有本人可以核查的旧事凭据';
    expect(render(owner.id,true)).toContain(label);
    expect(render(owner.id,false)).not.toContain(label);
    expect(render(outsider.id,true)).not.toContain(label);
  });
});
