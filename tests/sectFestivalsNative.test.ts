import { describe, expect, it, vi } from 'vitest';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { SETTLEMENT_RECRUIT_STIPEND } from '../src/engine/settlementEngine';
import { llmScheduler } from '../src/engine/llmScheduler';
import { marketClosureReason, resolveMarketAction } from '../src/engine/marketEngine';
import { quoteSectMeetingOrders } from '../src/engine/sectMeetingOrders';
import { visibleSectJobDefinitions } from '../src/engine/sectJobs';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { SectJobAssignment, SectJobObservation } from '../src/types/sectJobs';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '今日守静。' };
function fixture(origin: 'qingyun-odd-jobs' | 'drunken-sword-hermitage' = 'qingyun-odd-jobs') {
  const world = createManagedSectWorld(13071, 'classic', origin, 0)!;
  const state = world.sectManagement!;
  const discipleId = state.foundingDiscipleIds[0];
  return { world, state, discipleId, homeId: state.homeSiteId };
}
const actor = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
function advance(world: WorldState, rows?: readonly SectJobAssignment[], model?: { id: string; decision: LLMDecisionPayload }) {
  let report: readonly SectJobObservation[] | undefined;
  const orders = Object.fromEntries(world.cultivators.map(person => [person.id, person.id === model?.id ? model.decision : rest]));
  const next = advanceWorldTick(world, orders, () => .35, model ? 'deferred' : 'utility', undefined, {
    capturePresentation: false, sectJobAssignments: rows, modelActors: model ? new Set([model.id]) : undefined,
    onSectJobsSettled: value => {report = value;},
  });
  return { next, report };
}
const ids = (world:WorldState)=>visibleSectJobDefinitions(world).map(row=>row.id);
const seasonal = (world:WorldState)=>ids(world).filter(id=>id.startsWith('festival-'));

