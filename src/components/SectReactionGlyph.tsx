import {useEffect,type RefObject} from 'react';
import type {SectReactionCue,SectReactionKind} from '../types/sectReaction';
import './sectReactionGlyph.css';

const marks:Readonly<Record<SectReactionKind,JSX.Element>>={
  sweat:<>
    <path d="M20 6c3 6 8 9 8 15a8 8 0 0 1-16 0c0-5 4-10 8-15Z" fill="#a1e8f5" stroke="#233d56" strokeWidth="2"/>
    <path d="M17 20q-1.5 4 2 5" fill="none" stroke="#f2fdff" strokeWidth="2" strokeLinecap="round"/>
    <path d="m30 9 2-3m0 6 4-1" fill="none" stroke="#d8f8fb" strokeWidth="1.7" strokeLinecap="round"/>
  </>,
  black_line:<>
    <path d="m10 12 2 12m6-14 2 12m6-13 2 12" fill="none" stroke="#e3cfc1" strokeWidth="5" strokeLinecap="round"/>
    <path d="m10 12 2 12m6-14 2 12m6-13 2 12" fill="none" stroke="#252233" strokeWidth="3" strokeLinecap="round"/>
  </>,
  smoke:<>
    <path d="M9 29c-4-1-4-6 1-8 2-1 5 0 6-2 2-3-5-4-4-8 1-4 7-5 9-2m-1 19c7-2 11-5 7-10-4-5 5-6 4-10" fill="none" stroke="#263544" strokeWidth="6" strokeLinecap="round"/>
    <path d="M9 29c-4-1-4-6 1-8 2-1 5 0 6-2 2-3-5-4-4-8 1-4 7-5 9-2m-1 19c7-2 11-5 7-10-4-5 5-6 4-10" fill="none" stroke="#e7e3da" strokeWidth="2.8" strokeLinecap="round"/>
  </>,
  sparkle:<>
    <path d="m11 10 2.6 4.9L19 17l-5.4 2.1L11 24l-2.5-4.9L3 17l5.5-2.1Zm17-2 2.8 5.2L37 16l-6.2 2.5L28 24l-2.7-5.5L19 16l6.3-2.8Z" fill="#ffda80" stroke="#674330" strokeWidth="1.4" strokeLinejoin="round"/>
    <circle cx="11" cy="16.7" r="1.65" fill="#fff4ca"/><circle cx="28" cy="15.6" r="1.85" fill="#fff4ca"/>
  </>,
  soul:<>
    <path d="M9 28q9 2 10-3-8-1-8-8a9 9 0 0 1 18-1q0 6-5 9 0 5-8 7Z" fill="#c9d8f4" fillOpacity=".84" stroke="#486082" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M16 16h.6m6.8 0h.6m-6 4q2 1 4 0m8 2 4-2m-5 7 4-1" fill="none" stroke="#344968" strokeWidth="1.7" strokeLinecap="round"/>
  </>,
  hurt:<>
    <path d="m9 13 4-4 15 15-4 4Z" fill="#efdcca" stroke="#6b4850" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="m14 22-4-4 15-9 4 5Z" fill="#ead6b6" stroke="#6b4850" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="m21 15 1 3m-4-1 1 3m8 3 2-1m-1 5 3 .4" fill="none" stroke="#986a65" strokeWidth="1.25" strokeLinecap="round"/>
  </>,
};
export function SectReactionGlyph({kind,className=''}:{kind:SectReactionKind;className?:string}){
  return <svg data-sect-reaction-glyph={kind} aria-hidden="true" focusable="false" viewBox="0 0 40 40"
    className={`pointer-events-none block select-none ${className}`}>
    <g className="sect-reaction-mark">{marks[kind]}</g>
  </svg>;
}

/** Camera drift is visual only, short, cancellable, and must be supported by an exact local damage cue. */
export function useSectReactionShake<T extends HTMLElement>(ref:RefObject<T>,cue?:SectReactionCue){
  const key=cue?.id,site=cue?.siteId,damage=cue?.shake,cause=cue?.cause;
  useEffect(()=>{
    const element=ref.current,win=element?.ownerDocument.defaultView;
    if(!element||!win||!key||!site||cause!=='report'||damage!=='kitchen'||typeof element.animate!=='function')return;
    const motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(motion?.matches)return;
    const sequence=element.animate([
      {transform:'translate(0,0)'},{transform:'translate(-3px,1px)'},{transform:'translate(2px,-1px)'},
      {transform:'translate(-1px,0)'},{transform:'translate(0,0)'},
    ],{duration:240,iterations:1,easing:'ease-out'});
    const stop=(event:MediaQueryListEvent)=>{if(event.matches)sequence.cancel();};
    motion?.addEventListener?.('change',stop);
    return ()=>{sequence.cancel();motion?.removeEventListener?.('change',stop);};
  },[ref,key,site,damage,cause]);
}
