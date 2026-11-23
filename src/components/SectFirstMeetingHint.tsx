import {useEffect,useId,useRef} from 'react';

export type FirstMeetingStep =
  | {readonly kind:'disciple'}
  | {readonly kind:'job';readonly name:string;readonly practice:boolean}
  | {readonly kind:'confirm';readonly name:string;readonly job:string};

const instructions=(step:FirstMeetingStep)=>{
  switch(step.kind){
    case 'disciple':return '先点一位弟子。其余人可以照常自行安排。';
    case 'job':return '给'+step.name+'挑件差事。'+(step.practice?'拿不定主意，就试试「闭关修炼」。':'');
    case 'confirm':return '已给'+step.name+'派了「'+step.job+'」。若已安排妥当，就开晨会。到月底听弟子回话。';
  }
};

export function SectFirstMeetingHint({step,onSkip}:{step:FirstMeetingStep;onSkip:()=>void}){
  const title=useId();
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  return <section aria-labelledby={title} data-sect-first-meeting={step.kind}
    className="min-w-0 rounded-xl border border-amber-300/50 bg-amber-950/45 px-3 py-2 lg:col-span-2">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
      <h2 ref={heading} id={title} tabIndex={-1} className="scroll-mt-40 font-serif text-lg font-semibold text-amber-100">第一堂晨会</h2>
      <button type="button" onClick={onSkip} className="min-h-11 rounded-md px-2 text-sm text-amber-100 underline underline-offset-4 focus-visible:outline focus-visible:outline-amber-300">略过引导</button>
    </div>
    <p role="status" className="text-sm leading-5 text-amber-50">{instructions(step)}</p>
  </section>;
}
