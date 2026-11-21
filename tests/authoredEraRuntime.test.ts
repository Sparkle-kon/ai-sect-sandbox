import {availableAvatarHosts,possessAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {describe,expect,it} from 'vitest';
import {splitAuthoredEraChronicle} from '../src/components/AuthoredEraChronicle';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyAuthoredEraDesign} from '../src/engine/authoredEraEngine';
import {campaignSHA256,readCampaignSource,sealCampaignSource} from '../src/engine/campaignMemento';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {createEraDesignDraft,encodeEraDesignDraft} from '../src/engine/eraDesignDraft';
import {listAlignedBranchTicks} from '../src/engine/branchComparisonEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {appendAuthoredTimelineRoot,createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {sameGeneratedWorld} from '../src/engine/worldIdentity';
import type {WorldState} from '../src/types/world';

const seed=2031,profile='spirit-bloom',north='loc-vein-north';
const members=['elder-danxia-2','founder-spirit-bloom-sect-danxia-1','founder-spirit-bloom-sect-danxia-2'];
const rulesRevision='a'.repeat(64);
const encoder=new TextEncoder();
const turn=(world:WorldState)=>advanceWorldTick(world,{},undefined,'utility');
const worldSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const worldSect=(world:WorldState,id:string)=>world.sects.find(row=>row.id===id)!;
const worldVillage=(world:WorldState)=>world.settlements.villages.find(row=>row.id==='village-loc-market')!;
const worldActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const editor=()=>createEraDesignDraft(seed,profile,{year:1001,month:1},{year:1001,month:2},[
  {kind:'jade_vein_depleted',siteId:north,spiritQi:60,jadeCapacity:0},
  {kind:'danxia_branch_moves_north',destinationId:north,memberIds:members,stones:25},
  {kind:'village_capacity',settlementId:'village-loc-market',capacity:250},
]);

async function generated(){
  const draft=editor(),startingWorld=createInitialWorld(seed,profile),baseline=turn(startingWorld);
  const baselineText=encodeEraWorldSave(baseline);
  const [baselineDigest,designDigest]=await Promise.all([campaignSHA256(encoder.encode(baselineText)),
    campaignSHA256(encoder.encode(encodeEraDesignDraft(draft)))]);
  const proof={rulesRevision,designDigest,baselineDigest};
  const world=applyAuthoredEraDesign(draft,baseline,proof);
  return {world,baseline,baselineText,startingWorld,draft,proof};
}
const exactBranchShape=(timeline:ReturnType<typeof createTimeline>)=>timeline.branches.map(row=>({id:row.id,label:row.label,
  parentBranchId:row.parentBranchId,forkTick:row.forkTick,snapshots:row.snapshots.map(point=>encodeEraWorldSave(point.world))}));
const eraInput=(bytes:Uint8Array)=>({size:bytes.byteLength,arrayBuffer:async()=>bytes.slice().buffer});

