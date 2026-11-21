import {describe,expect,it} from 'vitest';
import {projectChapterTurningPoints} from '../src/engine/chronicleTurningPoints';
import {marketTurningChapter,politicalTurningChapter,troopTurningChapter,turningPerson} from './fixtures/chapterTurningPointsFixture';

describe('read-only scene arcs are bounded to real scoped historical decisions',()=>{
  it('starts with ordinary people and place; an independently present same-title order is not a turning cause',()=>{
    const f=marketTurningChapter(),{world,chapter,sourceIds,viewerId}=f;
    const exact=JSON.stringify(world);
    const result=projectChapterTurningPoints(world,chapter.id,viewerId);
    expect(result.arcs).toHaveLength(1);
    const arc=result.arcs[0];
    expect(arc).toMatchObject({id:sourceIds.terminal,consequenceEventId:sourceIds.terminal,links:[
      {fromEventId:sourceIds.buy,toEventId:sourceIds.terminal,relation:'matched_buy_order',sameTurn:true},
      {fromEventId:sourceIds.sell,toEventId:sourceIds.terminal,relation:'matched_sell_order',sameTurn:true},
    ]});
    expect(arc.scenes.map(row=>row.eventId)).toEqual([sourceIds.sell,sourceIds.buy,sourceIds.terminal]);
    expect(arc.scenes[0]).toMatchObject({siteName:'万仙坊市',kind:'market_sell_order',paragraph:expect.stringMatching(/^在万仙坊市，卖家/)});
    expect(arc.scenes.every(row=>!/^(?:仙历|第\d+轮|纪元)/u.test(row.paragraph))).toBe(true);
    expect(JSON.stringify(arc)).not.toContain(sourceIds.isolated);
    expect(result.separateEventIds).toContain(sourceIds.isolated);
    expect(JSON.stringify(world)).toBe(exact);
  });

  it('returns no forecast from a chapter not yet sealed or an unrelated branch ID, and refuses missing matched proof',()=>{
    const f=marketTurningChapter(),{world,chapter,viewerId,sourceIds}=f;
    expect(projectChapterTurningPoints(world,'different-branch-artifact',viewerId)).toEqual({arcs:[],separateEventIds:[]});
    expect(projectChapterTurningPoints(world,chapter.id,viewerId,chapter.endTick-1)).toEqual({arcs:[],separateEventIds:[]});
    const modified=structuredClone(world);
    const node=modified.chronicleCausality.nodes.find(row=>row.eventId===sourceIds.terminal)!;
    node.predecessors=node.predecessors.filter(row=>row.relation==='matched_buy_order');
    const read=projectChapterTurningPoints(modified,chapter.id,viewerId);
    expect(read.arcs).toEqual([]);
    expect(read.separateEventIds).toContain(sourceIds.terminal);
    expect(JSON.stringify(modified.chronicleArchive.chapters)).toBe(JSON.stringify(world.chronicleArchive.chapters));
  });

  it('keeps cross-market start and actual later settlement tied to the same shipment, but withholds a whole hidden path',()=>{
    const f=marketTurningChapter(true),{world,chapter,viewerId,sourceIds}=f;
    const result=projectChapterTurningPoints(world,chapter.id,viewerId);
    const arc=result.arcs[0];
    expect(arc?.links).toContainEqual({fromEventId:sourceIds.first,toEventId:sourceIds.terminal,relation:'settled_shipment',sameTurn:false});
    expect(arc?.scenes.at(-1)?.outcome).toBe('delivered');
    expect(arc?.scenes.find(row=>row.eventId===sourceIds.first)?.paragraph).not.toContain('万仙坊市'); // no raw distant endpoint mention
    const observer=turningPerson(world,viewerId);
    observer.realm='练气'; // actual current narrow visibility includes only the terminal desk.
    observer.exploredTileIds=world.terrain.tiles.map(row=>row.id); // explored is not current authorization.
    const clipped=projectChapterTurningPoints(world,chapter.id,viewerId);
    expect(clipped.arcs).toEqual([]);
    expect(clipped.separateEventIds).toContain(sourceIds.terminal);
    expect(clipped.separateEventIds).not.toContain(sourceIds.first);
    expect(projectChapterTurningPoints(world,chapter.id,f.outsiderId)).toEqual({arcs:[],separateEventIds:[]});
  });

  it('scopes actual vacancy and election to one native chain and never exposes a private signer or invented cause',()=>{
    const f=politicalTurningChapter(),{world,chapter,viewerId}=f;
    const before=structuredClone(chapter);
    const result=projectChapterTurningPoints(world,chapter.id,viewerId);
    expect(result.arcs).toHaveLength(1);
    expect(result.arcs[0]).toMatchObject({consequenceEventId:f.successionId,links:[
      {fromEventId:f.vacancyId,toEventId:f.successionId,relation:'filled_vacancy',sameTurn:true},
    ]});
    expect(JSON.stringify(result)).not.toContain(f.privateId);
    expect(chapter).toEqual(before);
    const stale=structuredClone(world);
    const vacancy=stale.events.find(row=>row.id===f.vacancyId)!;
    stale.events.push({...vacancy,witnessScope:'participants',title:'这是未经授权的来源'});
    const absent=projectChapterTurningPoints(stale,chapter.id,viewerId);
    expect(absent.arcs).toEqual([]);
    expect(JSON.stringify(absent)).not.toContain('未经授权');
    expect(chapter).toEqual(before);
  });

  it('shows only the genuinely withdrawn native army and keeps the exact prior agreement offer private',()=>{
    const f=troopTurningChapter(),{world,chapter,viewerId}=f;
    const result=projectChapterTurningPoints(world,chapter.id,viewerId);
    expect(result.arcs).toHaveLength(1);
    expect(result.arcs[0]).toMatchObject({consequenceEventId:f.signedId,links:[
      {fromEventId:f.siegeId,toEventId:f.signedId,relation:'withdrew_siege',sameTurn:false},
    ]});
    expect(JSON.stringify(result)).not.toContain(f.privateId);
    const missing=structuredClone(world);
    missing.ceasefires.agreements[0].withdrawnSiegeIds=[];
    expect(projectChapterTurningPoints(missing,chapter.id,viewerId).arcs).toEqual([]);
    const ambiguous=structuredClone(world);
    ambiguous.chronicleArchive.chapters.push({...chapter,title:'Unrelated lookalike'});
    expect(projectChapterTurningPoints(ambiguous,chapter.id,viewerId)).toEqual({arcs:[],separateEventIds:[]});
  });

  it('does not elevate a syntactically typed but unrelated native order into causal proof',()=>{
    const f=marketTurningChapter(),{world,chapter,viewerId,sourceIds}=f;
    const node=world.chronicleCausality.nodes.find(row=>row.eventId===sourceIds.terminal)!;
    const nativeSell=node.predecessors.find(row=>row.relation==='matched_sell_order')!;
    nativeSell.eventId=sourceIds.isolated;
    expect(projectChapterTurningPoints(world,chapter.id,viewerId).arcs).toEqual([]);
  });
});
