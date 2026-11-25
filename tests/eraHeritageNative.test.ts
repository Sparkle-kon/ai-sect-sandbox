import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import { projectEraHeritage } from '../src/engine/eraHeritageEngine';
import { availableRelicExhibitActions, resolveRelicExhibitAction } from '../src/engine/relicExhibitEngine';
import { resolveRelicAction } from '../src/engine/relicEngine';
import { resolveOathAction } from '../src/engine/oathEngine';
import { resolveChronicleErrataAction } from '../src/engine/chronicleErrataEngine';
import { witnessEvent, spreadRumors } from '../src/engine/rumorEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { noteTerrainVisit } from '../src/engine/terrainEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只按当世实证核对。',...fields});
const byId=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(
  actor=>[actor.id,action('REST')])),()=>.99,'utility');

describe('historic evidence retains native identity and independent scope',()=>{
  it('reaches the same named source witness after 25 actual native January increments and a legal cross-region journey',()=>{
    let world=createInitialWorld(106);
    const elder=byId(world,'elder-taixu-1'), visitor=byId(world,'elder-tianji-1');
    const home='loc-market', destination='loc-market-east', age=elder.age, lifespan=elder.lifespan;
    elder.locationId=visitor.locationId=destination;
    noteTerrainVisit(world,elder);
    elder.locationId=home;elder.spiritStones=200;elder.herbs.jade_leaf=5;
    const village=world.settlements.villages.find(row=>row.locationId===home)!;
    village.stress=80;
    const receipt=applyCultivatorBrainDecision(world,elder,action('DELIVER_RELIEF',{targetSettlementId:village.id}),()=>.99)!;
    witnessEvent(world,receipt);
    expect(world.eraHeritage?.facts[0]).toMatchObject({tick:1,year:1001,month:1,firsthandIds:[elder.id]});
    const months=25*12;
    for(let i=0;i<months;i++)world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,action('REST')])),
      ()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
    const same=byId(world,elder.id), reader=byId(world,visitor.id);
    expect(same).toMatchObject({id:elder.id,age:age+25,lifespan,alive:true,locationId:home});
    expect(reader.locationId).toBe(destination);
    expect(projectEraHeritage(world,reader).firsthands).toEqual([]);
    applyCultivatorBrainDecision(world,same,action('EXPLORE',{targetLocationId:destination}),()=>.99);
    expect(same.locationId).toBe(destination);
    expect(projectEraHeritage(world,reader)).toMatchObject({presentSiteId:destination,
      firsthands:[{title:expect.stringContaining(elder.name),year:1001,month:1,evidence:expect.stringContaining('异域')}]});
    const packed=encodeEraWorldSave(world),restored=decodeEraWorldSave(packed);
    expect(projectEraHeritage(restored,byId(restored,reader.id))).toEqual(projectEraHeritage(world,reader));
    expect(encodeEraWorldSave(restored)).toBe(packed);
  });

  it('shows a true current original recovered and assembled from two fragments, not a closed remote display receipt',()=>{
    const world=createInitialWorld(11321);
    const sect=world.sects[0];
    sect.facilities.scripture_pavilion=2;
    const home=world.locations.find(site=>site.id===sect.headquartersId)!;
    home.furnaceGrade=3;
    const host=byId(world,sect.leaderId!);
    const owner=world.cultivators.find(actor=>actor.sectId===sect.id&&actor.id!==host.id)!;
    const observer=world.cultivators.find(actor=>actor.id!==host.id&&actor.id!==owner.id)!;
    const wild=world.locations.find(site=>site.type==='spirit_vein')!;
    owner.locationId=wild.id;owner.spiritStones=800;owner.herbs.earth_root=20;
    for(const slot of ['frame','core'] as const){
      const fragment=world.relics.fragments.find(row=>row.holder.kind==='site'&&row.holder.id===wild.id&&row.slot===slot)!;
      expect(resolveRelicAction(world,owner,action('RELIC',{relicMove:'recover',targetRelicFragmentId:fragment.id}))).not.toBeNull();
    }
    owner.locationId=host.locationId=home.id;
    expect(resolveRelicAction(world,owner,action('RELIC',{relicMove:'assemble',targetRelicSetId:'star-balance'}))).not.toBeNull();
    const proof=world.eraHeritage!.artifacts[0];
    expect(proof.fragmentIds).toHaveLength(2);
    expect(projectEraHeritage(world,owner)).toMatchObject({presentSiteId:home.id,originals:[{kind:'artifact',title:'星衡合璧'}]});
    expect(projectEraHeritage(world,observer).originals).toEqual([]);
    const offer=availableRelicExhibitActions(owner,world).find(row=>row.exhibitMove==='offer'&&row.targetArtifactId===proof.artifactId)!;
    expect(resolveRelicExhibitAction(world,owner,action('RELIC_EXHIBIT',offer))).not.toBeNull();
    const accept=availableRelicExhibitActions(host,world).find(row=>row.exhibitMove==='accept')!;
    expect(resolveRelicExhibitAction(world,host,action('RELIC_EXHIBIT',accept))).not.toBeNull();
    observer.locationId=home.id;
    expect(projectEraHeritage(world,observer)).toMatchObject({presentSiteId:home.id,originals:[{kind:'artifact'}]});
    const other=world.locations.find(site=>site.id!==home.id)!;
    observer.locationId=other.id;
    expect(projectEraHeritage(world,observer).originals).toEqual([]);
    expect(projectEraHeritage(world,structuredClone(owner)).originals).toEqual([]);
    const exact=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(exact))).toBe(exact);
    const forged=decodeEraWorldSave(exact);
    forged.eraHeritage!.artifacts[0].fragmentIds=[proof.fragmentIds[0],proof.fragmentIds[0]];
    expect(()=>encodeEraWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
  });

  it('records only actual paid acceptance and preserves the same signer without implying delivery',()=>{
    const world=createInitialWorld(11621);
    const [payer,supply,outsider]=world.cultivators;
    for(const actor of [payer,supply,outsider])actor.locationId='loc-market';
    payer.spiritStones=200;payer.herbs.jade_leaf=0;supply.spiritStones=100;supply.herbs.jade_leaf=9;
    expect(resolveOathAction(world,payer,action('OFFER_OATH',{targetCultivatorId:supply.id,oathTerm:'jade_herb'}))).not.toBeNull();
    const oath=world.oaths.contracts[0];
    expect(world.eraHeritage).toBeUndefined();
    expect(resolveOathAction(world,supply,action('ACCEPT_OATH',{targetOathId:oath.id}))).not.toBeNull();
    expect(oath.escrow).toEqual({payment:48,collateral:24});
    expect(world.eraHeritage!.oaths[0]).toMatchObject({oathId:oath.id,requesterId:payer.id,providerId:supply.id,quantity:3,payment:48});
    expect(projectEraHeritage(world,outsider).originals).toEqual([]);
    payer.locationId='loc-market-east';
    expect(projectEraHeritage(world,payer).originals).toMatchObject([{kind:'oath',evidence:expect.stringContaining('货到后另留签收')}]);
    const reopened=step(world);
    expect(reopened.eraHeritage!.oaths).toEqual(world.eraHeritage!.oaths);
    const packed=encodeEraWorldSave(reopened),copy=decodeEraWorldSave(packed);
    expect(projectEraHeritage(copy,byId(copy,payer.id)).originals).toEqual(projectEraHeritage(reopened,byId(reopened,payer.id)).originals);
    copy.eraHeritage!.oaths[0].payment++;
    expect(()=>encodeEraWorldSave(copy)).toThrow(expect.objectContaining({code:'invalid_world'}));
    expect(projectEraHeritage(reopened,byId(reopened,payer.id)).presentSiteId).toBeUndefined();
  });

  it('retains typed contradictory public claims, a native told rumor, and the same actual surviving traveler separately',()=>{
    let world=createInitialWorld(106);
    const [donor,scribe,listener,unrelated]=world.cultivators;
    const site='loc-market', other='loc-market-east';
    for(const actor of world.cultivators)actor.locationId=other;
    for(const actor of [donor,scribe,listener])actor.locationId=site;
    donor.spiritStones=100;donor.herbs.jade_leaf=4;
    const village=world.settlements.villages.find(row=>row.locationId===site)!;
    village.stress=80;
    const event=applyCultivatorBrainDecision(world,donor,action('DELIVER_RELIEF',{targetSettlementId:village.id}),()=>.99)!;
    expect(event).toBeDefined();
    witnessEvent(world,event);
    const fact=world.eraHeritage!.facts[0];
    expect(fact.firsthandIds).toEqual([donor.id]);
    listener.rumors=[];scribe.rumors=[];
    world=step(world);
    spreadRumors(world);
    const first=byId(world,donor.id), second=byId(world,scribe.id), onlooker=byId(world,listener.id), remote=byId(world,unrelated.id);
    const retell=(reading:'full_supplies'|'unfunded')=>action('CHRONICLE_ERRATA',{chronicleErrataMove:'retell',
      targetChronicleSourceId:event.id,chronicleReliefReading:reading});
    expect(resolveChronicleErrataAction(world,first,retell('full_supplies'))).not.toBeNull();
    expect(resolveChronicleErrataAction(world,second,retell('unfunded'))).not.toBeNull();
    expect(projectEraHeritage(world,onlooker).discrepancies).toMatchObject([{statements:[{claim:'说已足额交付'},{claim:'说没有实付'}]}]);
    expect(projectEraHeritage(world,remote).discrepancies).toEqual([]);
    onlooker.locationId=other;
    expect(projectEraHeritage(world,onlooker).relays).toHaveLength(1);
    const exact=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(exact))).toBe(exact);
    const forged=decodeEraWorldSave(exact);
    forged.eraHeritage!.facts[0].relays[0].originWitnessId=remote.id;
    expect(()=>encodeEraWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    first.locationId=other;
    expect(projectEraHeritage(world,onlooker)).toMatchObject({presentSiteId:other,firsthands:[{title:expect.stringContaining(first.name),evidence:expect.stringContaining('异域')}],relays:[]});
    first.alive=false;first.hp=0;
    expect(projectEraHeritage(world,onlooker).firsthands).toEqual([]);
    expect(projectEraHeritage(world,onlooker).relays).toHaveLength(1);
  });
});
