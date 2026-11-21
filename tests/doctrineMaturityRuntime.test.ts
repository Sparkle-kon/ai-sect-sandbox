import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableDoctrineMaturityActions,doctrineMaturityHasOpenDuties,projectDoctrineMaturity} from '../src/engine/doctrineMaturityEngine';
import {possessAvatar,queueAvatarDoctrineMaturity} from '../src/engine/avatarEngine';
import {llmScheduler} from '../src/engine/llmScheduler';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {foundActor,foundPayload,foundSect,foundSite,foundTurn,foundingFixture,preparedDoctrineFounding} from './fixtures/doctrineFoundingNativeFixture';
import type {DoctrineFoundingMove,DoctrineMaturityMove,WorldState} from '../src/types/world';

const f=foundingFixture, author=f.authorId, parent=f.parentId, leader=f.leaderId;
const childMembers=f.members.filter(id=>id!==author);
const row=(w:WorldState)=>w.doctrineFoundings.foundings[0];
const personPositions=(w:WorldState)=>Object.fromEntries(f.members.map(id=>[id,foundActor(w,id).locationId]));
const reload=(w:WorldState)=>decodeWorldSave(encodeWorldSave(w));
const initial=(doctrineFoundingMove:Exclude<DoctrineFoundingMove,'propose'>,targetDoctrineFoundingId:string)=>
  foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove,targetDoctrineFoundingId});
const move=(doctrineMaturityMove:DoctrineMaturityMove,targetDoctrineFoundingId:string)=>
  foundPayload('DOCTRINE_MATURITY',{doctrineMaturityMove,targetDoctrineFoundingId});
const available=(w:WorldState,id:string,m:DoctrineMaturityMove)=>availableDoctrineMaturityActions(foundActor(w,id),w,w.tick+1)
  .some(option=>option.doctrineMaturityMove===m&&option.targetDoctrineFoundingId===row(w).id);