describe('江湖节庆的月步与存档', () => {
  it('只在晨会即将结算的时节报出专属差事，过月即撤下且旧档字节不变', () => {
    const {world,discipleId} = fixture();
    const old = encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(old))).toBe(old);
    expect(seasonal(world)).toEqual([]);
    const job = {discipleId,jobId:'festival-recruit'} as const;
    expect(quoteSectMeetingOrders(world,[job])).toBeUndefined();
    const february = advance(world).next;
    expect(february.month).toBe(2);
    expect(seasonal(february)).toEqual(['festival-recruit']);
    expect(quoteSectMeetingOrders(february,[job])).toEqual([job]);
    expect(quoteSectMeetingOrders(february,[job,job])).toBeUndefined();
    expect(quoteSectMeetingOrders(february,[{...job,month:3} as SectJobAssignment])).toBeUndefined();
    const march = advance(february).next;
    expect(march.month).toBe(3);
    expect(seasonal(march)).toEqual([]);
    expect(quoteSectMeetingOrders(march,[job])).toBeUndefined();
    expect(advance(march,[job]).report).toBeUndefined();
  });

  it('招新去程与同意入门分开，两个决策路径不把到站记成招得新人', async () => {
    const {world,discipleId} = fixture();
    const february = advance(world).next;
    const disciple = actor(february,discipleId);
    disciple.exploredTileIds = february.terrain.tiles.filter(tile=>tile.biome!=='魔渊'&&tile.biome!=='毒沼').map(tile=>tile.id);
    // A fresh outer disciple can carry the invitation, not approve enrollment.
    disciple.sectRank = '外门弟子';
    const quote = {discipleId,jobId:'festival-recruit'} as const;
    const preview = quoteSectMeetingOrders(february,[quote]);
    expect(preview).toEqual([quote]);
    const free = actor(february, february.sectManagement!.foundingDiscipleIds[1]);
    const mock = vi.fn(async () => new Response(JSON.stringify({choices:[{message:{content:'{"chosenAction":"REST"}'}}]})));
    vi.stubGlobal('fetch',mock);
    try {
      llmScheduler.resetTickBudget();
      const decision = await requestCultivatorLLMDecision(free,february,{
        enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'festival-fixture',
      },february.tick+1);
      if(!decision)throw Error('Expected an admitted mock decision');
      expect(mock).toHaveBeenCalledOnce();
      const utility = advance(february,[quote]);
      const cognitive = advance(february,[quote],{id:free.id,decision});
      expect(utility.report).toEqual(cognitive.report);
      expect(utility.report?.[0]).toMatchObject({jobId:quote.jobId,phase:'on_route'});
      expect(utility.next.settlements.records.some(row=>row.tick===utility.next.tick&&row.actorId===discipleId&&row.kind==='recruitment')).toBe(false);
      const found = utility.next.sectManagement!.latestReport!;
      expect(decodeEraWorldSave(encodeEraWorldSave(utility.next)).sectManagement?.latestReport).toEqual(found);
      const forged = structuredClone(utility.next);
      forged.sectManagement!.latestReport={...found,rows:[{...found.rows[0],phase:'performed',tier:'success'}]};
      expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement.latestReport/u);
      const rotated = advance(utility.next).next;
      const saved = encodeEraWorldSave(rotated);
      expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });

  it('十二月只预告下一年实到的考核，演功行事不另发第二笔奖', () => {
    const {world,discipleId,homeId}=fixture('drunken-sword-hermitage');
    expect(world.sectManagement?.growth?.review).toBeUndefined();
    let december = world;
    while(december.month!==12) december=advance(december).next;
    const person=actor(december,discipleId);
    person.locationId=homeId;
    person.qiProgress=0;
    const review={discipleId,jobId:'festival-review'} as const;
    expect(seasonal(december)).toEqual(['festival-review']);
    expect(quoteSectMeetingOrders(december,[review])).toEqual([review]);
    const worked=advance(december,[review]),quiet=advance(december);
    expect(worked.next.month).toBe(1);
    expect(worked.next.year).toBe(december.year+1);
    expect(worked.report?.[0]).toMatchObject({jobId:review.jobId,phase:'performed'});
    expect(actor(worked.next,discipleId).qiProgress).toBeGreaterThan(0);
    expect(worked.next.sectManagement?.growth?.review?.tick).toBe(worked.next.tick);
    expect(quiet.next.sectManagement?.growth?.review?.tick).toBe(worked.next.tick);
    expect(worked.next.events.filter(event=>event.tick===worked.next.tick&&event.title.includes("仙盟年考"))).toHaveLength(1);
    const saved=encodeEraWorldSave(worked.next);
    expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
    expect(quoteSectMeetingOrders(worked.next,[review])).toBeUndefined();
  });

  it('春招须长老亲到、有真心愿与安家钱，才写入实际招新记录',()=>{
    const {world,discipleId}=fixture();
    const february=advance(world).next;
    const disciple=actor(february,discipleId);
    const village=february.settlements.villages.find(row=>row.locationId==='loc-market')!;
    disciple.locationId=village.locationId;
    disciple.sectRank='长老';
    village.stress=5;
    const candidate=village.volunteers.find(row=>!row.enlistedCultivatorId)!;
    candidate.age=20;
    candidate.aptitude=100;
    candidate.willingness=100;
    for(const other of village.volunteers) if(other!==candidate)other.willingness=0;
    const sect= february.sects.find(row=>row.id===disciple.sectId)!;
    sect.spiritStones=120;
    const job={discipleId,jobId:'festival-recruit'} as const;
    const quiet=advance(february).next;
    const {next,report}=advance(february,[job]);
    expect(report?.[0]).toMatchObject({phase:'performed',siteId:village.locationId});
    const record=next.settlements.records.find(row=>row.tick===next.tick&&row.actorId===discipleId&&row.kind==='recruitment');
    expect(record).toMatchObject({settlementId:village.id,volunteerId:candidate.id,people:1,stones:SETTLEMENT_RECRUIT_STIPEND});
    expect(next.sects.find(row=>row.id===sect.id)?.spiritStones)
      .toBe(quiet.sects.find(row=>row.id===sect.id)!.spiritStones-SETTLEMENT_RECRUIT_STIPEND);
    const save=encodeEraWorldSave(next);
    expect(encodeEraWorldSave(decodeEraWorldSave(save))).toBe(save);
  });

  it('七月守门记录贡献而不替玩家还债，醉剑无债便没有这张差事',()=>{
    const {world,discipleId,homeId}=fixture();
    let june=world;
    while(june.month!==6)june=advance(june).next;
    const person=actor(june,discipleId);
    person.locationId=homeId;
    const debt=june.sectManagement!.debt!;
    const job={discipleId,jobId:'festival-debt'} as const;
    expect(june.tick+1).toBe(debt.dueTick);
    expect(quoteSectMeetingOrders(june,[job])).toEqual([job]);
    const quiet=advance(june).next;
    const {next,report}=advance(june,[job]);
    expect(next.sectManagement?.debt).toEqual(quiet.sectManagement?.debt);
    expect(report?.[0]).toMatchObject({phase:'performed',sourceEventId:`evt-${next.tick}-${discipleId}-management-festival-debt`,
      nativeEffects:[{kind:'contribution',stage:'native',amount:3}]});
    const save=encodeEraWorldSave(next);
    expect(encodeEraWorldSave(decodeEraWorldSave(save))).toBe(save);
    const damaged=structuredClone(next);
    const old=damaged.sectManagement!.latestReport!;
    damaged.sectManagement!.latestReport={...old,rows:[{...old.rows[0],jobId:'festival-review'}]};
    expect(()=>encodeEraWorldSave(damaged)).toThrow(/sectManagement.latestReport.festival/u);
    const other=fixture('drunken-sword-hermitage');
    expect(seasonal({...other.world,month:6})).toEqual([]);
    expect(quoteSectMeetingOrders({...other.world,month:6},[{discipleId:other.discipleId,jobId:'festival-debt'}])).toBeUndefined();
  });

  it('大集挂单以真实买盘和货品为证，不把报价本身记成卖出', () => {
    const {world,discipleId}=fixture('drunken-sword-hermitage');
    // Fix the calendar independently of the deterministic market-maintenance clock;
    // a market closed this September is not a baseline failure.
    const september={...world,month:9};
    const person=actor(september,discipleId);
    const market=september.locations.find(site=>site.type==='market'&&!marketClosureReason(september,site.id)&&
      !marketClosureReason({...september,tick:september.tick+1},site.id))!;
    const buyer=september.cultivators.find(row=>row.id!==discipleId&&row.alive&&row.hp>0&&!row.positionPlane&&row.spiritStones>=100)!;
    person.locationId=market.id;
    buyer.locationId=market.id;
    person.herbs.jade_leaf=3;
    const sold={discipleId,jobId:'festival-market'} as const;
    expect(quoteSectMeetingOrders(september,[sold])).toBeUndefined();
    const before=september.markets.orders.length;
    expect(resolveMarketAction(september,buyer,{chosenAction:'PLACE_MARKET_BUY',marketGood:'jade_leaf',marketQuantity:1,marketLimitPrice:20,innerMonologue:'买一叶。'})).toBeTruthy();
    expect(september.markets.orders.length).toBe(before+1);
    expect(quoteSectMeetingOrders(september,[sold])).toEqual([sold]);
    const {next,report}=advance(september,[sold]);
    expect(next.month).toBe(10);
    expect(report?.[0]).toMatchObject({jobId:sold.jobId,phase:'on_route'});
    expect(report?.[0].line).toContain('尚不能说卖出');
    expect(next.markets.orders.some(row=>row.actorId===discipleId&&row.side==='sell'&&row.placedTick===next.tick&&row.quantity===1)).toBe(true);
  });
});
