const paragraphSelector = '[data-chronicle-paragraph-text]';
const headingSelector = '[data-chronicle-prose] h4, [data-chronicle-reader-heading]';

export interface RecapReaderBinding {
  readonly world:object;
  readonly scopeKey?:string;
  readonly viewerId?:string;
  readonly chapterId:string;
}

export function sameRecapReader(a:RecapReaderBinding,b:RecapReaderBinding):boolean {
  return a.world===b.world&&a.scopeKey===b.scopeKey&&a.viewerId===b.viewerId&&a.chapterId===b.chapterId;
}

export interface RecapReturnPosition {
  readonly reader:HTMLElement;
  readonly focus?:HTMLElement;
  readonly anchor?:HTMLElement;
  readonly top?:number;
  readonly text?:string;
  readonly binding:RecapReaderBinding;
}

const focusedIn = (reader:HTMLElement,element:Element|null):HTMLElement|undefined =>
  element&&reader.contains(element)&&'focus' in element ? element as HTMLElement : undefined;

/** Capture a relative reader anchor, not a scroll offset which goes stale when a phone reflows. */
export function captureRecapReturn(reader:HTMLElement,binding:RecapReaderBinding,opener?:HTMLElement):RecapReturnPosition {
  const focus=focusedIn(reader,reader.ownerDocument.activeElement)??opener;
  const paragraphs=Array.from(reader.querySelectorAll<HTMLElement>(paragraphSelector));
  const focusedParagraph=focus?.closest('p')?.querySelector<HTMLElement>(paragraphSelector);
  const noteParagraph=focus?.closest('aside')?.previousElementSibling?.querySelector<HTMLElement>(paragraphSelector);
  const nearFocus=focusedParagraph??noteParagraph;
  const height=reader.ownerDocument.defaultView?.innerHeight??0;
  const score=(row:HTMLElement)=>{
    const bounds=row.getBoundingClientRect();
    if(bounds.top<=0&&bounds.bottom>0)return 0;
    if(bounds.top>=0&&bounds.top<height)return bounds.top+1;
    return Infinity;
  };
  const anchor=nearFocus&&paragraphs.includes(nearFocus)?nearFocus:paragraphs.reduce<HTMLElement|undefined>(
    (best,row)=>score(row)<(best?score(best):Infinity)?row:best,undefined);
  const top=anchor?.getBoundingClientRect().top;
  return {reader,binding,focus,anchor,top:Number.isFinite(top)?top:undefined,text:anchor?.textContent??undefined};
}

const isCurrent=(reader:HTMLElement,element:HTMLElement|undefined):element is HTMLElement=>
  !!element&&element.isConnected&&reader.contains(element);

export function focusRecapReaderHeading(reader:HTMLElement|undefined|null) {
  if(!reader?.isConnected)return;
  const heading=reader.querySelector<HTMLElement>(headingSelector);
  if(!heading)return;
  const enabled=heading.hasAttribute('tabindex');
  if(!enabled)heading.setAttribute('tabindex','-1');
  heading.focus({preventScroll:true});
  if(!enabled)heading.removeAttribute('tabindex');
}

export function restoreRecapReturn(position:RecapReturnPosition,currentReader:HTMLElement,current:RecapReaderBinding):boolean {
  const {reader,anchor,focus,top,text}=position;
  if(reader!==currentReader||!reader.isConnected||!sameRecapReader(position.binding,current))return false;
  if(anchor&&(!isCurrent(reader,anchor)||(anchor.textContent??undefined)!==text))return false;
  if(anchor&&top!==undefined) {
    const offset=anchor.getBoundingClientRect().top-top;
    if(Number.isFinite(offset)&&Math.abs(offset)>0.5)reader.ownerDocument.defaultView?.scrollBy({top:offset,behavior:'instant'});
  }
  if(isCurrent(reader,focus))focus.focus({preventScroll:true});
  else focusRecapReaderHeading(reader);
  return true;
}
