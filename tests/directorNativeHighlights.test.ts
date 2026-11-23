import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {auctionHighlightSource,dungeonHighlightSource,heartDemonHighlightSource,tournamentHighlightSource} from '../src/engine/director/nativeHighlights';
import {isHighlight} from '../src/engine/director/highlight';
import {advanceOccasions} from '../src/engine/occasionEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {actualNativeHeartFrame,trialActor,trialTurn} from './heartDemonNativeFixture';
import {actualNativeDungeonGate,dungeonActor,dungeonExplorer,dungeonMonth,dungeonOccasionIn,dungeonOutsider,enterNativeDungeon} from './expeditionDungeonNativeFixture';
import {actualAuctionBeforeListing,actualAuctionListed,auctionActor,auctionBidder,auctionTurn} from './immortalAuctionNativeFixture';

describe('director native highlight authority',()=>{
  it('shows three real paths, using the established guided queue for an attached predecessor',()=>{
    const {frame:world}=actualNativeHeartFrame();
    const actor=trialActor(world),offer=heartDemonHighlightSource.probe(world,actor)[0];
    expect(isHighlight(offer)).toBe(true);
    expect(offer.options.map(option=>option.id)).toEqual(['face','sever','wrath']);
    expect(heartDemonHighlightSource.choose?.(world,actor,offer,'invented')).toBe(false);
    expect(heartDemonHighlightSource.choose?.(world,actor,offer,'sever')).toBe(true);
    expect(actor.tribulation?.heartDemon?.result).toBeUndefined();
    expect(heartDemonHighlightSource.probe(world,actor)).toEqual([]);
    expect(trialActor(trialTurn(world)).tribulation?.heartDemon?.result).toMatchObject({choice:'sever',origin:'player'});
    const {frame:unguided}=actualNativeHeartFrame(false);
    const future=heartDemonHighlightSource.probe(unguided,trialActor(unguided))[0];
    expect(heartDemonHighlightSource.choose?.(unguided,trialActor(unguided),future,'face')).toBe(false);
    expect(heartDemonHighlightSource.decision?.(unguided,trialActor(unguided),future,'face')).toMatchObject({chosenAction:'FACE_TRIBULATION',heartDemonChoice:'face'});
  });

  it('offers a real paid-clue viewer the choice to register or stay outside, without prematurely entering',()=>{
    const {opening}=actualNativeDungeonGate();
    const actor=dungeonActor(opening),outsider=dungeonActor(opening,dungeonOutsider);
    const offer=dungeonHighlightSource.probe(opening,actor,opening.tick+1)[0];
    expect(isHighlight(offer)).toBe(true);
    expect(offer.sourceId).toBe(dungeonOccasionIn(opening).id+'-registration');
    expect(offer.siteId).toBe(actor.locationId);
    expect(offer.options.map(option=>option.id)).toEqual(['register','pass']);
    expect(dungeonHighlightSource.probe(opening,outsider,opening.tick+1)).toEqual([]);
    expect(dungeonHighlightSource.choose?.(opening,actor,offer,'pass')).toBe(true);
    expect(dungeonOccasionIn(opening).participantIds).toEqual([]);
    expect(dungeonHighlightSource.choose?.(opening,outsider,offer,'register')).toBe(false);
    expect(dungeonHighlightSource.choose?.(opening,actor,offer,'register')).toBe(true);
    expect(dungeonOccasionIn(opening).participantIds).toEqual([actor.id]);
    expect(dungeonActor(opening).locationId).toBe(offer.siteId);
    expect(dungeonOccasionIn(opening).dungeon).toBeUndefined();
  });

  it('dungeon choices are visible to the exact entrant and let a real herb advance the room',()=>{
    const {world}=enterNativeDungeon(),actor=dungeonActor(world);
    const offer=dungeonHighlightSource.probe(world,actor,world.tick+1)[0];
    expect(isHighlight(offer)).toBe(true);
    expect(offer.options.map(option=>option.id)).toEqual(['gather','retreat']);
    expect(dungeonHighlightSource.probe(world,dungeonActor(world,dungeonOutsider))).toEqual([]);
    const stock=actor.herbs.jade_leaf;
    const choice=dungeonHighlightSource.decision?.(world,actor,offer,'gather',world.tick+1);
    expect(choice?.dungeonMove).toBe('gather');
    const advanced=dungeonMonth(world,choice?{[dungeonExplorer]:choice}:{});
    expect(dungeonActor(advanced).herbs.jade_leaf).toBe(stock+1);
    expect(dungeonOccasionIn(advanced).dungeon?.room).toBe('hall');
    expect(dungeonHighlightSource.decision?.(advanced,dungeonActor(advanced),offer,'gather',advanced.tick+1)).toBeUndefined();
    expect(decodeEraWorldSave(encodeEraWorldSave(advanced)).occasions).toEqual(advanced.occasions);
  });

  it('shows exact bidder prices and charges only the native bid actually picked',()=>{
    const {listed,lot}=actualAuctionListed();
    const world=listed;
    const actor=auctionActor(world,auctionBidder);
    const offer=auctionHighlightSource.probe(world,actor,world.tick+1).find(row=>row.sourceId===lot.id)!;
    expect(isHighlight(offer)).toBe(true);
    expect(offer.options.map(option=>option.id)).toEqual(['bid-120','bid-130','pass']);
    const stones=actor.spiritStones;
    expect(auctionHighlightSource.choose?.(world,actor,offer,'pass')).toBe(true);
    expect(actor.spiritStones).toBe(stones);
    const choice=auctionHighlightSource.decision?.(world,actor,offer,'bid-130',world.tick+1);
    expect(choice?.auctionBidStones).toBe(130);
    const advanced=auctionTurn(world,choice?{[actor.id]:choice}:{});
    expect(auctionActor(advanced,actor.id).spiritStones).toBeLessThanOrEqual(stones-130);
    expect(advanced.immortalAuction?.lots.find(row=>row.id===lot.id)?.bids).toMatchObject([{bidderId:actor.id,stones:130,status:'held'}]);
    expect(auctionHighlightSource.decision?.(advanced,auctionActor(advanced,actor.id),offer,'bid-120',advanced.tick+1)).toBeUndefined();
  });

  it('settles a live auction price this month rather than queueing an already available move',()=>{
    const {listed,lot}=actualAuctionListed();
    const world=auctionTurn(listed),actor=auctionActor(world,auctionBidder);
    const offer=auctionHighlightSource.probe(world,actor,world.tick+1).find(row=>row.sourceId===lot.id)!;
    const price=actor.spiritStones;
    expect(auctionHighlightSource.decision?.(world,actor,offer,'bid-120',world.tick+1)).toBeUndefined();
    expect(auctionHighlightSource.choose?.(world,actor,offer,'bid-120')).toBe(true);
    expect(actor.spiritStones).toBe(price-120);
    expect(world.immortalAuction?.lots.find(row=>row.id===lot.id)?.bids).toMatchObject([{bidderId:actor.id,tick:world.tick,stones:120,status:'held'}]);
    expect(decodeEraWorldSave(encodeEraWorldSave(world)).immortalAuction).toEqual(world.immortalAuction);
  });

  it('does not promise a winter auction choice when the native birthday step comes first',()=>{
    const world=actualAuctionBeforeListing(),actor=auctionActor(world);
    expect(world.month).toBe(12);
    expect(auctionHighlightSource.probe(world,actor,world.tick+1).some(row=>row.options[0].id==='consign_artifact')).toBe(true);
    actor.age=actor.lifespan-1;
    expect(auctionHighlightSource.probe(world,actor,world.tick+1)).toEqual([]);
    expect(auctionActor(auctionTurn(world)).alive).toBe(false);
  });

  it('uses the native registration roster, not a prematurely awarded rank',()=>{
    const world=createInitialWorld(13071,'classic');
    world.tick=60;world.year+=4;world.month=12;
    world.events.push(...advanceOccasions(world,()=>.1));
    const actor=world.cultivators[0],offer=tournamentHighlightSource.probe(world,actor)[0];
    expect(isHighlight(offer)).toBe(true);
    expect(tournamentHighlightSource.choose?.(world,actor,offer,'pass')).toBe(true);
    expect(world.occasions[0].participantIds).toEqual([]);
    expect(tournamentHighlightSource.choose?.(world,actor,offer,'register')).toBe(true);
    expect(world.occasions[0]).toMatchObject({status:'registration',participantIds:[actor.id],bouts:[]});
    expect(tournamentHighlightSource.probe(world,actor)).toEqual([]);
  });
});
