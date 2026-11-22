import {campaignSHA256} from '../src/engine/campaignMemento';
import {confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt} from '../src/components/chapterExcerptModel';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {readFile} from './centuryNodeRuntime';

declare const process:{argv:string[];exitCode?:number};
const hash=(text:string)=>campaignSHA256(new TextEncoder().encode(text));

async function main(){
  const path=process.argv[2];
  if(!path)throw Error('Usage: verifyChapterExcerptNative <native split-outcomes raw era .json>');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path));
  const rawSha=await hash(raw);
  if(rawSha!=='d0084949687eb71e47669c51f51d85f0b8acba325590f229cc5204146e1255f7')
    throw Error('Not the recorded P17-1 T406 split-outcomes source');
  const world=decodeEraWorldSave(raw);
  if(encodeEraWorldSave(world)!==raw||world.tick!==406)throw Error('Original is not strict byte-exact T406');
  const chapter='chapter-404-406',scope='portable-branch-label-canary:paused',
    su='npc-2',du='recruit-village-loc-market-east-vol-3',
    first='evt-405-npc-2-social',second='evt-406-recruit-village-loc-market-east-vol-3-social',
    trade='evt-404-market-fill-2271';
  const original=projectChapterExcerpt(world,chapter,scope,su);
  if(!original)throw Error('Missing exact native T406 chapter');
  const entries=original.rows.filter(row=>row.id===first||row.id===second);
  if(entries.length!==2||!original.rows.some(row=>row.id===trade))throw Error('Original scenes and unselected sale must exist');
  const [suRow,duRow]=entries;
  if(!suRow.text.includes('苏清寒')||!suRow.text.includes('药玄真君')||!suRow.text.includes('松灯坊市')||
    suRow.text.includes('杜清禾')||!duRow.text.includes('杜清禾')||!duRow.text.includes('韩立风')||
    !duRow.text.includes('万仙坊市')||duRow.text.includes('苏清寒')||suRow.citation===duRow.citation)throw Error('Two actual local viewpoints were blended');
  const draft=prepareChapterExcerpt(original,[second,first]);
  if(!draft)throw Error('Two valid selected rows did not prepare');
  const file=confirmChapterExcerpt(world,chapter,scope,su,draft);
  if(!file||file.text!==draft.text||!file.filename.endsWith('.txt')||
    !file.text.includes(suRow.text)||!file.text.includes(duRow.text)||
    file.text.indexOf(suRow.text)>=file.text.indexOf(duRow.text)||
    [scope,chapter,su,du,trade,'每份11灵石'].some(value=>file.text.includes(value)))
    throw Error('Wrong exact local text, order, identifiers or unselected transaction');
  if(confirmChapterExcerpt(world,chapter,'other-view:same-date',su,draft)||
    confirmChapterExcerpt(world,chapter,scope,du,draft))throw Error('Stale world view or selected viewer confirmed an old draft');
  const detached=structuredClone(world);
  detached.events=detached.events.filter(row=>row.id!==second);
  if(confirmChapterExcerpt(detached,chapter,scope,su,draft)||
    projectChapterExcerpt(detached,chapter,scope,su)?.rows.some(row=>row.id===second))
    throw Error('A chapter-only archive copy sustained a removed original');
  if(encodeEraWorldSave(world)!==raw||
    new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path))!==raw)throw Error('Original snapshot changed');
  console.log(JSON.stringify({sourceTick:world.tick,rawSha,chapter,scenes:entries.map(({title,citation})=>({title,citation})),
    exportedUtf8Bytes:new TextEncoder().encode(file.text).byteLength,excerptSha:await hash(file.text),filename:file.filename,
    preservedNativeBytes:true,unselectedTradeOmitted:true,changedScopeAndViewerRejected:true,removedOriginalRejected:true}));
}
void main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
