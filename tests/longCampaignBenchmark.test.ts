import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {campaignLeaderChanges,campaignPopulation,collectCampaignBenchmark,parseCampaignBenchmarkArgs,type CampaignLeaderChange}
  from '../scripts/longCampaignBenchmark';
import {worldSaveByteCount} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

describe('reproducible native campaign measurement',()=>{
  it('validates strict CLI without changing default short benchmark mode',()=>{
    expect(parseCampaignBenchmarkArgs([])).toEqual({seed:2031,months:[120,300,600],profile:'classic',revision:'unrecorded'});
    expect(parseCampaignBenchmarkArgs(['--seed=4294967295','--months=1,3,12','--profile=fractured-frontier','--revision=04889dc']))
      .toEqual({seed:4294967295,months:[1,3,12],profile:'fractured-frontier',revision:'04889dc'});
    for(const invalid of [['--ticks=120'],['--seed=2031','--seed=2032'],['--seed=4294967296'],['--seed=1e3'],['--seed=1\n'],
      ['--months=0'],['--months=1,1'],['--months=3,1'],['--months=1,1201'],['--profile=invented'],['--revision=main']])
      expect(()=>parseCampaignBenchmarkArgs(invalid)).toThrow();
  });

  it('keeps four independent populations and records stable leader identities even when names coincide',()=>{
    const base=createInitialWorld(2031,'classic');
    const founderIds=new Set(base.cultivators.map(row=>row.id));
    const after=structuredClone(base);
    after.tick++;after.month++;
    const sect=after.sects[0],old=after.cultivators.find(row=>row.id===sect.leaderId)!;
    const successor=after.cultivators.find(row=>row.id!==old.id)!;
    successor.name=old.name;
    old.alive=false;old.hp=0;
    after.cultivators.push({...structuredClone(successor),id:'diagnostic-new-actor'});
    const trueMortals=base.settlements.villages.reduce((n,village)=>n+village.population,0);
    after.settlements.villages[0].population++;
    expect(campaignPopulation(after,founderIds)).toEqual({livingCultivators:base.cultivators.length,
      registeredCultivators:base.cultivators.length+1,survivingFounders:base.cultivators.length-1,registeredMortals:trueMortals+1});
    sect.leaderId=successor.id;
    sect.succession={tick:after.tick,method:'election',previousLeaderId:old.id,leaderId:successor.id,supporterIds:[]};
    expect(campaignLeaderChanges(base,after)).toEqual([{tick:after.tick,year:after.year,month:after.month,sectId:sect.id,
      sectName:sect.name,kind:'succession',from:{id:old.id,name:old.name},to:{id:successor.id,name:old.name},method:'election'}]);
    sect.leaderId=undefined;
    expect(campaignLeaderChanges(base,after)[0]).not.toHaveProperty('method');
    expect(campaignLeaderChanges(base,after)[0].kind).toBe('vacancy');
  });

  it('cross-checks small samples with ordinary native turns, actual bytes and read-back plus continuation',()=>{
    const options=parseCampaignBenchmarkArgs(['--seed=2031','--months=1,3','--revision=04889dc']);
    let clock=0;
    const reports=[...collectCampaignBenchmark(options,{now:()=>clock++})];
    let reference=createInitialWorld(options.seed,options.profile);
    const founders=new Set(reference.cultivators.map(row=>row.id));
    let prior=0;
    for(const report of reports){
      const recorded:CampaignLeaderChange[]=[];
      for(;prior<report.months;prior++){
        const next=advanceWorldTick(reference,undefined,undefined,'utility');
        recorded.push(...campaignLeaderChanges(reference,next));
        reference=next;
      }
      expect(report.checkpoint).toEqual({tick:reference.tick,year:reference.year,month:reference.month});
      expect(report.population).toEqual(campaignPopulation(reference,founders));
      expect(report.leaderChanges).toEqual(recorded);
      expect(report.save).toMatchObject({envelopeBytes:worldSaveByteCount(reference),exportAccepted:true,parsed:true,roundTripExact:true,continuedExact:true});
      expect(report.save.failure).toBeUndefined();
      expect(report.timingMs.simulationTotal).toBe(report.months);
    }
    const control=[...collectCampaignBenchmark({...options,seed:2032},{now:()=>0})];
    expect(control[1]).toMatchObject({seed:2032,profile:'classic',sourceRevision:'04889dc',branchId:'main',months:3});
    expect(control[1].save.continuedExact).toBe(true);
  });
});
