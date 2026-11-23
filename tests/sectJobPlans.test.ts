import {describe,expect,it} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {eligibleSectDisciples,observeSectJob,planSectJob,SECT_JOB_DEFINITIONS,SECT_JOB_IDS,settleSectJobChore,snapshotSectJobEvidence} from '../src/engine/sectJobs';
import {resolveMarketAction} from '../src/engine/marketEngine';
import {resolveOathAction} from '../src/engine/oathEngine';
import {availableSparringActions} from '../src/engine/sparringEngine';

function start(){
  const world=createManagedSectWorld(2031,'classic','qingyun-odd-jobs',0)!;
  const management=world.sectManagement!,home=world.locations.find(row=>row.id===management.homeSiteId)!;
  const [actor,peer]=management.foundingDiscipleIds.map(id=>world.cultivators.find(row=>row.id===id)!);
  return {world,management,home,actor,peer};
}

describe('ten lawful sect job plans',()=>{
  it('keeps away disciples assignable; separates present herbs, expedition movement, and being in the market with no delivery',()=>{
    const {world,management,home,actor,peer}=start();
    expect(Object.keys(SECT_JOB_DEFINITIONS)).toEqual([...SECT_JOB_IDS]);
    expect(eligibleSectDisciples(world)).toHaveLength(3);
    expect(eligibleSectDisciples(world).map(row=>row.id)).not.toContain(management.leaderId);
    expect(planSectJob(world,actor,'gather')).toMatchObject({kind:'native',decision:{chosenAction:'GATHER_HERBS'}});
    const parcel=planSectJob(world,actor,'deliver'),stall=planSectJob(world,actor,'stall');
    expect(parcel).toMatchObject({kind:'native',phase:'on_route',decision:{chosenAction:'EXPLORE'}});
    expect(stall).toMatchObject({kind:'native',phase:'on_route',decision:{chosenAction:'EXPLORE'}});
    const previous=snapshotSectJobEvidence(world,actor);
    if(parcel.kind!=='native'||!parcel.siteId)throw Error('Need lawful market approach');
    actor.locationId=parcel.siteId;
    actor.currentAction='EXPLORE';
    expect(eligibleSectDisciples(world)).toContain(actor);
    expect(observeSectJob(world,actor,{discipleId:actor.id,jobId:'deliver'},parcel,previous,undefined,false).phase).toBe('unavailable');
    expect(observeSectJob(world,actor,{discipleId:actor.id,jobId:'deliver'},parcel,previous,undefined,true)).toMatchObject({
      phase:'on_route',siteId:parcel.siteId,line:expect.stringContaining('刚开头'),
    });
    expect(actor.locationId).not.toBe(home.id);
    expect(peer.locationId).toBe(home.id);
    expect(world.couriers.dispatches).toEqual([]);
  });

  it('spends one real local herb on actual bowls and credits guard contribution only at a functioning home gate',()=>{
    const {world,management,home,actor,peer}=start();
    const cooking=planSectJob(world,actor,'kitchen');
    expect(cooking.kind).toBe('chore');
    if(cooking.kind!=='chore')throw Error('Need a stocked working kitchen');
    const before=home.herbs.earth_root;
    const qi=peer.qiProgress;
    const event=settleSectJobChore(world,actor,cooking);
    expect(home.herbs.earth_root).toBe(before-1);
    expect(peer.qiProgress).toBe(qi+3);
    expect(event).toMatchObject({title:'饭堂开了一灶',locationId:home.id,actorIds:expect.arrayContaining([actor.id,peer.id])});
    const guard=planSectJob(world,peer,'guard');
    if(guard.kind!=='chore')throw Error('Need a standing gate');
    const standing=peer.contribution;
    expect(settleSectJobChore(world,peer,guard)?.title).toBe('山门这一班');
    expect(peer.contribution).toBe(standing+2);
    world.events.push(event!);
    expect(settleSectJobChore(world,actor,cooking)).toBeUndefined();
    management.buildings.gate=0;
    expect(planSectJob(world,peer,'guard')).toMatchObject({kind:'blocked'});
  });

  it('records a real market listing but not a closed sale or payment',()=>{
    const {world,actor}=start();
    actor.locationId='loc-market';
    actor.herbs.jade_leaf=2;
    const plan=planSectJob(world,actor,'stall');
    if(plan.kind!=='native'||plan.decision.chosenAction!=='PLACE_MARKET_SELL')throw Error('Need stocked real market');
    const evidence=snapshotSectJobEvidence(world,actor),stones=actor.spiritStones;
    const listing=resolveMarketAction(world,actor,plan.decision);
    actor.currentAction='PLACE_MARKET_SELL';
    expect(listing).not.toBeNull();
    expect(world.markets.orders).toContainEqual(expect.objectContaining({actorId:actor.id,status:'open',side:'sell'}));
    expect(actor.spiritStones).toBe(stones);
    expect(observeSectJob(world,actor,{discipleId:actor.id,jobId:'stall'},plan,evidence,listing??undefined,true))
      .toMatchObject({phase:'on_route',line:'货已挂上价牌，尚不能说卖出。',sourceEventId:listing?.id});
  });

  it('reports an absent oath buyer as tender, and proposes challenge without any actual duel',()=>{
    const {world,actor,peer}=start();
    actor.herbs.jade_leaf=5;
    actor.spiritStones=200;
    peer.spiritStones=200;
    const offer=resolveOathAction(world,peer,{chosenAction:'OFFER_OATH',oathTerm:'jade_herb',targetCultivatorId:actor.id,innerMonologue:'相约交货。'});
    expect(offer).not.toBeNull();
    const id=world.oaths.contracts[0].id;
    expect(resolveOathAction(world,actor,{chosenAction:'ACCEPT_OATH',targetOathId:id,innerMonologue:'应下货约。'})).not.toBeNull();
    world.tick++;world.month++;
    peer.locationId='loc-market';
    const plan=planSectJob(world,actor,'deliver');
    if(plan.kind!=='native'||plan.decision.chosenAction!=='FULFILL_OATH')throw Error('Need actual paid local delivery duty');
    const evidence=snapshotSectJobEvidence(world,actor);
    const tender=resolveOathAction(world,actor,plan.decision);
    actor.currentAction='FULFILL_OATH';
    expect(observeSectJob(world,actor,{discipleId:actor.id,jobId:'deliver'},plan,evidence,tender??undefined,true))
      .toMatchObject({phase:'on_route',line:'已携货到场，对方未到，货还在手里。'});
    expect(actor.herbs.jade_leaf).toBe(evidence.herbs.jade_leaf);
    actor.locationId='loc-market';
    const nearby=availableSparringActions(actor,world).find(row=>row.sparringMove==='offer'&&row.sparringRounds===1);
    const challenge=planSectJob(world,actor,'challenge');
    expect(challenge.kind).toBe('native');
    if(nearby&&challenge.kind==='native'&&challenge.decision.chosenAction==='SPARRING')
      expect(challenge.decision).toMatchObject({sparringMove:'offer',sparringRounds:1});
    expect(world.sparring.agreements).toEqual([]);
  });
});
