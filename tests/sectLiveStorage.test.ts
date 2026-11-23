import {describe,expect,it} from 'vitest';
import {applySectLiveCommand} from '../src/engine/sectLive';
import {buildConfirmedShareSave,prepareShareSavePrivacy} from '../src/engine/shareSavePrivacy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {isSectLiveText,type SectLiveShow} from '../src/types/sectLive';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'原地歇一歇。'};
const start=()=>createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0)!;
function turn(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={}){
  const choices=Object.fromEntries(world.cultivators.map(actor=>[actor.id,orders[actor.id]??rest]));
  return advanceWorldTick(world,choices,()=>.2,'utility',undefined,{capturePresentation:false,captureTrace:false});
}
function trial(){
  const opening=start(),{leaderId,sectId}=opening.sectManagement!;
  const leader=opening.cultivators.find(actor=>actor.id===leaderId)!;
  Object.assign(leader,{realm:'筑基',realmStage:9,qiProgress:100});
  const world=turn(opening,{[leaderId]:{chosenAction:'BREAKTHROUGH',innerMonologue:'守山门引雷。'}});
  const show=world.sectManagement?.live?.shows.find(row=>row.kind==='tribulation');
  if(!show)throw new Error('Expected original native tribulation shown this month');
  return {world,show,leaderId,sectId};
}

describe('portable Tianji shows and real treasury receipts',()=>{
  it('keeps old save bytes and retains only the already public show, player lines and debit proof in shared saves',()=>{
    const legacy=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(legacy).sectManagement?.live).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(legacy))).toBe(legacy);
    const {world,show,sectId}=trial();
    const before=world.sects.find(row=>row.id===sectId)!.spiritStones;
    expect(applySectLiveCommand(world,{kind:'danmaku',showId:show.id,text:'且听风起。'})).toBe(true);
    expect(applySectLiveCommand(world,{kind:'gift',showId:show.id})).toBe(true);
    expect(world.sects.find(row=>row.id===sectId)?.spiritStones).toBe(before-3);
    const original=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(original))).toBe(original);
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true});
    const copy=decodeWorldSave(buildConfirmedShareSave(world,review)!.json);
    expect(copy.sectManagement?.live).toEqual(world.sectManagement?.live);
    expect(copy.resourceFlow).toEqual(world.resourceFlow);
    expect(encodeEraWorldSave(world)).toBe(original);
  });

  it('rejects a missing or forged live source, unsupported speaker, gift without debit or unmatched debit',()=>{
    const {world,show,leaderId,sectId}=trial(),management=world.sectManagement!,live=management.live!;
    expect(isSectLiveText('𠀀'.repeat(40))).toBe(true);
    expect(isSectLiveText('𠀀'.repeat(41))).toBe(false);
    const broken:readonly (readonly SectLiveShow[])[]=[
      [{...show,siteId:'loc-market'}],
      [{...show,kind:'combat'}],
      [{...show,sourceEventId:'forged'}],
      [{...show,danmaku:[{actorId:leaderId,variant:0}]}],
      [{...show,playerLines:['<i>不当外链</i>']}],
      [{...show,playerLines:['一','二','三','四']}],
      [{...show,gift:{tick:world.tick,leaderId,sectId,cost:3,reputation:1}}],
      [show,show],
    ];
    for(const shows of broken){
      management.live={shows};
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.live/u);
    }
    management.live=live;
    expect(applySectLiveCommand(world,{kind:'gift',showId:show.id})).toBe(true);
    management.live=live;
    expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.live.giftFlow/u);
  });

  it('validates the real gift proof after its original transaction month ages out of bounded flow',()=>{
    const {world,show}=trial();
    expect(applySectLiveCommand(world,{kind:'gift',showId:show.id})).toBe(true);
    let later=world;
    for(let i=0;i<6;i++)later=turn(later);
    expect(later.resourceFlow.months.some(book=>book.tick===show.tick)).toBe(false);
    expect(later.sectManagement?.live?.shows.find(row=>row.id===show.id)?.gift?.cost).toBe(3);
    const archive=encodeEraWorldSave(later);
    expect(encodeEraWorldSave(decodeEraWorldSave(archive))).toBe(archive);
  });
});
