import {describe,expect,it,vi} from 'vitest';
import {
  ERA_DESIGN_MAX_BYTES, createEraDesignDraft, decodeEraDesignDraft, encodeEraDesignDraft, eraDesignCatalog,
  previewEraDesignDraft, readEraDesignDraft, writeEraDesignDraft, ERA_DESIGN_STORAGE_KEY,
  validateEraDesignDraft, type EraDesignCondition
} from '../src/engine/eraDesignDraft';
import {createInitialWorld} from '../src/data/initialWorld';
import {createMemorySaveBackend,createSaveStore,encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

const seed=2031;
const anchor={year:1005,month:12}, target={year:1007,month:2};
const north='loc-vein-north';
const drain={kind:'jade_vein_depleted',siteId:north,spiritQi:5,jadeCapacity:0} as const;
const relocation={kind:'danxia_branch_moves_north',destinationId:north,memberIds:['npc-6','elder-danxia-2','elder-danxia-1'],stones:25} as const;
const capacity={kind:'village_capacity',settlementId:'village-loc-market',capacity:250} as const;
const withTwo=[drain,relocation] as const;
const make=(conditions:readonly EraDesignCondition[]=withTwo)=>createEraDesignDraft(seed,'classic',anchor,target,conditions);

describe('bounded authored conditions in a distinct replay-free draft format',()=>{
  it('accepts two or three structured conditions and takes an independent canonical copy',()=>{
    const inputMembers:string[]=[...relocation.memberIds];
    const mutable={...relocation,memberIds:inputMembers};
    const draft=make([drain,mutable,capacity]);
    inputMembers[0]='replacement-chooser';
    expect(draft.conditions).toEqual([drain,{...relocation,memberIds:[...relocation.memberIds].sort()},capacity]);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.conditions)).toBe(true);
    expect(Object.isFrozen(draft.conditions[1])).toBe(true);
    expect(Object.isFrozen(draft.anchor)).toBe(true);
    expect(decodeEraDesignDraft(encodeEraDesignDraft(draft))).toEqual(draft);
    expect(make().conditions).toHaveLength(2);
    expect(()=>make([])).toThrow(expect.objectContaining({code:'schema'}));
    expect(()=>make([drain])).toThrow(expect.objectContaining({code:'schema'}));
    expect(()=>make([...withTwo,capacity,capacity])).toThrow(expect.objectContaining({code:'schema'}));
    expect(()=>make([...withTwo,{...drain,spiritQi:13}])).toThrow(expect.objectContaining({code:'duplicate_condition',conditionIndex:2}));
    expect(()=>make([relocation,{...relocation,memberIds:[...relocation.memberIds].reverse()}])).toThrow(
      expect.objectContaining({code:'duplicate_condition',conditionIndex:1}));
  });

  it('bounds future target by native calendar, including next January and exact inclusive 1200 months',()=>{
    const future=(day:unknown)=>validateEraDesignDraft({...make(),target:day});
    expect(future({year:1006,month:1}).target).toEqual({year:1006,month:1});
    expect(future({year:1105,month:12}).target).toEqual({year:1105,month:12});
    expect(()=>future({year:1106,month:1})).toThrow(expect.objectContaining({code:'out_of_range'}));
    for(const date of [anchor,{year:1005,month:11},{year:1004,month:12}]){
      expect(()=>future(date)).toThrow(expect.objectContaining({code:'not_future'}));
    }
    for(const date of [{year:1006,month:0},{year:1006,month:13},{year:1006,month:1.2},{year:'1006',month:1},
      {year:Number.MAX_SAFE_INTEGER+1,month:1},{year:NaN,month:1},{year:1006,month:1,tick:9}]){
      expect(()=>future(date)).toThrow(expect.objectContaining({code:'invalid_date'}));
    }
  });

  it('refuses unsupported extra data and does not execute getters while checking local draft objects',()=>{
    const valid=make(), getSite=vi.fn(()=>north);
    const accessor=Object.defineProperty({...drain},'siteId',{get:getSite,enumerable:true});
    const condition=(first:unknown)=>validateEraDesignDraft({...valid,conditions:[first,relocation]});
    expect(()=>condition(accessor)).toThrow(expect.objectContaining({code:'schema'}));
    expect(getSite).not.toHaveBeenCalled();
    for(const extras of [{...drain,inventedScene:'authors are not transcript'},Object.create(drain),{...drain,[Symbol('x')]:5},
      {...drain,spiritQi:Infinity},{...drain,jadeCapacity:-1}]){
      expect(()=>condition(extras)).toThrow(expect.objectContaining({code:'schema'}));
    }
    const sparse=new Array(2);sparse[1]=relocation;
    expect(()=>validateEraDesignDraft({...valid,conditions:sparse})).toThrow(expect.objectContaining({code:'schema'}));
    // String length is deliberately under the ceiling; actual input byte length is not.
    expect(()=>decodeEraDesignDraft('界'.repeat(Math.floor(ERA_DESIGN_MAX_BYTES/2)))).toThrow(expect.objectContaining({code:'size'}));
  });

  it('exposes only public baseline catalog fields and actual generated actors in the chosen profile',()=>{
    const classic=eraDesignCatalog(seed,'classic'), bloom=eraDesignCatalog(seed,'spirit-bloom');
    const classicWorld=createInitialWorld(seed,'classic'), bloomWorld=createInitialWorld(seed,'spirit-bloom');
    const known=bloomWorld.cultivators.find(row=>row.id==='founder-spirit-bloom-sect-danxia-1')!;
    const parent=bloomWorld.sects.find(row=>row.id==='sect-danxia')!;
    expect(known.sectId).toBe('sect-danxia');
    expect(bloom.danxiaMembers).toContainEqual({id:known.id,name:known.name,age:known.age,lifespan:known.lifespan});
    expect(classic.danxiaMembers.some(row=>row.id===known.id)).toBe(false);
    expect(bloom.danxiaMembers.some(row=>row.id===parent.leaderId)).toBe(false);
    expect(JSON.stringify(bloom)).not.toMatch(/secretGoal|innerMonologue|rumors/);
    expect(classic.depletionSites.find(row=>row.id===north)?.spiritQi).toBe(classicWorld.locations.find(row=>row.id===north)?.spiritQi);
    expect(classic.danxia?.stones).toBe(classicWorld.sects.find(row=>row.id==='sect-danxia')?.spiritStones);
  });
});


