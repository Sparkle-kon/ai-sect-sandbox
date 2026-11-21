import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableDoctrineFoundingActions,localDoctrineFoundingNotice} from '../src/engine/doctrineFoundingEngine';
import {independentDoctrineSectId} from '../src/engine/doctrineFoundingTerms';
import {possessAvatar,queueAvatarDoctrineFounding} from '../src/engine/avatarEngine';
import {llmScheduler} from '../src/engine/llmScheduler';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {availableDoctrineActions} from '../src/engine/doctrineEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {foundActor,foundPayload,foundSect,foundSite,foundTurn,foundingFixture,preparedDoctrineFounding} from './fixtures/doctrineFoundingNativeFixture';
import type {DoctrineFoundingMove,WorldState} from '../src/types/world';

const f=foundingFixture, author=f.authorId, parent=f.parentId, leader=f.leaderId;
const row=(w:WorldState)=>w.doctrineFoundings.foundings[0];
const actions=(w:WorldState,id:string,prospective=false)=>availableDoctrineFoundingActions(foundActor(w,id),w,w.tick+Number(prospective));
const reply=(doctrineFoundingMove:Exclude<DoctrineFoundingMove,'propose'>,targetDoctrineFoundingId:string)=>
  foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove,targetDoctrineFoundingId});
