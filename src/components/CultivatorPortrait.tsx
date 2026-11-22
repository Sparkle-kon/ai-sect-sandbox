import type {CultivatorPortraitSpec} from './cultivatorPortraitModel';

type PortraitProps={portrait:CultivatorPortraitSpec;className?:string};
const jaw=[
  'M35 47q2-18 25-19 23 1 25 19l-3 15q-3 13-22 22-19-9-22-22Z',
  'M35 48q1-20 25-21 24 1 25 21l-2 14q-2 16-23 24-21-8-23-24Z',
  'M34 47q2-19 26-20 24 1 26 20l-3 20q-7 13-23 16-16-3-23-16Z',
  'M36 50q1-20 24-23 23 3 24 23l-2 14q-4 12-22 23-18-11-22-23Z',
] as const;
const hair=[
  'M32 60q-5-34 27-40 32 1 30 40l-6-5-4-20q-12 10-25 8l-10-2-7 18Z',
  'M31 65q-2-28 14-38l7-4q-2-9 8-13 11 5 7 14 25 4 23 42l-7-9-3-19q-13 1-20-5-7 6-20 5l-3 19Z',
  'M32 63Q27 30 52 23q14-8 29 4 12 9 8 34l-6-7-5-15q-7-5-14-6-5 9-21 12l-6 12Z',
  'M31 65q-4-26 13-38 17-11 35 0 16 12 10 38l-6-7q0-11-7-18-8 5-15 5-9 0-15-6-7 7-9 19Z',
] as const;
const eyes=[
  'M41 54q6-3 12 0m14 0q6-3 12 0',
  'M41 55q6-5 12-1m14 0q6-4 12 1',
  'M41 54q6-4 12 1m14 0q6-5 12-1',
  'M42 54q5-2 11 1m14 0q6-3 11-1',
] as const;
const brows:Record<CultivatorPortraitSpec['brow'],string>={
  level:'M41 49h11m16 0h11',soft:'M41 51q5-4 12-2m14 0q7-2 12 2',sharp:'m41 48 12 4m14 0 12-4',
};
const ornaments=[
  'M44 31q15-6 32 0m-5-3 7-5',
  'M49 25h23m-4-4 6 4-6 4',
  'M60 19v14m-6-10 6-5 6 5',
  'M42 35q11-8 23-8m-15-2 5 7m-8-3 9-7',
] as const;
const collars:Record<CultivatorPortraitSpec['attire'],string>={
  neutral:'m40 90 20 20 20-20m-20 20v23',
  crossed:'m41 90 30 31m9-31-30 44m7-33 23 24',
  layered:'m36 94 24 20 24-20m-41-5 17 15 17-15m-17 25v19',
};

function PortraitHalo({halo}:{halo:NonNullable<CultivatorPortraitSpec['halo']>}){
  return <g data-portrait-halo={halo.kind} fill="none" stroke={halo.color} strokeLinejoin="round">
    {halo.kind==='gold-wheel'?<>
      <circle cx="60" cy="54" r="44" strokeWidth="1.25" opacity=".85"/>
      <circle cx="60" cy="54" r="40" strokeWidth=".5" opacity=".65"/>
      <path d="M60 6v6m0 84v6M11 54h7m84 0h7M25 20l5 5m60 60 5 5m1-70-6 5M30 85l-5 5" opacity=".75"/>
    </>:halo.kind==='dharma'?<>
      <path d="M19 96V52q0-23 41-43 41 20 41 43v44M24 89V53q0-20 36-38 36 18 36 38v36" strokeWidth="1" opacity=".75"/>
      <path d="M60 5c8 9 10 14 0 23-10-9-8-14 0-23ZM17 71l9 11-6 9m83-20-9 11 6 9" opacity=".85"/>
    </>:<>
      <path d="M70 10a43 43 0 1 0 31 45A39 39 0 0 1 70 10Z" fill={halo.color} opacity=".27" strokeWidth=".8"/>
      <path d="M29 22a45 45 0 0 0-13 59m76-18 13 4m-8-14 9 1" opacity=".75"/>
    </>}
  </g>;
}

export function CultivatorPortrait({portrait,className='h-[4.5rem] w-16'}:PortraitProps){
  const {face,palette}=portrait;
  const {ink,skin,detail}=face;
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 120 136" width={120} height={136}
    className={`block shrink-0 overflow-hidden rounded-lg ${className}`} data-cultivator-portrait="">
    <rect x="1" y="1" width="118" height="134" rx="13" fill={palette.background}/>
    <rect x="4" y="4" width="112" height="128" rx="11" fill="none" stroke={palette.trim} strokeWidth=".75" opacity=".37"/>
    <path d="M6 89 25 74 32 81 48 57 70 82l11-7 32 24v31H6Z" fill={palette.spirit} opacity=".12"/>
    <path d="M7 109q13-8 26 0t26 0m27-2q12-9 26 0M10 25h20m-14 4h18m66 11h12m-16 4h16" stroke={palette.trim} strokeWidth=".65" opacity=".35" fill="none"/>
    {portrait.halo&&<PortraitHalo halo={portrait.halo}/>}
    <path d="M33 55q-7 15-10 39l11-4 5 7 11-9h22l12 8 7-7 7 5q-4-27-10-39Z" fill={ink} opacity=".95"/>
    <path d="M8 132q2-24 16-32l19-12 17-5 17 5 19 12q14 8 16 32Z" fill={palette.fabric} stroke={ink} strokeWidth="1.55"/>
    <path d="M49 75h22l1 17-12 12-12-12Z" fill={skin} stroke={ink} strokeWidth="1.15"/>
    <path d="m19 114 21-15m42 0 19 15M32 111l-6 21m63-21 6 21" stroke={palette.trim} opacity=".44" strokeWidth=".9" fill="none"/>
    <path d={collars[portrait.attire]} stroke={palette.trim} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d={jaw[face.jaw]} transform={detail?`translate(${detail.cheekSlope*.55} 0)`:undefined} fill={skin} stroke={ink} strokeWidth="1.35"/>
    <g fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
      <path d={brows[portrait.brow]} strokeWidth="1.1"/>
      <path d={eyes[face.eyes]} transform={detail?`translate(60 0) scale(${1+detail.eyeSpread*.023} 1) translate(-60 0)`:undefined} strokeWidth="1.05"/>
      <path d="m59 57-2 7 4 1m-7 8q6 3 12 0" strokeWidth=".8"/>
      {portrait.ageBand==='seasoned'&&<path d="m37 56 2 2m42 0 2-2" strokeWidth=".55" opacity=".8"/>}
      {portrait.ageBand==='elder'&&<path d="M51 44h16m-13-2h11m-29 14 3 2m-2 1 3 2m44-5-3 2m2 1-3 2M49 68l-2 5m24-5 2 5" strokeWidth=".68" opacity=".8"/>}
    </g>
    <path d={hair[face.hair]} transform={detail?`translate(${detail.fringeSweep*.6} 0)`:undefined} stroke={ink} strokeWidth="1.2" fill={ink}/>
    <path d="M36 44q3-14 14-16m-12 20q5-14 14-17m25 1q7 7 8 16" stroke={palette.trim} opacity={portrait.ageBand==='elder'?'.76':'.27'} strokeWidth=".8" strokeLinecap="round" fill="none"/>
    <path d={ornaments[face.ornament]} stroke={palette.trim} strokeWidth="1.55" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
    <path d="m60 119 3 4-3 4-3-4Z" fill={palette.spirit} stroke={palette.trim} strokeWidth=".55"/>
  </svg>;
}
