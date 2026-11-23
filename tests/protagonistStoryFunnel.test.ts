import {describe,expect,it} from 'vitest';
import {createProtagonistStoryFunnel} from '../scripts/protagonistStoryFunnel';
import {action,earnedAcceptedWorld,hunterId,leadId,turn} from './protagonistFlightNativeFixture';
import {electNativeHandoff,nativeHandoffCompetition} from './fixtures/protagonistHandoffSuccessionFixture';

describe('protagonist audit predecessor counts',()=>{
  it('separates an ordinary duel from the real bounty pursuit and records actual flight',()=>{
    const {world,bountyId}=earnedAcceptedWorld(),normal=turn(world,{[hunterId]:action('DUEL',{targetCultivatorId:leadId})});
    const noPursuit=createProtagonistStoryFunnel();
    noPursuit.observe({before:world,after:normal,events:normal.events.filter(row=>row.tick===normal.tick)});
    expect(noPursuit.summary().flight).toMatchObject({leadMonths:1,priorEscrowedBountyMonths:1,
      admittedLocalHunterMonths:1,priorAcceptedParkedMonths:1,recordedContactMonths:0,openedFlights:0});
    const pursuit=turn(world,{[hunterId]:action('PURSUE_BOUNTY',{targetBountyId:bountyId})});
    const measured=createProtagonistStoryFunnel();
    measured.observe({before:world,after:pursuit,events:pursuit.events.filter(row=>row.tick===pursuit.tick)});
    expect(measured.summary().flight).toMatchObject({leadMonths:1,priorEscrowedBountyMonths:1,admittedLocalHunterMonths:1,
      recordedSearchMonths:0,recordedContactMonths:1,leadAliveAfterCombatMonths:1,priorAcceptedParkedMonths:1,
      parkedReachableAtContactMonths:1,liveCaptureMonths:0,openedFlights:1});
    expect(JSON.stringify(measured.summary())).not.toContain(leadId);
    measured.summary().flight.openedFlights=10;
    expect(measured.summary().flight.openedFlights).toBe(1);
  });

  it('counts an authority-verified death in the actual prior exit month and a recorded replacement',()=>{
    const {world:before}=nativeHandoffCompetition(),after=electNativeHandoff(before),measured=createProtagonistStoryFunnel();
    measured.observe({before,after,events:after.events.filter(row=>row.tick===after.tick)});
    expect(measured.summary().succession).toEqual({openedArcs:1,closedArcs:1,verifiedPublicDeath:1,
      verifiedAscension:0,ordinaryReceded:0,evidenceLost:0,unverifiedPublicDeath:0,recordedHandoffs:1});
    const next=electNativeHandoff(after);
    measured.observe({before:after,after:next,events:next.events.filter(row=>row.tick===next.tick)});
    expect(measured.summary().succession.closedArcs).toBe(1);
    expect(measured.summary().succession.recordedHandoffs).toBe(1);
  });
});
