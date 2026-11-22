import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {RoguelikeEncounterCard} from '../src/components/RoguelikeEncounterCard';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {activeRoguelikeEncounter,resolveGuidedRoguelikeChoice} from '../src/engine/roguelikeEncounterEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {RoguelikeEncounterRecord} from '../src/types/roguelikeEncounter';
import type {LLMDecisionPayload} from '../src/types/world';

function visitingGate(){
  const initial=createInitialWorld(1,'spirit-bloom');
  const visitor=initial.cultivators.find(row=>row.id==='npc-2')!;
  const site=initial.locations.find(row=>row.id==='loc-taixu')!;
  expect(visitor.locationId).not.toBe(site.id);
  expect(knownMapLocations(initial,visitor)).toContain(site);
  expect(possessAvatar(initial,visitor.id)).toBe(true);
  const decisions:Record<string,LLMDecisionPayload>=Object.fromEntries(initial.cultivators.map(row=>[
    row.id,row===visitor?{chosenAction:'EXPLORE',innerMonologue:'归本门。',targetLocationId:site.id}:
      {chosenAction:'REST',innerMonologue:'静候。'},
  ]));
  const world=advanceWorldTick(initial,decisions,()=>.90,'utility');
  const owner=world.cultivators.find(row=>row.id===visitor.id)!;
  expect(owner.locationId).toBe(site.id);
  const offer=activeRoguelikeEncounter(world,owner);
  if(!offer||offer.kind!=='sect-gate')throw Error('Native return did not open a sect gate trial');
  return {world,owner,site,offer};
}

function read(encounter:RoguelikeEncounterRecord,actorName:string,siteName:string,busy=false){
  const choose=vi.fn(),finish=vi.fn();
  const markup=renderToStaticMarkup(<RoguelikeEncounterCard encounter={encounter} actorName={actorName}
    siteName={siteName} busy={busy} onChoose={choose} onContinue={finish}/>);
  expect(choose).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
  return markup;
}

describe('private three-way sect-gate stage',()=>{
  it('renders one native arriving scene, exactly 3 deliberate large choices, and freezes them while busy',()=>{
    const {world,owner,site,offer}=visitingGate();
    const html=read(offer,owner.name,site.name);
    expect(html).toContain('拜山试心');
    expect(html).toContain(site.name);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html.match(/min-h-12/g)).toHaveLength(3);
    for(const choice of ['守诺','识破','离开'])expect(html).toContain(`>${choice}</span>`);
    expect(html).not.toMatch(/冒险|稳妥|本门声望(?:增|减)/u);
    expect(html).not.toContain(offer.id);
    expect(read(offer,owner.name,site.name,true).match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    expect(activeRoguelikeEncounter(world,world.cultivators.find(row=>row!==owner)!)).toBeUndefined();
    expect(read({...offer,guided:false},owner.name,site.name)).toBe('');
    expect(read({...offer,sectGate:undefined},owner.name,site.name)).toBe('');
    const released=structuredClone(world);
    expect(possessAvatar(released,null)).toBe(true);
    const former=released.cultivators.find(row=>row.id===owner.id)!;
    expect(activeRoguelikeEncounter(released,former)).toBeUndefined();
    expect(resolveGuidedRoguelikeChoice(released,offer.id,'bold')).toBe(released);
  });

  it('reads only actual settlement and does not turn leaving the trial into travel or recruitment',()=>{
    const {world,owner,site,offer}=visitingGate();
    const reply=resolveGuidedRoguelikeChoice(world,offer.id,'cautious');
    expect(reply).not.toBe(world);
    const settled=reply.roguelikeEncounters!.find(row=>row.id===offer.id)!;
    const amount=settled.outcome?.sectReputationDelta;
    const html=read(settled,owner.name,site.name);
    expect(settled.resolvedTick).toBe(world.tick);
    expect(typeof amount).toBe('number');
    if (amount) expect(html).toContain(`本门声望${amount>0?'增':'减'} ${Math.abs(amount)}`);
    else expect(html).toContain('本门声望未改');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    const leave=resolveGuidedRoguelikeChoice(world,offer.id,'leave');
    const stillHere=leave.cultivators.find(row=>row.id===owner.id)!;
    expect(stillHere.locationId).toBe(site.id);
    expect(stillHere.sectId).toBe(owner.sectId);
    const left=leave.roguelikeEncounters!.find(row=>row.id===offer.id)!;
    const retreat=read(left,owner.name,site.name);
    expect(retreat).toContain('到此作别');
    expect(retreat).not.toMatch(/入门成功|已离山|换了宗门/u);
  });
});
