import type {CultivatorPortraitSpec} from './cultivatorPortraitModel';
import {PortraitEyes,PortraitFace,PortraitHairBack,PortraitHairFront,PortraitHeadpiece,
  PortraitRobe,PortraitScenery,PortraitTreasure} from './cultivatorPortraitArtwork';

type PortraitProps={portrait:CultivatorPortraitSpec;className?:string;presentation?:'stage'};

function PortraitHalo({halo}:{halo:NonNullable<CultivatorPortraitSpec['halo']>}){
  return <g data-portrait-layer="halo" data-portrait-halo={halo.kind} fill="none" stroke={halo.color} strokeLinejoin="round">
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

export function CultivatorPortrait({portrait,className='h-[4.5rem] w-16',presentation}:PortraitProps){
  const stage=presentation==='stage';
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 120 136" width={120} height={136}
    className={`block shrink-0 overflow-hidden rounded-lg ${stage?'brightness-110 saturate-[1.22]':''} ${className}`} data-cultivator-portrait="">
    <PortraitScenery portrait={portrait} stage={stage}/>
    {portrait.halo&&<PortraitHalo halo={portrait.halo}/>}
    <PortraitTreasure portrait={portrait}/>
    <PortraitHairBack portrait={portrait}/>
    <PortraitRobe portrait={portrait}/>
    <PortraitFace portrait={portrait}/>
    <PortraitEyes portrait={portrait}/>
    <PortraitHairFront portrait={portrait}/>
    <PortraitHeadpiece portrait={portrait}/>
  </svg>;
}
