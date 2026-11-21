import {describe,expect,it} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {resolveAlchemy} from '../src/engine/alchemyEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceSeedCulture,availableSeedCultureActions,projectLocalSeedCulture,projectSeedCulture,resolveSeedCultureAction} from '../src/engine/seedCultureEngine';
import {measureSeedPlot,measureSeedTrial} from '../src/engine/seedCultureTerms';
import {matureSeedCulture,plantedSeedCulture,reservedSeedCulture,seedCultureBase,seedDecision,seedPayload,seedPerson,seedSite,seedTurn,testedSeedCulture}
  from './fixtures/seedCultureFixture';
import type {WorldState} from '../src/types/world';

const rows=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='seed_culture');
const lot=(world:WorldState,id:string)=>world.seedCulture.lots.find(row=>row.id===id)!;
const plot=(world:WorldState,id:string)=>world.seedCulture.plots.find(row=>row.id===id)!;

describe('jade leaf propagation using finite actual custody',()=>{
  it('uses actual harvested stock once; no seed in actor herbs and no changed native site stock from seed sealing',()=>{
    const base=seedCultureBase(),{world}=base;
    const owner=seedPerson(world,base.ownerId);
    const site=seedSite(world,base.siteId),wild=site.herbs.jade_leaf;
    expect(owner.herbs.jade_leaf).toBe(2);
    world.tick++;
    const action=seedDecision('reserve',site.id);
    expect(resolveSeedCultureAction(world,owner,action)?.witnessScope).toBe('participants');
    expect(resolveSeedCultureAction(world,owner,action)).toBeNull();
    expect(site.herbs.jade_leaf).toBe(wild);
    expect(owner.herbs.jade_leaf).toBe(0);
    expect(Object.hasOwn(owner.herbs,'jade_seed')).toBe(false);
    expect(world.seedCulture.lots[0]).toMatchObject({remaining:6,tests:[]});
    expect(rows(world).map(row=>[row.good,row.kind,row.amount])).toEqual([
      ['jade_leaf','consumption',2],['jade_seed','production',6],
    ]);
    expect(projectSeedCulture(world,seedPerson(world,base.outsiderId))).toEqual({lots:[],plots:[]});
  });

  it('spends each independently measured sample only once and preserves its soil, atmosphere and result on a fork',()=>{
    const f=reservedSeedCulture(),{world}=f,owner=seedPerson(world,f.ownerId);
    expect(resolveSeedCultureAction(world,owner,seedDecision('test',f.lotId))).toBeNull();
    world.tick++;
    expect(resolveSeedCultureAction(world,owner,seedDecision('plant',f.lotId))).toBeNull();
    expect(resolveSeedCultureAction(world,owner,seedDecision('test',f.lotId))).not.toBeNull();
    expect(resolveSeedCultureAction(world,owner,seedDecision('test',f.lotId))).toBeNull();
    expect(lot(world,f.lotId).remaining).toBe(4);
    const original=structuredClone(lot(world,f.lotId).tests[0]);
    expect(original.sprouted).toBe(measureSeedTrial(world.terrain.seed,f.lotId,original.weather));
    const fork=structuredClone(world);
    const site=seedSite(fork,f.siteId);
    terrainTileAt(fork,site.x,site.y)!.spiritQi=original.weather.soilQi>=51?8:92;
    fork.tick++;
    expect(resolveSeedCultureAction(fork,seedPerson(fork,f.ownerId),seedDecision('test',f.lotId))).not.toBeNull();
    expect(lot(fork,f.lotId).tests[0]).toEqual(original);
    expect(lot(fork,f.lotId).tests[1].weather.soilQi).not.toBe(original.weather.soilQi);
    expect(lot(fork,f.lotId).remaining).toBe(2);
    fork.tick++;
    expect(resolveSeedCultureAction(fork,seedPerson(fork,f.ownerId),seedDecision('test',f.lotId))).not.toBeNull();
    fork.tick++;
    expect(availableSeedCultureActions(seedPerson(fork,f.ownerId),fork).some(row=>row.seedMove==='plant')).toBe(false);
    expect(lot(fork,f.lotId).remaining).toBe(0);
    expect(lot(world,f.lotId).tests).toEqual([original]);
  });

  it('honors a single true occupied plot with no actor cap or mutation for an independently competing owner',()=>{
    const f=testedSeedCulture(),{world}=f,owner=seedPerson(world,f.ownerId),competitor=seedPerson(world,f.competitorId);
    world.tick++;
    expect(resolveSeedCultureAction(world,competitor,seedDecision('plant',f.lotId))).toBeNull();
    expect(resolveSeedCultureAction(world,owner,seedDecision('plant',f.lotId))).not.toBeNull();
    expect(resolveSeedCultureAction(world,competitor,seedDecision('plant',f.competingLotId))).toBeNull();
    expect(lot(world,f.competingLotId).remaining).toBe(4);
    expect(projectLocalSeedCulture(world,competitor)).toEqual({siteId:f.siteId,growing:1,ready:0});
    expect(projectSeedCulture(world,competitor).plots).toEqual([]);
  });

  it('destroys only on a proven matching tile hazard, logs exact real seed loss once and never converts to herb',()=>{
    const f=plantedSeedCulture(),site=seedSite(f.world,f.siteId),point={x:site.x,y:site.y};
    const far=f.world.locations.find(row=>terrainTileAt(f.world,row.x,row.y)?.id!==terrainTileAt(f.world,site.x,site.y)?.id)!;
    const other={x:far.x,y:far.y};
    const danger=(world:WorldState,at:{x:number;y:number})=>applyMapBrush(applyMapBrush(world,'beast_tide',[at]),'beast_tide',[at]);
    const safe=seedTurn(danger(f.world,other));
    expect(plot(safe,f.plotId)).toMatchObject({status:'growing',weather:[{tick:safe.tick}]});
    const lost=seedTurn(danger(f.world,point));
    expect(plot(lost,f.plotId)).toMatchObject({status:'lost',loss:{reason:'site_hazard',units:2,good:'jade_seed',
      hazard:{kind:'beast_tide',intensity:2}},weather:[]});
    expect(advanceSeedCulture(lost)).toEqual([]);
    expect(lot(lost,f.lotId).remaining).toBe(2);
    expect(rows(lost).filter(row=>row.reason==='seed_plot_loss').map(row=>row.amount)).toEqual([2]);
    expect(seedPerson(lost,f.ownerId).herbs.jade_leaf).toBe(0);
  });

  it('settles every rooted or lost seed exactly once, keeps yield held until actual local harvest and then preserves native gather',()=>{
    const f=matureSeedCulture(),{world}=f;
    const bed=plot(world,f.plotId),owner=seedPerson(world,f.ownerId),site=seedSite(world,f.siteId);
    expect(bed.weather.map(row=>row.tick)).toEqual([bed.plantedTick+1,bed.plantedTick+2,bed.plantedTick+3]);
    expect(bed.yield).toBe(measureSeedPlot(world.terrain.seed,f.lotId,f.plotId,bed.weather));
    expect(bed.yield).toBeGreaterThan(0);
    expect(bed.status).toBe('ready');
    const crop=bed.yield!,wild=site.herbs.jade_leaf,personal=owner.herbs.jade_leaf;
    expect(personal).toBe(0);
    const prior=structuredClone(lot(world,f.lotId).tests);
    const oldLocation=owner.locationId;
    owner.locationId=world.locations.find(row=>row.id!==oldLocation)!.id;
    expect(resolveSeedCultureAction(world,owner,seedDecision('harvest',bed.id))).toBeNull();
    owner.locationId=oldLocation;
    expect(resolveSeedCultureAction(world,owner,seedDecision('harvest',bed.id))).not.toBeNull();
    expect(resolveSeedCultureAction(world,owner,seedDecision('harvest',bed.id))).toBeNull();
    expect(rows(world).filter(row=>row.refId===bed.id&&row.good==='jade_seed'&&(row.kind==='consumption'||row.kind==='loss'))
      .reduce((sum,row)=>sum+row.amount,0)).toBe(2);
    expect(owner.herbs.jade_leaf).toBe(crop);
    expect(site.herbs.jade_leaf).toBe(wild);
    expect(lot(world,f.lotId).tests).toEqual(prior);
    expect(resolveAlchemy(world,owner,seedPayload('GATHER_HERBS',{targetHerbId:'jade_leaf'}),()=>.99)).not.toBeNull();
    expect(owner.herbs.jade_leaf).toBe(crop+2);
    expect(site.herbs.jade_leaf).toBe(wild-2);
  });

  it('spoils only plot-held ripe herbs on the exact deadline and records physical death loss without creating inheritable herbs',()=>{
    const f=matureSeedCulture(),{world}=f;
    const crop=plot(world,f.plotId).yield!;
    const spoiled=seedTurn(seedTurn(world));
    expect(plot(spoiled,f.plotId)).toMatchObject({status:'lost',loss:{reason:'spoiled',units:crop,good:'jade_leaf'}});
    expect(seedPerson(spoiled,f.ownerId).herbs.jade_leaf).toBe(0);
    const growing=plantedSeedCulture();
    const owner=seedPerson(growing.world,growing.ownerId);
    owner.alive=false;owner.hp=0;
    const death=seedTurn(growing.world);
    expect(plot(death,growing.plotId)).toMatchObject({status:'lost',loss:{reason:'owner_died',units:2,good:'jade_seed'}});
    expect(lot(death,growing.lotId)).toMatchObject({remaining:0,loss:{reason:'owner_died',units:2}});
    expect(death.estates.entries.find(row=>row.deceasedId===growing.ownerId)?.holdings.herbs.jade_leaf).toBe(0);
    expect(advanceSeedCulture(death)).toEqual([]);
  });
});
