import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {ChapterExcerptChoices,ChapterExcerptPanel,ChapterExcerptPreview,requestChapterExcerptDownload}
  from '../src/components/ChapterExcerptPanel';
import {ChronicleLibraryPanel} from '../src/components/ChronicleLibraryPanel';
import {confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt} from '../src/components/chapterExcerptModel';
import {publicDialogueProofFixture} from './fixtures/publicDialogueFixture';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('uses only an existing chapter fold, opens by explicit choice, and never mounts unchecked copy or download controls',()=>{
  const {world,chapter,actorId}=publicDialogueProofFixture();
  const viewer=world.cultivators.find(row=>row.id===actorId)!;
  const scope='private-live-branch';
  const html=renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={viewer} scopeKey={scope}/>);
  expect(html.match(/>故事节选<\/summary>/g)).toHaveLength(1);
  expect(html).not.toContain('预览纯文字节选');
  expect(html).not.toContain('确认下载 .txt');
  expect(html).not.toContain(scope);
  expect(renderToStaticMarkup(<ChapterExcerptPanel world={world} chapterId={chapter.id}/>)).toBe('');
  expect(renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={{...viewer}} scopeKey={scope}/>)).not.toContain('故事节选');
});
it('renders only eligible checkbox titles and exclusion counts, then the standalone exact preview not an automatic download',()=>{
  const toggle=vi.fn(),prepare=vi.fn();
  const html=renderToStaticMarkup(<ChapterExcerptChoices projection={{excludedCount:3,
    rows:[{id:'private-row',title:'坊市相逢',text:'只有预览才用这一句',citation:'已核出处'}]}} selected={[]} onSelect={toggle}/>);
  expect(html).toContain('另有 3 幕不符合节选条件');
  expect(html).toContain('坊市相逢');
  expect(html).toContain('type="checkbox"');
  expect(html).not.toMatch(/checked=|private-row|只有预览|确认下载/);
  const text='坊市相逢\n小桥边，二人各认出对方来。\n出处：已核原卷\n';
  const preview=renderToStaticMarkup(<ChapterExcerptPreview text={text} onConfirm={prepare}/>);
  expect(preview).toContain(text);
  expect(preview).toContain('确认下载 .txt');
  expect(preview).toContain('whitespace-pre-wrap');
  expect(toggle).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});
it('requests a real Blob text download only when called and revokes its URL after the click',async()=>{
  const {world,chapter,event,actorId}=publicDialogueProofFixture();
  const scope='current-branch',project=projectChapterExcerpt(world,chapter.id,scope,actorId)!;
  const draft=prepareChapterExcerpt(project,[event.id])!,file=confirmChapterExcerpt(world,chapter.id,scope,actorId,draft)!;
  expect(file.text).toBe(draft.text);
  expect(confirmChapterExcerpt(world,chapter.id,'different-branch',actorId,draft)).toBeUndefined();
  const href='blob:fixture-local-object';
  const create=vi.fn((_blob:Blob)=>href),revoke=vi.fn(),click=vi.fn(),remove=vi.fn();
  const link={href:'',download:'',hidden:false,click,remove},append=vi.fn();
  vi.useFakeTimers();
  vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
  vi.stubGlobal('document',{createElement:vi.fn(()=>link),body:{append}});
  expect(requestChapterExcerptDownload(file)).toBe(true);
  expect(link).toMatchObject({href,download:file.filename,hidden:true});
  expect(append).toHaveBeenCalledTimes(1);
  expect(append).toHaveBeenCalledWith(link);
  expect(click).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(revoke).not.toHaveBeenCalled();
  const blob=create.mock.calls[0][0];
  expect(blob.type).toContain('text/plain');
  expect(await blob.text()).toBe(draft.text);
  vi.runOnlyPendingTimers();
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith(href);
});
it('returns failure and cleans up if browser click throws, and never allows path-like export names',()=>{
  const create=vi.fn(()=>'blob:fixture'),revoke=vi.fn(),remove=vi.fn();
  vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
  vi.stubGlobal('document',{createElement:()=>({click:()=>{throw Error('browser denied');},remove}),body:{append:vi.fn()}});
  expect(requestChapterExcerptDownload({filename:'../other.txt',text:'no'})).toBe(false);
  expect(create).not.toHaveBeenCalled();
  expect(requestChapterExcerptDownload({filename:'天道.txt',text:'纸上旧事'})).toBe(false);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:fixture');
});
