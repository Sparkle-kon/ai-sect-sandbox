import {describe,expect,it} from 'vitest';
import {cultivationClanMapSites} from '../src/components/cultivationClanMapMark';
import {resolveGuidedCultivationClanTurn} from '../src/controllers/guidedCultivationClanTurn';
import {possessAvatar} from '../src/engine/avatarEngine';
import {availableCultivationClanActions,cultivationClanActionApplied} from '../src/engine/cultivationClanEngine';
import {actualClanProposal,actualClanVows,clanActor,clanFirst,clanMonth,clanSecond,clanSite,clanUnion} from './clanDynastyNativeFixture';

describe('clan actions and visible real ceremonies in the live scope',()=>{
  it('lets only the other actual possessed adult authorize the live independent consent',()=>{
    const proposal=actualClanProposal();
    const respective=proposal.proposed;
    const option=availableCultivationClanActions(clanActor(respective,clanSecond),respective,respective.tick+1)
      .find(row=>row.clanMove==='accept')!;
    expect(option).toBeDefined();
    const request={kind:'cultivation-clan' as const,world:respective,actorId:clanSecond,branchId:'main',revision:4,option};
    expect(resolveGuidedCultivationClanTurn(request,respective,'main',4)).toBeUndefined();
    expect(possessAvatar(respective,clanSecond)).toBe(true);
    expect(resolveGuidedCultivationClanTurn({...request,actorId:clanFirst},respective,'main',4)).toBeUndefined();
    expect(resolveGuidedCultivationClanTurn(request,structuredClone(respective),'main',4)).toBeUndefined();
    const accepted=resolveGuidedCultivationClanTurn(request,respective,'main',4)!;
    const after=clanMonth(respective,{[clanSecond]:accepted.decision});
    expect(cultivationClanActionApplied(after,clanSecond,option)).toBe(true);
    expect(clanUnion(after).status).toBe('accepted');
    expect(cultivationClanMapSites(after,()=>true,false).size).toBe(0);
  });

  it('marks a true public completion only in its exact month and authorized place',()=>{
    const {bonded}=actualClanVows();
    expect([...cultivationClanMapSites(bonded,id=>id===clanSite,false)]).toEqual([clanSite]);
    expect(cultivationClanMapSites(bonded,()=>false,false).size).toBe(0);
    expect(cultivationClanMapSites(bonded,()=>true,true).size).toBe(0);
    expect(cultivationClanMapSites(clanMonth(bonded),()=>true,false).size).toBe(0);
  });
});
