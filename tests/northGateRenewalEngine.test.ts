import {describe,expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {advanceNorthGateRenewal,availableNorthGateRenewalActions,nativeNorthGateRenewalAuthorized,
  projectNorthGateRenewal,resolveNorthGateRenewalAction} from '../src/engine/northGateRenewalEngine';
import {findNorthGateRenewalSource,northGateRenewalApertureAuthorized,northGateRenewalBlocksOrdinaryOpening,
  northGateRenewalDue,northGateRenewalHasLegacyOpeningAfterDue} from '../src/engine/northGateRenewalTerms';
import type {NorthGateRenewalMove} from '../src/engine/northGateRenewalTerms';
import {availableWaterVeinActions,openRenewedNorthWaterGate,resolveWaterVeinAction} from '../src/engine/waterVeinEngine';
import {waterVeinApertureActive,waterVeinPhase} from '../src/engine/waterVeinTerms';
import {granaryAt,validVillageGranaryBook} from '../src/engine/villageGranaryEngine';
import type {WorldState} from '../src/types/world';

const HOLDING='elder-danxia-1',SIGNER='recruit-village-loc-vein-north-vol-1';
const NORTH='village-loc-vein-north';
function unitDate(world:WorldState,tick:number){
  // Resolver boundary fixture ONLY. This does not verify the 36,000-month native trajectory.
  world.tick=tick;world.year=1001+Math.floor((tick-1)/12);world.month=(tick-1)%12+1;
}
const treasury=(world:WorldState)=>world.sects.find(row=>row.id==='sect-danxia')!;
const actor=(world:WorldState,id=HOLDING)=>world.cultivators.find(row=>row.id===id)!;
function atDue(){
  const {world}=prepareNorthWellHistoricalSource();
  const source=findNorthGateRenewalSource(world)!;
  const due=northGateRenewalDue(source);
  unitDate(world,due);
  advanceNorthGateRenewal(world);
  return {world,source,due,hearing:world.northGateRenewal!.hearing};
}
function execute(world:WorldState,move:NorthGateRenewalMove,id=HOLDING){
  return resolveNorthGateRenewalAction(world,actor(world,id),{
    chosenAction:'NORTH_GATE_RENEWAL',innerMonologue:'独立原生裁决夹具',northGateRenewalMove:move,
    targetNorthGateRenewalId:world.northGateRenewal?.hearing.id,
  });
}

describe('north gate renewal monthly and funding authority',()=>{
  it('requires the paid detour proof and both actual loaded deliveries, with accurate prospective guards and no preview effects',()=>{
    const {world}=prepareNorthWellHistoricalSource();
    const source=findNorthGateRenewalSource(world);
    expect(source).toEqual({siteId:'loc-vein-north',settlementId:NORTH,charterId:'north-mining-charter-12',
      wellProjectId:'village-work-1',openingId:'water-gate-8',freightId:'village-supply-1',freightClosedTick:34,
      passageTick:23,passageTileId:'tile-13-2'});
    const different=structuredClone(world);
    different.villageSupply.agreements[0].legs![0].phase='lost';
    expect(findNorthGateRenewalSource(different)).toBeUndefined();
    expect(northGateRenewalBlocksOrdinaryOpening(different,36034)).toBe(false);
    unitDate(world,36033);
    expect(northGateRenewalBlocksOrdinaryOpening(world,36033)).toBe(false);
    expect(northGateRenewalBlocksOrdinaryOpening(world,36034)).toBe(true);
    expect(availableWaterVeinActions(actor(world),world,36034).some(row=>row.waterVeinMove==='open')).toBe(false);
    const before=JSON.stringify(world);
    expect(availableNorthGateRenewalActions(actor(world),world,36034).map(row=>row.northGateRenewalMove)).toEqual(['reuse','sect']);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('distinguishes a native pre-campaign opening at a historical gate cutoff without rewriting or recategorizing it',()=>{
    const {world}=prepareNorthWellHistoricalSource();
    const genuine=resolveWaterVeinAction(world,actor(world),{chosenAction:'WATER_VEIN',innerMonologue:'原规则真实开门',
      waterVeinMove:'open',targetLocationId:'loc-vein-north'});
    expect(genuine).not.toBeNull();
    const legacy=world.coldWaterVein!.openings.at(-1)!;
    expect(legacy.renewal).toBeUndefined();
    expect(northGateRenewalHasLegacyOpeningAfterDue(world,legacy.openedTick)).toBe(true);
    expect(northGateRenewalHasLegacyOpeningAfterDue(world,legacy.openedTick+1)).toBe(false);
    expect(northGateRenewalApertureAuthorized(world,legacy)).toBe(true);
    expect(world.northGateRenewal).toBeUndefined();
  });

  it('expires once without opening or payment, permanently refuses the old bypass and disallows the raw water funding API',()=>{
    const {world,hearing,due}=atDue();
    const initial=treasury(world).spiritStones, open=world.coldWaterVein!.openings.length;
    expect(nativeNorthGateRenewalAuthorized(world,actor(world),hearing.id,'reuse')).toBeUndefined();
    expect(openRenewedNorthWaterGate(world,actor(world),hearing.id,'reuse')).toBeNull();
    expect(projectNorthGateRenewal(world,actor(world))?.status).toBe('hearing');
    unitDate(world,due+6);
    advanceNorthGateRenewal(world);advanceNorthGateRenewal(world);
    expect(hearing.outcome).toEqual({kind:'failed',closedTick:due+6});
    expect(execute(world,'reuse')).toBeNull();
    expect(treasury(world).spiritStones).toBe(initial);
    expect(world.coldWaterVein!.openings).toHaveLength(open);
    expect(northGateRenewalBlocksOrdinaryOpening(world,due+7)).toBe(true);
    expect(availableWaterVeinActions(actor(world),world).some(row=>row.waterVeinMove==='open')).toBe(false);
  });

  it('funds either real reuse or real dry sector aperture once, without assigning cash or roots on a refusal',()=>{
    for(const [stance,paid,borrowed] of [['reuse',40,9],['sect',64,0]] as const){
      const {world,hearing,due}=atDue();
      const cash=treasury(world).spiritStones,roots=granaryAt(world,NORTH)!.roots;
      const untouched=JSON.stringify(world.northMiningCharters);
      expect(execute(world,stance)).not.toBeNull();
      expect(execute(world,stance)).toBeNull();
      expect(treasury(world).spiritStones).toBe(cash-paid);
      expect(granaryAt(world,NORTH)?.roots).toBe(roots);
      expect(JSON.stringify(world.northMiningCharters)).toBe(untouched);
      const opening=world.coldWaterVein!.openings.at(-1)!;
      expect(opening.renewal).toEqual({id:hearing.id,stance});
      expect(hearing.outcome).toMatchObject({kind:'reopened',stance,paidStones:paid,borrowedUnits:borrowed,granaryRoots:0});
      expect(northGateRenewalApertureAuthorized(world,opening)).toBe(true);
      expect(waterVeinApertureActive(opening,due+1)).toBe(true);
      expect(waterVeinPhase(opening,due+1).remainingUnits).toBe(borrowed);
      const noHearing=structuredClone(world);
      delete noHearing.northGateRenewal;
      expect(northGateRenewalApertureAuthorized(noHearing,opening)).toBe(false);
    }
    const {world}=atDue();
    treasury(world).spiritStones=39;
    expect(execute(world,'reuse')).toBeNull();
    expect(projectNorthGateRenewal(world,actor(world))?.blocked).toBe('funds');
  });

  it('does not treat a name as consent, charges nothing on signature or same-month attempt, and verifies the separate physically present member at final debit',()=>{
    const {world,hearing,due}=atDue();
    const cash=treasury(world).spiritStones,stock=granaryAt(world,NORTH)!;
    const roots=stock.roots;
    expect(execute(world,'accord')).toBeNull();
    expect(execute(world,'endorse')).toBeNull();
    expect(execute(world,'endorse',SIGNER)?.witnessScope).toBe('participants');
    expect(hearing.endorsement).toMatchObject({actorId:SIGNER,signedTick:due,recruitedTick:11});
    expect(execute(world,'accord')).toBeNull();
    expect(stock.roots).toBe(roots);
    expect(treasury(world).spiritStones).toBe(cash);
    unitDate(world,due+1);
    const actual=actor(world,SIGNER),original=actual.locationId;
    actual.locationId='loc-market';
    expect(execute(world,'accord')).toBeNull();
    expect(projectNorthGateRenewal(world,actual)).toBeUndefined();
    expect(stock.roots).toBe(roots);
    actual.locationId=original;
    expect(execute(world,'accord')).not.toBeNull();
    expect(hearing.outcome).toMatchObject({kind:'reopened',stance:'accord',paidStones:48,granaryRoots:1,borrowedUnits:3});
    expect(stock.roots).toBe(roots-1);
    expect(treasury(world).spiritStones).toBe(cash-48);
    expect(validVillageGranaryBook(world,stock)).toBe(true);
    const lowerView=projectNorthGateRenewal(world,actor(world));
    expect(lowerView).toMatchObject({scope:'lower',hasEndorsement:true,ownEndorsed:false});
    expect(JSON.stringify(lowerView)).not.toContain(SIGNER);
    actor(world).positionPlane='upper';actor(world).locationId='realm-upper-array';
    expect(projectNorthGateRenewal(world,actor(world))).toBeUndefined(); // No actual upper read.
  });
});
