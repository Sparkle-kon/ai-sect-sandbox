/// <reference types="vite/client" />
import ts from 'typescript';
import {expect,it} from 'vitest';

const banned=/实付|托管|凭据|原生|不替|不补/;
// Only the catalog, player-facing panels and their authored copy producers.
const authored=import.meta.glob<string>([
  '../src/components/{SectManagementHome,SectFirstMeetingHint,SectMorningBoard,SectGrowthControls,SectJobReportStage,SectComicRead,SectPairDramaRead,SectQuirkBadges,SectReactionGlyph,SectRecurringRead,LocalCourtyardCanvas,SectChatPanel,SectPlayerChatComposer,SectMomentsPanel,SectLivePanel,SectChallengePanel,WorldStoragePanel,SaveResumeComparison,EraCheckpointControls}.tsx',
  '../src/components/sectJobReportPresentation.ts',
  '../src/data/{sectChatVoices,sectLiveLines,sectMomentLines,sectPlayerChatLines}.ts',
  '../src/data/sectComedy/{ambient,festival,field,recurring,work}.ts',
  '../src/engine/{sectFestivals,sectJobs,sectGrowth,sectPlayerChat,sectChat,sectLive,sectMoments,sectQuirkCatalog,tianjiTabloid,eraCheckpointEngine,shareSavePrivacy,saveCapacityEngine}.ts',
  '../src/engine/storage/saveSlots.ts',
],{eager:true,query:'?raw',import:'default'});

function literalOffenders(path:string,source:string){
  const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const hits:string[]=[];
  const walk=(node:ts.Node)=>{
    if((ts.isStringLiteral(node)||ts.isJsxText(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateLiteralToken(node))&&banned.test(node.text)){
      const {line}=file.getLineAndCharacterOfPosition(node.getStart(file));
      hits.push(path+':'+(line+1)+' '+node.text.trim());
    }
    ts.forEachChild(node,walk);
  };
  walk(file);
  return hits;
}

it('rejects forbidden terms in authored sect dialogue, plain JSX, templates, and accessibility copy without matching source comments',()=>{
  expect(literalOffenders('sample.tsx',
    '// 原生\nconst a=<p title="凭据">实付</p>; const b=`已托管：${amount}，不补`;')).toHaveLength(4);
  expect(Object.keys(authored)).toHaveLength(42);
  expect(Object.entries(authored).flatMap(([path,source])=>literalOffenders(path,source))).toEqual([]);
});
