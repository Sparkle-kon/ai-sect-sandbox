import type { UpperPassageScrollView } from '../engine/upperPassageScroll';
import { UPPER_PASSAGE_NODE_NAMES } from '../engine/upperPassageTerms';

const scenes = {
  eligible:['寒玉井边','门槛就在眼前，脚下仍是下界。','M25 49h46m-11 0 8-7 5 7m-22-2V28h15v14'],
  threshold:['踏上界隙','脚已踏上石阶，还未到上界。','M26 52h12v-7h12v-7h12v-7h10'],
  arrived:['过了界隙','石阶过去，脚已落在上界。','M28 52h13l9-9h10l10-9h12m-18-3V21h15v10'],
  turning:['沿来路折返','脚步已转回原路，还没有回到井边。','M78 31H61l-8 9H35m8-7-8 7 8 7'],
  returned:['回到寒玉井边','来路已经走完，脚下又是下界。','M74 32 57 47H39m-10 0h20m-18 0 4 9h10l3-9'],
  walking:['沿石阶行进','已在路上走过一步，眼下停在实到之处。','M25 52h12v-6h13v-8h12v-6h11'],
} as const satisfies Record<UpperPassageScrollView['kind'],readonly [string,string,string]>;

/** An illustration of a receipt, not a map, a path preview, or a way to move the actor. */
export function UpperPassageScroll({view,animate=false}:{view:UpperPassageScrollView;animate?:boolean}) {
  const [title,text,ink]=scenes[view.kind];
  const motion=animate&&view.kind!=='eligible'&&!!view.sourceId;
  return <figure data-upper-passage-scroll={view.kind}
    className="flex min-w-0 items-center gap-2.5 rounded-md border border-violet-400/25 bg-slate-950/60 px-2 py-1.5 text-violet-100">
    {motion&&<style>{'@media (prefers-reduced-motion: no-preference){@keyframes upperPassageInkSettle{from{opacity:.48;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}}'}</style>}
    <svg viewBox="0 0 104 64" aria-hidden="true" focusable="false" className="h-12 w-[4.875rem] shrink-0">
      <rect x="3" y="4" width="98" height="56" rx="4" fill="#151327" stroke="#776589"/>
      <path d="M8 16h88M8 53h88M11 10v45m82-45v45" fill="none" stroke="#403653" strokeWidth=".75"/>
      <path d="M12 48 30 22l14 14m18-5 13-12 16 25" fill="none" stroke="#554969" strokeWidth=".9"/>
      <g className={motion?'motion-safe:animate-[upperPassageInkSettle_760ms_ease-out_1_both]':undefined}>
        <path d={ink} fill="none" stroke="#e7c896" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"/>
      </g>
    </svg>
    <figcaption className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
      <p className="font-serif text-sm font-semibold text-violet-50">{title}</p>
      <p className="text-xs leading-relaxed text-violet-100/85">{text}</p>
      {(view.kind==='walking'||view.kind==='threshold')&&<p className="text-xs text-violet-100/75">所在：{UPPER_PASSAGE_NODE_NAMES[view.nodeId]}</p>}
    </figcaption>
  </figure>;
}
