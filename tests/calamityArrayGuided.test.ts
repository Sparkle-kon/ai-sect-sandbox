import {describe, expect, it} from 'vitest';
import {resolveGuidedWorldTurn} from '../src/controllers/guidedWorldTurn';
import {availableCalamityArrayChoices, calamityArrayStoryReceipt} from '../src/engine/calamityArray';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import type {LLMDecisionPayload} from '../src/types/world';
import {actualGrandSiege, commander, disciple, location, patriarch, siegeActor, siegeTurn} from './grandSiegeNativeFixture';

describe('a guided array choice keeps the player’s branch and exact native proof',()=>{
  it('seals an actual single choice, rejects stale identity and distinguishes paid settlement from its earlier intent',()=>{
    const {declared}=actualGrandSiege();
    const travel:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:location,innerMonologue:'亲往山门。'};
    let present=siegeTurn(declared,{[commander]:travel,[disciple]:travel});
    const site=present.locations.find(row=>row.id===location)!;
    for(let i=0;i<3;i++) present=applyMapBrush(present,'cursed_miasma',[site]);
    const seen=siegeTurn(present);
    const option=availableCalamityArrayChoices(seen,siegeActor(seen,commander)).find(row=>row.calamityArrayStance==='local')!;
    const guard={kind:'calamity-array',world:seen,branchId:'native',revision:2,actorId:commander,option} as const;
    expect(resolveGuidedWorldTurn(guard,seen,'other',2)).toBeUndefined();
    expect(resolveGuidedWorldTurn(guard,{...seen},'native',2)).toBeUndefined();
    expect(resolveGuidedWorldTurn(guard,seen,'native',3)).toBeUndefined();
    expect(resolveGuidedWorldTurn({...guard,actorId:disciple},seen,'native',2)).toBeUndefined();
    const directed=resolveGuidedWorldTurn(guard,seen,'native',2)!;
    expect(directed.decision).toMatchObject({chosenAction:'CALAMITY_ARRAY',calamityArrayStance:'local'});
    const stand=siegeTurn(seen,{[commander]:directed.decision});
    expect(calamityArrayStoryReceipt(stand,commander,option,'intent')?.description).toContain('未扣灵气');
    expect(calamityArrayStoryReceipt(stand,patriarch,option,'intent')).toBeUndefined();
    expect(calamityArrayStoryReceipt(stand,commander,option,'settlement')).toBeUndefined();
    const next=siegeTurn(stand);
    expect(calamityArrayStoryReceipt(next,commander,option,'settlement')?.description).toContain('实耗12点灵气');
    expect(calamityArrayStoryReceipt(next,commander,option,'intent')).toBeUndefined();
  });
});