describe('honest scenario editor preview independent of the active play state',()=>{
  it('shows the exact drained north seat conflict and refuses unstated actor and treasury assumptions',()=>{
    const authored=previewEraDesignDraft(make());
    expect(authored).toMatchObject({monthsAhead:14,ready:false,conditions:[
      {kind:drain.kind,origin:'author_design',targetName:'极北寒玉脉',effectiveQi:5},
      {kind:relocation.kind,origin:'author_design',targetName:'极北寒玉脉',effectiveQi:5,
        memberNames:expect.arrayContaining(['韩立风','闻春岚','叶连翘']),quotedStones:25,baselineStones:8200},
    ]});
    expect(authored.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'insufficient_land_support',conditionIndex:1,severity:'conflict'}),
    ]));
    const safeQi={...drain,spiritQi:60};
    const profileMember='founder-spirit-bloom-sect-danxia-1';
    const offered={...relocation,memberIds:['elder-danxia-1','elder-danxia-2',profileMember]};
    const bloom=previewEraDesignDraft(createEraDesignDraft(seed,'spirit-bloom',anchor,target,[safeQi,offered]));
    expect(bloom.conditions[1].memberNames).toHaveLength(3);
    expect(bloom.issues.some(row=>row.code==='unknown_member')).toBe(false);
    expect(previewEraDesignDraft(make([safeQi,offered])).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'unknown_member',conditionIndex:1,severity:'conflict'}),
    ]));
    const wrong=previewEraDesignDraft(make([safeQi,
      {...relocation,memberIds:['npc-5','npc-1','npc-6','npc-6','nobody-with-same-display-name'],stones:50_000},capacity]));
    expect(wrong.ready).toBe(false);
    expect(wrong.issues.map(row=>row.code)).toEqual(expect.arrayContaining(['member_duplicate','unknown_member','insufficient_treasury']));
    const later=previewEraDesignDraft(createEraDesignDraft(seed,'spirit-bloom',anchor,{year:1105,month:12},[safeQi,offered]));
    expect(later.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'future_member_unverified',conditionIndex:1,severity:'caution',message:expect.stringContaining('不保证未来')}),
    ]));
  });
  it('opens and saves only its own namespace, retains original date, and leaves actual world, branches and slot revisions byte-identical',async()=>{
    const live=advanceWorldTick(createInitialWorld(717,'classic'),{},undefined,'utility');
    const timeline=forkTimeline(createTimeline(live),live.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-danxia'},'旁支');
    expect(timeline.branches).toHaveLength(2);
    const branchId=timeline.activeBranchId;
    const worldBefore=encodeWorldSave(live);
    const branchesBefore=timeline.branches.map(row=>row.snapshots.map(point=>encodeWorldSave(point.world)));
    const backend=createMemorySaveBackend(), store=createSaveStore(backend,()=>17000);
    await store.save('slot-1','正在游玩的原局',live,null,{branchId:timeline.branches[0].id});
    const forked=timeline.branches[1].snapshots.at(-1)!.world;
    await store.save('slot-2','另一路实际存档',forked,null,{branchId:timeline.branches[1].id});
    const addresses=['slot-1','slot-2'] as const;
    const before=await Promise.all(addresses.map(id=>backend.read(id)));
    const slotRead=vi.spyOn(backend,'read'), slotList=vi.spyOn(backend,'list'), slotCommit=vi.spyOn(backend,'commit');
    const local=new Map([['ai-sect-sandbox:saves:v1:slot-1','existing-save-marker'],
      ['ai-sect-sandbox:saves:v1:slot-2','existing-prev-marker']]);
    const storage={getItem:vi.fn((key:string)=>local.get(key)??null),setItem:vi.fn((key:string,value:string)=>{local.set(key,value);})};
    expect(readEraDesignDraft(storage)).toBeUndefined();
    const draft=make();
    expect(previewEraDesignDraft(draft,live).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'editor_date_changed',severity:'caution'}),
    ]));
    expect(writeEraDesignDraft(draft,storage)).toBe(true);
    const restored=readEraDesignDraft(storage);
    expect(restored).toEqual(draft);
    expect(restored!.anchor).toEqual(anchor);
    expect(previewEraDesignDraft(restored,{year:1009,month:1}).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'editor_target_passed',severity:'caution'}),
    ]));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(ERA_DESIGN_STORAGE_KEY,encodeEraDesignDraft(draft));
    expect(storage.getItem.mock.calls).toEqual([[ERA_DESIGN_STORAGE_KEY],[ERA_DESIGN_STORAGE_KEY]]);
    expect(local.get('ai-sect-sandbox:saves:v1:slot-1')).toBe('existing-save-marker');
    expect(local.get('ai-sect-sandbox:saves:v1:slot-2')).toBe('existing-prev-marker');
    expect(timeline.activeBranchId).toBe(branchId);
    expect(timeline.branches.map(row=>row.snapshots.map(point=>encodeWorldSave(point.world)))).toEqual(branchesBefore);
    expect(encodeWorldSave(live)).toBe(worldBefore);
    expect(slotRead).not.toHaveBeenCalled();
    expect(slotList).not.toHaveBeenCalled();
    expect(slotCommit).not.toHaveBeenCalled();
    expect(await Promise.all(addresses.map(id=>backend.read(id)))).toEqual(before);
    slotRead.mockRestore(); slotList.mockRestore(); slotCommit.mockRestore();
  });
  it('returns no fantasy recovered drafts if local reads are corrupt or storage access fails',()=>{
    const draft=make(), denied={getItem:()=>{throw new Error('disabled');},setItem:()=>{throw new Error('quota');}};
    expect(readEraDesignDraft(denied)).toBeUndefined();
    expect(writeEraDesignDraft(draft,denied)).toBe(false);
    expect(readEraDesignDraft({getItem:()=>'{broken',setItem:vi.fn()})).toBeUndefined();
  });
});