function genuinelyEstablished(){
  const fixture=preparedDoctrineFounding();
  const proposed=foundTurn(fixture.world,{[author]:foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove:'propose',
    targetDoctrineSchoolId:fixture.schoolId,targetRelocationId:fixture.relocationId})});
  const id=row(proposed).id;
  const signed=foundTurn(proposed,{[leader]:initial('authorize',id),...Object.fromEntries(childMembers.map(member=>[member,initial('join',id)]))});
  const world=foundTurn(signed,{[author]:initial('establish',id)});
  expect(row(world).status).toBe('established');
  return {world,id,childId:row(world).independentSectId,originalId:fixture.originalId,stayedId:fixture.stayedId};
}
function severeMiasma(w:WorldState){
  const {x,y}=foundSite(w,f.oldSiteId);
  for(let i=0;i<2;i++)w=applyMapBrush(w,'cursed_miasma',[{x,y}]);
  return w;
}
function actualSupportLost(w:WorldState){
  const marked=severeMiasma(w);
  expect(row(marked).maturity?.support).toBeUndefined();
  const first=foundTurn(marked), second=foundTurn(first);
  expect(row(first).maturity?.latestHazards).toHaveLength(1);
  expect(row(second).maturity?.latestHazards).toHaveLength(2);
  expect(available(second,author,'offer_merge')).toBe(false);
  const third=foundTurn(second);
  expect(row(third).maturity?.support).toMatchObject({kind:'sustained_hazard',observedTick:third.tick,siteId:f.oldSiteId,
    samples:[third.tick-2,third.tick-1,third.tick].map(tick=>({tick,hazard:{kind:'cursed_miasma',intensity:2}}))});
  return third;
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('actual titled shrine loss and charter closure',()=>{
  it('admits only the exact current role through Utility, model and staged player commands',async()=>{
    const start=genuinelyEstablished(),base=actualSupportLost(start.world),actor=foundActor(base,author);
    const legal=availableDoctrineMaturityActions(actor,base,base.tick+1).find(choice=>choice.doctrineMaturityMove==='offer_merge')!;
    expect(legal).toBeDefined();
    const payload=move('offer_merge',start.id);
    let candidate:object=payload;
    vi.stubGlobal('fetch',vi.fn(async (_url:string,req:RequestInit)=>{
      const body=JSON.parse(String(req.body)) as {messages:{role:string;content:string}[]};
      expect(body.messages.find(msg=>msg.role==='user')?.content).toContain('"doctrineMaturityMove":"offer_merge"');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(candidate)}}]}));
    }));
    const config={enabled:true,apiBaseUrl:'https://fixture.invalid',apiKey:'mock-only',model:'native-charter-closure'};
    const action=await requestCultivatorLLMDecision(actor,base,config,base.tick+1);
    expect(action).toMatchObject(payload);
    const offered=foundTurn(base,{[author]:action!});
    expect(row(offered).maturity?.offers[0].status).toBe('offered');
    llmScheduler.resetTickBudget();
    candidate={...payload,wallet:100,memberIds:[author]};
    expect(await requestCultivatorLLMDecision(actor,base,config,base.tick+1)).toBeUndefined();
    // The endangered local author can prefer a known safer place. The distinct
    // receiving author is in a safe titled seat and can choose native acceptance.
    expect(computeHeuristicDecision(actor,base,()=>.99).chosenAction).toBe('EXPLORE');
    const nextLegalMonth=foundTurn(offered);
    const host=foundActor(nextLegalMonth,leader);
    const reply=host.personality==='诡诈'||host.personality==='阴险'?'decline_merge':'accept_merge';
    expect(computeHeuristicDecision(host,nextLegalMonth,()=>.99)).toMatchObject({
      chosenAction:'DOCTRINE_MATURITY',doctrineMaturityMove:reply,
    });

    const staged=structuredClone(base);
    expect(possessAvatar(staged,author)).toBe(true);
    expect(queueAvatarDoctrineMaturity(staged,author,legal)).toBe(true);
    expect(queueAvatarDoctrineMaturity(staged,author,legal)).toBe(false);
    expect(row(staged).maturity?.offers).toEqual([]);
    expect(staged.playerAvatar.essence).toBe(71);
    expect(row(foundTurn(reload(staged))).maturity?.offers[0].status).toBe('offered');
    if(staged.playerAvatar.pendingOrder?.action==='DOCTRINE_MATURITY')staged.playerAvatar.pendingOrder.targetDoctrineFoundingId+='-forged';
    expect(()=>encodeWorldSave(staged)).toThrow(expect.objectContaining({code:'invalid_world'}));
  });

  it('waits for independent host and all actual members, retains the inactive shell, transfers only signed native balances',()=>{
    const setup=genuinelyEstablished(),{id,childId,originalId}=setup;
    const oldJson=JSON.stringify({version:1,format:'ai-sect-sandbox',world:setup.world});
    expect(decodeWorldSave(oldJson).doctrineFoundings.foundings[0].maturity?.settlement).toBeUndefined();
    const base=actualSupportLost(setup.world);
    const offered=foundTurn(base,{[author]:move('offer_merge',id)});
    const risk=foundSite(offered,f.oldSiteId);
    const unrefreshed=foundTurn(foundTurn(offered));
    expect(row(unrefreshed).maturity?.offers[0].status).toBe('invalidated');
    expect(row(unrefreshed).maturity?.support?.kind).toBe('sustained_hazard');
    expect(available(unrefreshed,author,'offer_merge')).toBe(false);
    expect(reload(unrefreshed).doctrineFoundings).toEqual(unrefreshed.doctrineFoundings);
    const onceAgain=foundTurn(severeMiasma(unrefreshed));
    expect(row(onceAgain).maturity?.latestHazards).toHaveLength(1);
    expect(available(onceAgain,author,'offer_merge')).toBe(false); // Not a continuation across the safe month.
    const nominated=applyMapBrush(offered,'cursed_miasma',[{x:risk.x,y:risk.y}]);
    const evidence=row(nominated).maturity?.offers[0]!;
    expect(evidence.status).toBe('offered');
    expect(evidence.memberIds).toEqual([...f.members].sort());
    const outsider=foundSect(nominated,f.lenderSectId).leaderId!;
    expect(projectDoctrineMaturity(nominated,row(nominated),foundActor(nominated,outsider))).toBeUndefined();
    const declined=foundTurn(reload(nominated),{[childMembers[0]]:move('decline_merge',id)});
    expect(row(declined).maturity?.offers[0]).toMatchObject({status:'declined',closedById:childMembers[0]});
    expect(foundSite(declined,f.oldSiteId).ownerSectId).toBe(childId);
    expect(reload(declined).doctrineFoundings).toEqual(declined.doctrineFoundings);
    const partial=foundTurn(nominated,{[leader]:move('accept_merge',id),[childMembers[0]]:move('approve_member',id),
      [setup.stayedId]:move('approve_member',id),[author]:move('finalize_merge',id)});
    expect(row(partial).maturity?.offers[0].consents.map(signature=>signature.actorId)).toEqual([childMembers[0]]);
    expect(row(partial).maturity?.settlement).toBeUndefined();
    expect(available(partial,author,'finalize_merge')).toBe(false);
    const agreed=foundTurn(partial,{[childMembers[1]]:move('approve_member',id),[author]:move('finalize_merge',id)});
    expect(row(agreed).maturity?.settlement).toBeUndefined();
    expect(available(agreed,author,'finalize_merge')).toBe(true);
    expect(reload(agreed).doctrineFoundings).toEqual(agreed.doctrineFoundings);
    const idle=foundTurn(agreed);
    const merged=foundTurn(agreed,{[author]:move('finalize_merge',id)});
    const receipt=row(merged).maturity?.settlement!;
    expect(receipt).toMatchObject({kind:'merged',tick:merged.tick,siteId:f.oldSiteId,receivingSectId:parent,
      memberIds:[...f.members].sort(),transferredStones:evidence.wallet,transferredScriptureId:originalId,scriptureAlreadyHeld:true});
    const shell=foundSect(merged,childId);
    expect(shell).toMatchObject({id:childId,name:row(merged).independentName,inactiveSinceTick:merged.tick,spiritStones:receipt.retainedStones});
    expect(shell.leaderId).toBeUndefined();
    expect(shell.pavilion.some(item=>item.id===originalId)).toBe(false);
    expect(foundSect(merged,parent).pavilion.filter(item=>item.id===originalId)).toHaveLength(1);
    expect(foundSect(merged,parent).spiritStones).toBe(foundSect(idle,parent).spiritStones+evidence.wallet);
    expect(shell.spiritStones).toBe(foundSect(idle,childId).spiritStones-evidence.wallet);
    expect(merged.credit).toEqual(idle.credit);
    expect(f.members.every(id=>foundActor(merged,id).sectId===parent)).toBe(true);
    expect(personPositions(merged)).toEqual(personPositions(agreed));
    const site=foundSite(merged,f.oldSiteId);
    expect(site.ownerSectId).toBeUndefined();
    expect(site.type).toBe('spirit_vein');
    expect(receipt.releasedTileId).toBe(terrainTileAt(merged,site.x,site.y)?.id);
    expect(terrainTileAt(merged,site.x,site.y)?.ownerSectId).toBeUndefined();
    expect(row(agreed).maturity?.settlement).toBeUndefined();
    const repeated=foundTurn(reload(merged),{[author]:move('finalize_merge',id)});
    expect(repeated.doctrineFoundings).toEqual(merged.doctrineFoundings);
    expect(foundSect(repeated,childId).spiritStones).toBe(receipt.retainedStones);

    for(const forgery of ['signature','territory','hazard','transfer','public'] as const){
      const corrupt=structuredClone(merged), current=row(corrupt).maturity!;
      if(forgery==='signature')current.offers[0].consents.pop();
      if(forgery==='territory')foundSite(corrupt,f.oldSiteId).ownerSectId=childId;
      if(forgery==='hazard'){
        const proof=current.offers[0].support;
        if(proof.kind==='sustained_hazard')proof.samples[0].tick++;
      }
      if(forgery==='transfer')current.settlement!.transferredStones++;
      if(forgery==='public')Reflect.deleteProperty(corrupt.events.find(event=>event.id.endsWith(`${id}-maturity-merged`))!,'witnessScope');
      expect(()=>encodeWorldSave(corrupt)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('does not strip either side of a real unrepaid third-sect loan after the same genuine loss of support',()=>{
    const {world,id,childId}=genuinelyEstablished();
    const lender=foundSect(world,f.lenderSectId).leaderId!;
    const offered=foundTurn(world,{[lender]:foundPayload('SECT_CREDIT',{creditMove:'offer',targetSectId:childId})});
    const debt=offered.credit.loans.find(loan=>loan.borrowerSectId===childId)!;
    expect(debt?.status).toBe('offered');
    const funded=foundTurn(offered,{[author]:foundPayload('SECT_CREDIT',{creditMove:'accept',targetCreditId:debt.id})});
    expect(funded.credit.loans.find(loan=>loan.id===debt.id)?.status).toBe('active');
    const damaged=actualSupportLost(funded);
    expect(doctrineMaturityHasOpenDuties(damaged,foundSect(damaged,childId))).toBe(true);
    expect(available(damaged,author,'offer_merge')).toBe(false);
    const rejected=foundTurn(damaged,{[author]:move('offer_merge',id)});
    expect(row(rejected).maturity?.offers).toHaveLength(0);
    expect(foundSite(rejected,f.oldSiteId).ownerSectId).toBe(childId);
    expect(rejected.credit.loans.find(loan=>loan.id===debt.id)).toMatchObject({status:'active',
      borrowerSectId:childId,lenderSectId:f.lenderSectId});
    expect(reload(rejected).doctrineFoundings).toEqual(rejected.doctrineFoundings);
  });

  it('disperses only after no actual adult remains and leaves wallet, exact named origin and original studies behind',()=>{
    const {world,childId,originalId}=genuinelyEstablished();
    const base=actualSupportLost(world);
    let damaged=base;
    for(const id of f.members)for(let i=0;i<4;i++)damaged=executeGodIntervention(damaged,{type:'TRIBULATION_STRIKE',targetCultivatorId:id});
    const site=foundSite(damaged,f.oldSiteId);
    damaged=applyMapBrush(damaged,'meteor',[{x:site.x,y:site.y}]);
    expect(f.members.every(id=>!foundActor(damaged,id).alive)).toBe(true);
    const closed=foundTurn(damaged), idle=foundTurn(base);
    expect(foundSect(closed,parent).spiritStones).toBe(foundSect(idle,parent).spiritStones);
    const shell=foundSect(closed,childId);
    expect(row(closed).maturity?.settlement).toMatchObject({kind:'dispersed',tick:closed.tick,memberIds:[],transferredStones:0,
      retainedStones:shell.spiritStones});
    expect(shell).toMatchObject({id:childId,headquartersId:f.oldSiteId,inactiveSinceTick:closed.tick});
    expect(shell.pavilion.some(item=>item.id===originalId)).toBe(true);
    expect(shell.spiritStones).toBeGreaterThanOrEqual(foundSect(damaged,childId).spiritStones);
    expect(foundSite(closed,f.oldSiteId).ownerSectId).toBeUndefined();
    expect(reload(closed).doctrineFoundings).toEqual(closed.doctrineFoundings);
  });
});