const reload=(w:WorldState)=>decodeWorldSave(encodeWorldSave(w));
function preparationWithActualDebt(){
  const prep=preparedDoctrineFounding();
  const lender=foundSect(prep.world,f.lenderSectId).leaderId!;
  let world=foundTurn(prep.world,{[lender]:foundPayload('SECT_CREDIT',{creditMove:'offer',targetSectId:parent})});
  const debt=world.credit.loans[0];
  expect(debt?.status).toBe('offered');
  world=foundTurn(world,{[leader]:foundPayload('SECT_CREDIT',{creditMove:'accept',targetCreditId:debt.id})});
  expect(world.credit.loans[0]).toMatchObject({status:'active',borrowerSectId:parent,lenderSectId:f.lenderSectId});
  return {...prep,world};
}
function draft(input:ReturnType<typeof preparationWithActualDebt>){
  const {world,schoolId,relocationId}=input;
  const choice=actions(world,author,true).find(option=>option.doctrineFoundingMove==='propose'&&
    option.targetDoctrineSchoolId===schoolId&&option.targetRelocationId===relocationId);
  expect(choice).toBeDefined();
  const proposed=foundTurn(world,{[author]:foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove:'propose',
    targetDoctrineSchoolId:schoolId,targetRelocationId:relocationId})});
  expect(row(proposed)).toMatchObject({status:'proposed',schoolId,relocationPlanId:relocationId});
  return proposed;
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('native independent sect without cloned title, members or debt',()=>{
  it('lets an exact local player or configured Cognitive JSON propose, never a fabricated extra signature',async()=>{
    const f=preparationWithActualDebt(),actor=foundActor(f.world,author);
    const permitted=actions(f.world,author,true).find(option=>option.doctrineFoundingMove==='propose')!;
    const payload=foundPayload('DOCTRINE_FOUNDING',{doctrineFoundingMove:'propose',
      targetDoctrineSchoolId:f.schoolId,targetRelocationId:f.relocationId});
    expect(permitted).toBeDefined();
    let mocked:object=payload;
    vi.stubGlobal('fetch',vi.fn(async (_url:string,init:RequestInit)=>{
      const detail=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
      const user=detail.messages.find(message=>message.role==='user')?.content??'';
      expect(user).toContain('"doctrineFoundingMove":"propose"');
      expect(user).toContain('不能替他人签字');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(mocked)}}]}));
    }));
    const cfg={enabled:true,apiBaseUrl:'https://fixture.invalid',apiKey:'mock-only',model:'charter-fixture'};
    const law=await requestCultivatorLLMDecision(actor,f.world,cfg,f.world.tick+1);
    expect(law).toMatchObject(payload);
    expect(row(foundTurn(f.world,{[author]:law!})).status).toBe('proposed');
    llmScheduler.resetTickBudget();
    mocked={...payload,memberIds:[author,leader],transferredStones:100};
    expect(await requestCultivatorLLMDecision(actor,f.world,cfg,f.world.tick+1)).toBeUndefined();

    const utility=computeHeuristicDecision(actor,f.world,()=>.99);
    expect(utility).toMatchObject({chosenAction:'DOCTRINE_FOUNDING',doctrineFoundingMove:'propose'});
    const staged=structuredClone(f.world);
    expect(possessAvatar(staged,author)).toBe(true);
    expect(queueAvatarDoctrineFounding(staged,author,permitted)).toBe(true);
    expect(queueAvatarDoctrineFounding(staged,author,permitted)).toBe(false);
    expect(staged.tick).toBe(f.world.tick);
    expect(staged.doctrineFoundings.foundings).toEqual([]);
    expect(staged.playerAvatar.essence).toBe(71);
    const next=foundTurn(reload(staged));
    const scope=localDoctrineFoundingNotice(next,foundActor(next,author));
    expect(scope).toMatchObject({siteId:foundingFixture.oldSiteId,established:false});
    expect(localDoctrineFoundingNotice(next,foundActor(next,leader))).toBeUndefined();
  });

  it('traces real authorship, old relocated capital, school wallet and each consent; both institutions continue',()=>{
    const base=preparationWithActualDebt();
    const {world,schoolId,originalId,stayedId}=base;
    const charter=world.doctrines.schools.find(school=>school.id===schoolId)!;
    expect(charter.memberIds.slice().sort()).toEqual([...f.members].sort());
    expect(charter.treasury).toBeGreaterThanOrEqual(25);
    const manufactured=structuredClone(world);
    const original=manufactured.scriptures.originals.find(original=>original.id===originalId)!;
    Object.assign(original,{source:'pavilion'}); // same text can remain a lawful copy; not an authored original receipt.
    expect(actions(manufactured,author,true).some(option=>option.doctrineFoundingMove==='propose')).toBe(false);
    const p=draft(base),id=row(p).id;
    expect(foundSite(p,f.oldSiteId).ownerSectId).toBeUndefined();
    expect(foundSect(p,independentDoctrineSectId(schoolId))).toBeUndefined();
    expect(reload(p).doctrineFoundings).toEqual(p.doctrineFoundings);
    const [a,b]=f.members.filter(member=>member!==author);
    const early=foundTurn(p,{[author]:reply('establish',id),[leader]:reply('authorize',id),[a]:reply('join',id),[b]:reply('join',id)});
    expect(row(early)).toMatchObject({status:'proposed',authorization:{actorId:leader,siteId:f.newSiteId},consents:expect.arrayContaining([
      expect.objectContaining({actorId:a}),expect.objectContaining({actorId:b}),
    ])});
    expect(foundActor(early,a).sectId).toBe(parent);
    expect(charter.treasury).toBe(early.doctrines.schools.find(school=>school.id===schoolId)?.treasury);
    const declined=foundTurn(p,{[leader]:reply('decline',id)});
    expect(row(declined)).toMatchObject({status:'declined',settlement:{actorId:leader}});
    expect(foundSite(declined,f.oldSiteId).ownerSectId).toBeUndefined();
    expect(declined.doctrines.schools.find(school=>school.id===schoolId)?.treasury).toBe(charter.treasury);
    expect(reload(declined).doctrineFoundings).toEqual(declined.doctrineFoundings);
    const unsigned=foundTurn(p,{[author]:reply('establish',id),[b]:reply('join',id)});
    expect(row(unsigned).status).toBe('proposed');
    expect(actions(unsigned,author,true).some(option=>option.doctrineFoundingMove==='establish')).toBe(false);

    const branch=reload(early);
    const idle=foundTurn(branch);
    const independent=foundTurn(branch,{[author]:reply('establish',id)});
    const created=row(independent),createdSect=foundSect(independent,created.independentSectId);
    expect(created).toMatchObject({status:'established',independentSectId:independentDoctrineSectId(schoolId),
      scriptureId:originalId,settlement:{actorId:author,transferredStones:charter.treasury}});
    expect(created.settlement?.memberIds?.slice().sort()).toEqual([...f.members].sort());
    expect(createdSect).toMatchObject({headquartersId:f.oldSiteId,leaderId:author,spiritStones:charter.treasury,
      pavilion:[expect.objectContaining({id:originalId})]});
    expect(independent.scriptures.originals.filter(original=>original.id===originalId)).toHaveLength(1);
    expect(independent.scriptures.originals).toEqual(idle.scriptures.originals);
    expect(foundSect(independent,parent)).toEqual(foundSect(idle,parent));
    expect(foundSect(independent,parent).pavilion).toContainEqual(expect.objectContaining({id:originalId}));
    expect(independent.credit.loans).toEqual(idle.credit.loans);
    expect(independent.credit.loans.every(loan=>loan.borrowerSectId!==createdSect.id&&loan.lenderSectId!==createdSect.id)).toBe(true);
    expect(foundActor(independent,leader).sectId).toBe(parent);
    expect(foundActor(independent,stayedId).sectId).toBe(parent);
    expect(f.members.every(member=>foundActor(independent,member).sectId===createdSect.id&&
      foundActor(independent,member).locationId===f.oldSiteId)).toBe(true);
    expect(foundSite(independent,f.oldSiteId).ownerSectId).toBe(createdSect.id);
    const old=foundSite(independent,f.oldSiteId);
    const marked=terrainTileAt(independent,old.x,old.y)!;
    expect(independent.terrain.tiles.filter(tile=>tile.ownerSectId===createdSect.id).map(tile=>tile.id)).toEqual([marked.id]);
    expect(independent.doctrines.schools.find(school=>school.id===schoolId)).toMatchObject({foundedSectId:createdSect.id,treasury:0,memberIds:[]});
    expect(availableDoctrineActions(foundActor(independent,leader),independent).every(option=>option.targetDoctrineSchoolId!==schoolId)).toBe(true);
    expect(row(branch).status).toBe('proposed');
    expect(reload(independent).doctrineFoundings).toEqual(independent.doctrineFoundings);

    const duplicate=foundTurn(independent,{[author]:reply('establish',id),[leader]:foundPayload('CULTIVATE')});
    expect(duplicate.sects.filter(row=>row.id===createdSect.id)).toHaveLength(1);
    expect(foundActor(duplicate,leader).currentAction).toBe('CULTIVATE');
    const stillActs=foundTurn(duplicate,{[author]:foundPayload('CULTIVATE')});
    expect(foundActor(stillActs,author).currentAction).toBe('CULTIVATE');
    expect(stillActs.locations.find(site=>site.id===f.oldSiteId)?.ownerSectId).toBe(createdSect.id);
    for(const attack of ['wallet','scripture','consent','abandonment','public'] as const){
      const damaged=structuredClone(independent),receipt=row(damaged);
      if(attack==='wallet')receipt.settlement!.transferredStones!++;
      if(attack==='scripture')receipt.scriptureId='old-borrowed-copy';
      if(attack==='consent')receipt.consents[0].withdrawnTick=receipt.settlement!.tick;
      if(attack==='abandonment')receipt.abandonedSiteId='unrelated-empty-site';
      if(attack==='public')Reflect.deleteProperty(damaged.events.find(event=>event.id.endsWith(receipt.id+'-established'))!,'witnessScope');
      expect(()=>encodeWorldSave(damaged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('records exact later normal election and old saves remain empty, including actual previous charter',()=>{
    const original=preparationWithActualDebt();
    const old={...original.world};
    Reflect.deleteProperty(old,'doctrineFoundings');
    const migrated=decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:old}));
    expect(migrated.doctrineFoundings).toEqual({foundings:[]});
    expect(migrated.doctrines).toEqual(original.world.doctrines);
    const p=draft(original),id=row(p).id;
    const [a,b]=f.members.filter(member=>member!==author);
    const assent=foundTurn(p,{[leader]:reply('authorize',id),[a]:reply('join',id),[b]:reply('join',id)});
    const created=foundTurn(assent,{[author]:reply('establish',id)}),childId=row(created).independentSectId;
    const retired=foundTurn(created,{[author]:foundPayload('SECT_SERVICE',{serviceMove:'retire'})});
    expect(foundActor(retired,author).service).toMatchObject({status:'retired'});
    expect(foundActor(retired,author).alive).toBe(true);
    expect(row(retired).continuity).toMatchObject({cause:'native_succession',previousLeaderId:author,
      successorId:foundSect(retired,childId).leaderId,tick:retired.tick});
    expect(reload(retired).doctrineFoundings).toEqual(retired.doctrineFoundings);

    // Actual native thunder weakens only founder; a genuine map incident then proves prior death.
    let loss=created;
    for(let i=0;i<3;i++)loss=executeGodIntervention(loss,{type:'TRIBULATION_STRIKE',targetCultivatorId:author});
    const site=foundSite(loss,f.oldSiteId);
    loss=applyMapBrush(loss,'meteor',[{x:site.x,y:site.y}]);
    expect(foundActor(loss,author).alive).toBe(false);
    const continued=foundTurn(loss);
    const election=foundSect(continued,childId).succession!;
    expect(election).toMatchObject({method:'election',previousLeaderId:author,tick:continued.tick});
    expect(row(continued).continuity).toMatchObject({cause:'native_succession',previousLeaderId:author,
      successorId:election.leaderId,tick:election.tick,eventId:expect.any(String)});
    expect(continued.eraHistory.receipts.some(entry=>entry.kind==='succession'&&entry.sectId===childId&&entry.leaderId===election.leaderId)).toBe(true);
    expect(foundSect(continued,parent).leaderId).toBe(leader);
    expect(reload(continued).doctrineFoundings).toEqual(continued.doctrineFoundings);
  });
});