describe('independent authored future, native historical facts and persistent branch topology',()=>{
  it('runs the genuine procedural past, transfers only named current members and actual stock/title, preserves actual ledgers/events',async()=>{
    const {world,baseline,baselineText,draft,proof}=await generated();
    const manifest=world.authoredEraOrigin!;
    const [depleted,moved,capacity]=manifest.effects;
    expect(manifest).toMatchObject({version:1,openedTick:2,year:1001,month:2,baselineDigest:proof.baselineDigest,
      designDigest:proof.designDigest,rulesRevision,draft});
    expect(depleted).toMatchObject({kind:'jade_vein_depleted',after:{spiritQi:60,jadeCapacity:0,jade:0}});
    expect(moved).toMatchObject({kind:'danxia_branch_moves_north',memberIds:members,branchLeaderId:'elder-danxia-2',
      parentStonesBefore:8213,parentStonesAfter:8188,branchStones:25,stayingIds:expect.arrayContaining(['npc-5','elder-danxia-1'])});
    if(moved.kind!=='danxia_branch_moves_north')throw Error('Missing exact authored founding manifest');
    expect(capacity).toMatchObject({kind:'village_capacity',capacityAfter:250,population:worldVillage(baseline).population});
    expect(worldSect(world,'sect-danxia').spiritStones+worldSect(world,moved.branchSectId).spiritStones)
      .toBe(worldSect(baseline,'sect-danxia').spiritStones);
    expect(worldSect(world,moved.branchSectId).pavilion).toEqual([]);
    expect(worldSect(world,'sect-danxia').pavilion).toEqual(worldSect(baseline,'sect-danxia').pavilion);
    expect(world.terrain.tiles.filter(row=>row.ownerSectId===moved.branchSectId).map(row=>row.id)).toEqual([moved.tileId]);
    expect(worldSite(baseline,north).ownerSectId).toBeUndefined();
    expect(worldSite(world,north).ownerSectId).toBe(moved.branchSectId);
    expect(worldVillage(world)).toEqual({...worldVillage(baseline),capacity:250});
    for(const id of members){
      expect(worldActor(world,id)).toMatchObject({alive:true,locationId:north,sectId:moved.branchSectId});
      expect(worldActor(world,id).spiritStones).toBe(worldActor(baseline,id).spiritStones);
      expect(worldActor(world,id).memories).toEqual(worldActor(baseline,id).memories);
    }
    for(const key of ['random','events','eraHistory','chronicleArchive','coldHistory','households','couriers','oaths',
      'credit','markets','danxiaMedicine','relocations','workshops'] as const){
      expect(world[key]).toEqual(baseline[key]);
    }
    expect(world.cultivators.map(row=>row.id)).toEqual(baseline.cultivators.map(row=>row.id));
    expect(encodeEraWorldSave(baseline)).toBe(baselineText);
    expect(encodeEraWorldSave(world)).toBe(encodeEraWorldSave(applyAuthoredEraDesign(draft,baseline,proof)));
    expect(sameGeneratedWorld(world,baseline)).toBe(false);
    expect(sameGeneratedWorld(baseline,decodeWorldSave(encodeWorldSave(baseline)))).toBe(true);
    const conflict={...draft,conditions:[{kind:'jade_vein_depleted',siteId:north,spiritQi:5,jadeCapacity:0},
      ...draft.conditions.slice(1)]};
    expect(()=>applyAuthoredEraDesign(conflict,baseline,proof)).toThrow(expect.objectContaining({code:'design_conflict'}));
    expect(encodeEraWorldSave(baseline)).toBe(baselineText);
  });

  it('strictly saves exact authored evidence, then resumes real next month after a same-date player intervention and divided .era export',async()=>{
    const {world}=await generated();
    const raw=encodeWorldSave(world);
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    for(const edit of ['date','digest','effect','labels','title','native_stamp'] as const){
      const forged=structuredClone(world), origin=forged.authoredEraOrigin!;
      if(edit==='date')origin.openedTick++;
      if(edit==='digest')origin.id='authored-era-'+('0'.repeat(32));
      if(edit==='effect'&&origin.effects[1].kind==='danxia_branch_moves_north')origin.effects[1].branchStones++;
      if(edit==='labels')Object.assign(origin.effects[0],{native:true});
      if(edit==='title')delete worldSite(forged,north).ownerSectId;
      if(edit==='native_stamp')delete forged.authoredEraOrigin;
      expect(()=>encodeEraWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
    const changedDraft=structuredClone(world),draft=changedDraft.authoredEraOrigin!.draft;
    changedDraft.authoredEraOrigin!.draft={...draft,conditions:[{kind:'jade_vein_depleted',siteId:north,spiritQi:61,jadeCapacity:0},
      ...draft.conditions.slice(1)]};
    expect(changedDraft.authoredEraOrigin!.id).toBe(world.authoredEraOrigin!.id);
    expect(sameGeneratedWorld(world,changedDraft)).toBe(false);
    const acted=executeGodIntervention(world,{type:'SPAWN_TREASURE',targetLocationId:north});
    expect(acted.interventionSequence).toBe(world.interventionSequence+1);
    expect(worldSite(acted,north).spiritQi).toBeGreaterThan(worldSite(world,north).spiritQi);
    const opening=splitAuthoredEraChronicle(world,world.events)!;
    expect(opening.prior.length).toBeGreaterThan(0);
    expect(opening.later).toEqual([]);
    const sameDate=splitAuthoredEraChronicle(acted,acted.events)!;
    expect(sameDate.later.some(event=>event.id.startsWith('evt-god-treasure-')&&event.tick===world.tick)).toBe(true);
    expect(sameDate.prior.map(event=>event.id)).toEqual(opening.prior.map(event=>event.id));
    expect(sameDate.prior.every(event=>event.witnessScope!=='participants')).toBe(true);

    const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
    const archive=await prepareEraCheckpoint(acted,{branchId:'branch-2',timelineId:'parallel-authored-era'},codec,{engineRuleVersion:rulesRevision});
    const restored=await verifyEraCheckpoint(eraInput(archive.manifestFile.bytes),archive.parts.map(part=>eraInput(part.bytes)),codec);
    expect(encodeEraWorldSave(restored.world)).toBe(encodeEraWorldSave(acted));
    expect(encodeEraWorldSave(turn(restored.world))).toBe(encodeEraWorldSave(turn(acted)));
    expect(turn(acted).authoredEraOrigin).toEqual(world.authoredEraOrigin);
    const entered=decodeEraWorldSave(encodeEraWorldSave(acted));
    const chosen=availableAvatarHosts(entered).find(actor=>members.includes(actor.id))!;
    expect(chosen).toBeDefined();
    expect(entered.playerAvatar.possessedId).toBeUndefined();
    expect(possessAvatar(entered,chosen.id)).toBe(true);
    expect(queueAvatarOrder(entered,'REST')).toBe(true);
    expect(entered.tick).toBe(world.tick);
    const next=turn(entered);
    expect(next.tick).toBe(world.tick+1);
    expect(worldActor(next,chosen.id).currentAction).toBe('REST');
    expect(world.playerAvatar.possessedId).toBeUndefined();

  });

  it('appends one independent root by exact same live head, then durably preserves it and two native branches without inventing ancestry',async()=>{
    const {startingWorld,baseline,world}=await generated();
    const initial=recordTimelineWorld(createTimeline(startingWorld),baseline);
    const nativeFork=forkTimeline(initial,baseline.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-market'});
    const original=selectTimelineBranch(nativeFork,'main');
    const target=original.branches[0].snapshots.at(-1)!;
    const before=exactBranchShape(original);
    expect(()=>appendAuthoredTimelineRoot(original,'main',{...target},world)).toThrow(expect.objectContaining({code:'invalid_authored_root'}));
    const added=appendAuthoredTimelineRoot(original,'main',target,world);
    expect(added.branches).toHaveLength(3);
    expect(added.branches[0]).toBe(original.branches[0]);
    expect(added.branches[1]).toBe(original.branches[1]);
    expect(added.branches[2]).not.toHaveProperty('parentBranchId');
    expect(added.branches[2]).not.toHaveProperty('forkTick');
    expect(added.branches[2].snapshots).toHaveLength(1);
    expect(added.activeBranchId).toBe('branch-2');
    expect(exactBranchShape(original)).toEqual(before);
    expect(recordTimelineWorld(added,baseline)).toBe(added);
    expect(listAlignedBranchTicks(added,'main','branch-2')).toEqual([]);
    expect(()=>appendAuthoredTimelineRoot(added,'branch-2',added.branches[2].snapshots[0],world)).toThrow(expect.objectContaining({code:'invalid_authored_root'}));
    const addedFork=forkTimeline(added,world.tick,{type:'SPAWN_TREASURE',targetLocationId:north});
    expect(addedFork.branches[3]).toMatchObject({parentBranchId:'branch-2',forkTick:world.tick});
    expect(()=>appendAuthoredTimelineRoot(addedFork,'branch-3',addedFork.branches[3].snapshots[0],world)).toThrow(expect.objectContaining({code:'branch_limit'}));
    const active=readTimelineHead(addedFork)!;
    const packed=await sealCampaignSource(addedFork,'parallel-authored-era',active);
    const restored=await readCampaignSource(structuredClone(packed));
    expect(exactBranchShape(restored.timeline)).toEqual(exactBranchShape(addedFork));
    expect(restored.timeline.activeBranchId).toBe('branch-3');
    expect(encodeEraWorldSave(restored.world)).toBe(encodeEraWorldSave(active));
    const falseEdge=structuredClone(addedFork);
    Object.assign(falseEdge.branches[2],{parentBranchId:'main',forkTick:world.tick});
    await expect(sealCampaignSource(falseEdge,'parallel-authored-era',active)).rejects.toMatchObject({code:'invalid'});
    const fakeRoot=structuredClone(addedFork);
    Reflect.deleteProperty(fakeRoot.branches[1],'parentBranchId');
    Reflect.deleteProperty(fakeRoot.branches[1],'forkTick');
    await expect(sealCampaignSource(fakeRoot,'parallel-authored-era',active)).rejects.toMatchObject({code:'invalid'});
  });
});
