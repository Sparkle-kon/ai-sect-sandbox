import {describe,expect,it,vi} from 'vitest';
import {reopenChronicleReadingPlace} from '../src/components/ChronicleFeed';
import type {ChronicleReadingPlace} from '../src/engine/chronicleReadingMark';

const scene='evt-9-real-first';
const other='evt-9-same-visible-title';
const position:ChronicleReadingPlace={eventId:scene,sections:['record','dialogue'],listScrollTop:61,pageScrollY:109};

type DialogueEvidence='verified'|'fragment'|'conflict'|'unresolved'|'missing';
function record(eventId:string, options:{button?:boolean; cause?:boolean; dialogue?:DialogueEvidence}={}){
  const state=options.dialogue??'verified';
  const mark={focus:vi.fn()};
  const dialogue={open:false}, cause={open:true};
  const proof={open:false,
    contains:(node:unknown)=>node===mark||node===dialogue||node===cause,
    querySelector:(selector:string)=>{
      if (selector==='[data-chronicle-dialogue] details') return state==='missing'?null:dialogue;
      if (selector==='[data-chronicle-dialogue="verified"] details, [data-chronicle-dialogue="fragment"] details')
        return state==='verified'||state==='fragment'?dialogue:null;
      if (selector==='[data-chronicle-cause]') return options.cause===false?null:cause;
      if (selector==='button[data-chronicle-reading-mark]') return options.button===false?null:mark;
      return null;
    }};
  return {eventId,mark,proof,dialogue,cause};
}
function view(visible:ReturnType<typeof record>[], ...entries:Array<[string,ReturnType<typeof record>]>){
  const contained=new Set<unknown>(visible.flatMap(row=>[row.proof,row.mark,row.dialogue,row.cause]));
  const owners=new WeakMap<HTMLDetailsElement,string>();
  for(const row of [...visible,...entries.map(([,entry])=>entry)]) owners.set(row.proof as unknown as HTMLDetailsElement,row.eventId);
  return {
    owners,list:{contains:(element:unknown)=>contained.has(element)} as unknown as HTMLElement,
    refs:new Map(entries.map(([id,row])=>[id,row.proof])) as unknown as ReadonlyMap<string,HTMLDetailsElement>,
  };
}
const opens=(row:ReturnType<typeof record>)=>[row.proof.open,row.dialogue.open,row.cause.open];

describe('opening only the remembered native evidence and returning its exact focus control',()=>{
  it.each(['verified','fragment'] as const)('restores the specified %s evidence and leaves all other cards untouched',(dialogue)=>{
    const target=record(scene,{dialogue}), unrelated=record(other);
    unrelated.proof.open=true;
    const before=opens(unrelated), {list,refs,owners}=view([target,unrelated],[other,unrelated],[scene,target]);
    // Precise UI focus is a separate explicit user-action responsibility of the caller.
    expect(reopenChronicleReadingPlace(refs,position,list,owners)).toBe(target.mark);
    expect(opens(target)).toEqual([true,true,false]);
    expect(opens(unrelated)).toEqual(before);
    expect(target.mark.focus).not.toHaveBeenCalled();
    expect(unrelated.mark.focus).not.toHaveBeenCalled();
  });

  it.each(['hidden-category','detached','wrong-owner','marker-gone','dialogue-gone','cause-gone',
    'dialogue-conflict','dialogue-unresolved','no-record','no-sections'] as const)(
    'finds no substitute and has no side effects when %s', (fault)=>{
      const dialogue=fault==='dialogue-gone'?'missing':fault==='dialogue-conflict'?'conflict':
        fault==='dialogue-unresolved'?'unresolved':'verified';
      const target=record(scene,{button:fault!=='marker-gone',dialogue,cause:fault!=='cause-gone'});
      const unrelated=record(other);
      const refsForTarget:[string,ReturnType<typeof record>][]=fault==='hidden-category'?[]:[[scene,fault==='wrong-owner'?unrelated:target]];
      const {list,refs,owners}=view(fault==='detached'?[unrelated]:[target,unrelated],[other,unrelated],...refsForTarget);
      const expected:ChronicleReadingPlace=fault==='cause-gone'?{...position,sections:['record','cause']}:
        fault==='no-record'?{...position,sections:['dialogue']}:fault==='no-sections'?{...position,sections:[]}:position;
      const before=[opens(target),opens(unrelated)];
      expect(reopenChronicleReadingPlace(refs,expected,list,owners)).toBeUndefined();
      expect([opens(target),opens(unrelated)]).toEqual(before);
      expect(target.mark.focus).not.toHaveBeenCalled();
      expect(unrelated.mark.focus).not.toHaveBeenCalled();
    });
});
