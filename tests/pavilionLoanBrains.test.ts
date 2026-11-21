import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availablePavilionLoanActions } from '../src/engine/pavilionLoanEngine';
import { authorTechnique, studyTechnique } from '../src/engine/techniqueEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, PavilionLoanMove } from '../src/types/world';

const config: LLMConfig = {enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-pavilion-loan'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

function fixture(){
  const world=createInitialWorld(164);
  const sect=world.sects[0];
  const site=world.locations.find(({id})=>id===sect.headquartersId)!;
  const author=world.cultivators.find(({id})=>id==='npc-1')!;
  const editor=world.cultivators.find(({id})=>id==='npc-2')!;
  const clerk=world.cultivators.find(({id})=>id==='elder-taixu-1')!;
  const borrower=world.cultivators.find(({id})=>id==='elder-taixu-2')!;
  sect.facilities.scripture_pavilion=2;
  world.tick=35;
  for(const actor of [author,editor,clerk,borrower]){
    actor.locationId=site.id;
    actor.spiritStones=300;
    actor.hp=actor.maxHp;
    actor.qiProgress=20;
  }
  author.realm='元婴';
  author.techniqueMastery=85;
  expect(authorTechnique(author,world)).not.toBeNull();
  const originalId=author.technique.id!;
  expect(studyTechnique(editor,world,originalId)).not.toBeNull();
  expect(studyTechnique(borrower,world,originalId)).not.toBeNull();
  const apply=(actor:Cultivator,decision:LLMDecisionPayload)=>applyCultivatorBrainDecision(world,actor,decision,()=>.99);
  editor.techniqueMastery=38;
  expect(apply(editor,{chosenAction:'SCRIPTURE',editionMove:'annotate',targetScriptureOriginalId:originalId,innerMonologue:''})).not.toBeNull();
  editor.techniqueMastery=70;
  const parent=world.scriptures.editions[0];
  expect(apply(editor,{chosenAction:'SCRIPTURE',editionMove:'compare',targetScriptureEditionId:parent.id,innerMonologue:''})).not.toBeNull();
  const edition=world.scriptures.editions.find(({kind})=>kind==='corrected')!;
  expect(edition.evidence?.locationId).toBe(site.id);
  const command=(pavilionLoanMove:PavilionLoanMove,fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>({
    chosenAction:'PAVILION_LOAN',pavilionLoanMove,innerMonologue:'只按合法实借的选项。',...fields,
  });
  return {world,site,editor,clerk,borrower,edition,parent,apply,command};
}

describe('pavilion lending in both decision paths',()=>{
  it('enforces exact staffing and book choices, without accepting notes, patient names, or invented mastery',async()=>{
    const {world,site,editor,clerk,borrower,edition,parent,apply,command}=fixture();
    const staff=command('staff');
    expect(availablePavilionLoanActions(clerk,world)).toContainEqual({action:'PAVILION_LOAN',pavilionLoanMove:'staff'});
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond({...staff,targetLocationId:site.id}));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(clerk,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(staff));
    const assign=await requestCultivatorLLMDecision(clerk,world,config,world.tick);
    expect(assign).toMatchObject(staff);
    expect(apply(clerk,assign!)).not.toBeNull();

    const shelf=command('shelve',{targetScriptureEditionId:edition.id});
    mock.mockImplementation(async()=>respond(shelf));
    await expect(requestCultivatorLLMDecision(editor,world,config,world.tick)).resolves.toBeUndefined();
    const plan=await requestCultivatorLLMDecision(editor,world,config,world.tick+1);
    expect(plan).toMatchObject(shelf);
    world.tick++;
    expect(computeHeuristicDecision(editor,world,()=>.99)).toMatchObject({chosenAction:'PAVILION_LOAN',pavilionLoanMove:'shelve',targetScriptureEditionId:edition.id});
    expect(apply(editor,plan!)).not.toBeNull();
    const checkout=command('checkout',{targetScriptureEditionId:edition.id});
    const lendTick=world.tick+1;
    for(const extra of [{targetScriptureEditionId:parent.id},{clerkId:clerk.id},{borrowerName:borrower.name},
      {targetPavilionLoanId:'invented'},{mastery:100},{dueTick:1000}]){
      mock.mockImplementation(async()=>respond({...checkout,...extra}));
      await expect(requestCultivatorLLMDecision(borrower,world,config,lendTick)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(checkout));
    await expect(requestCultivatorLLMDecision(clerk,world,config,lendTick)).resolves.toBeUndefined();
    const accepted=await requestCultivatorLLMDecision(borrower,world,config,lendTick);
    expect(accepted).toMatchObject(checkout);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('藏经借阅仅复制本地合法许可');
    expect(prompt).not.toContain('shelvingShiftId');
    expect(prompt).not.toContain('lastServedTick');
    world.tick=lendTick;
    expect(apply(borrower,accepted!)).not.toBeNull();
    const row=world.pavilionLoans.loans[0];
    expect(row).toMatchObject({editionId:edition.id,borrowerId:borrower.id});
    expect(apply(borrower,accepted!)).toBeNull();
    const trace=recordDecisionTrace(world,borrower.id,legalTraceCandidates(world,borrower),accepted!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(edition.id);

    borrower.locationId='loc-market';
    const read=command('read',{targetPavilionLoanId:row.id});
    mock.mockImplementation(async()=>respond({...read,notes:'虚构心得'}));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(read));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick+1)).resolves.toMatchObject(read);
    world.tick++;
    const before=borrower.techniqueMastery;
    const utility=computeHeuristicDecision(borrower,world,()=>.99);
    expect(utility).toMatchObject({chosenAction:'PAVILION_LOAN',pavilionLoanMove:'read',targetPavilionLoanId:row.id});
    expect(apply(borrower,utility)).not.toBeNull();
    expect(borrower.techniqueMastery).toBe(before+2);
    expect(apply(borrower,utility)).toBeNull();

    world.tick=row.dueTick+1;
    expect(apply(clerk,staff)).not.toBeNull();
    world.tick++;
    const returns=command('return',{targetPavilionLoanId:row.id});
    mock.mockImplementation(async()=>respond(returns));
    await expect(requestCultivatorLLMDecision(borrower,world,config,world.tick)).resolves.toBeUndefined();
    borrower.locationId=site.id;
    const physicalReturn=await requestCultivatorLLMDecision(borrower,world,config,world.tick);
    expect(physicalReturn).toMatchObject(returns);
    expect(computeHeuristicDecision(borrower,world,()=>.99)).toMatchObject({chosenAction:'PAVILION_LOAN',pavilionLoanMove:'return',targetPavilionLoanId:row.id});
    expect(apply(borrower,physicalReturn!)).not.toBeNull();
    expect(row.returned?.tick).toBe(world.tick);
    expect(world.pavilionLoans.copies).toHaveLength(1);
  });
});
