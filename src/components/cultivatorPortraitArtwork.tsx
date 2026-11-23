import type { CultivatorPortraitSpec } from './cultivatorPortraitModel';

type Portrayed = {portrait:CultivatorPortraitSpec};
type Hair = {back:string;front:string;detail:string};

const hair:readonly Hair[]=[
  {back:'M37 44Q25 45 24 66L19 99q16 5 23-9l8-17h23q10 9 17 24l11-3-5-28Q92 49 82 40Z',
   front:'M28 65Q27 34 47 25q-4-12 13-17 12 1 14 12l-3 5q22 4 23 40l-8-7-4-20q-12 12-30 5L39 51l-6 16Z',
   detail:'M40 47q3-14 18-17m9-9q-2-5-8-7m11 20q13 4 16 16'},
  {back:'M32 47Q20 71 24 95l15-8 9-14h26l10 18 12 4q4-29-8-44Z',
   front:'M30 62Q28 40 40 31l8-7-4-8 6-9 13-2 12 8-2 12 7 4Q94 38 91 63l-8-8-3-14q-13 5-20-5-9 10-20 7l-4 18Z',
   detail:'M36 54q6-17 17-21m-6-13 6-8 11-2 8 7m-3 17q9 4 14 12'},
  {back:'M33 47Q21 62 20 102l17-8 5 7 8-23h22l13 23 6-5 12 5q-3-28-15-54Z',
   front:'M29 69Q25 44 38 33l10-8 2-13h22l3 14 9 6q12 13 8 34l-7-7-5-17q-13 2-19-6-5 7-22 11l-5 20Z',
   detail:'M51 15h19m-21 9h23m-7 10q14 4 20 15m-44-7q3-8 15-13'},
  {back:'M32 50Q16 71 17 90l11 13 6-6 9 14 3-29h24q7 22 29 23-13-8-11-20 6 1 16 3Q100 62 88 43Z',
   front:'M29 68Q24 45 40 30l7-5q-5-11 5-14 12-6 19 2l2 10q15 3 19 18l4 26-10-9-4-16q-15 4-25-7-2 9-18 12l-5 20Z',
   detail:'M38 47q4-10 19-15m-4-16q7-5 13 1m4 17q15 6 17 17'},
  {back:'M28 60Q15 49 17 36q3-15 23-15l11 6Q29 28 26 39q-2 16 15 22l7 20-7 20-17 6 7-15-17 3q7-15 14-35Zm55-11q15 12 19 41l-8 12-14-12-11-21Z',
   front:'M28 65Q25 43 38 31l9-7q-3-8 9-13 12-4 17 9l-1 6q23 10 22 38l-7-6-4-16q-10 1-18-7-7 9-25 9l-6 20Z',
   detail:'M33 47q6-16 23-17m-7-9q6-8 15-4m4 15q13 5 18 18'},
  {back:'M29 47Q17 66 23 86l-4 21 17-3 15-26h25l10 22 17 4-7-20q3-22-9-37Z',
   front:'M28 67q-7-21 1-32-3-3-5-8 0-8 8-10 8-3 12 7 16-5 32 0 5-10 13-7 9 3 9 12l-4 7q7 12 0 31l-9-10-4-16q-9 4-18-4-10 9-23 6l-4 16Z',
   detail:'M28 29q-1-8 9-7m44 0q8-3 12 5M37 46q8-13 22-15m5 1q10 9 20 8'},
  {back:'M32 44Q21 45 16 67q-4 13 6 26-6 10-4 17l14 4 12-9 8-30h22l10 29 14 10 10-6-7-19q8-16 1-30-7-15-16-18Z',
   front:'M28 74Q20 38 48 25q14-6 30 0 22 11 15 44l-10-7 2-11-10-12q-9 7-22 8l-10-3-8 20-2 16Z',
   detail:'M35 51q6-17 20-21m7 3q14-4 24 12m7 18q3 17-2 24'},
  {back:'M31 44Q17 57 19 89l-2 24 17 3 9-16 5-25h25l7 25 12 15 11-6-2-27q-1-23-13-38Z',
   front:'M29 78Q18 39 44 27q15-7 31-1 22 9 21 42l-6 18-7-8 2-16-5-17q-15 1-25-10-4 12-17 14l-3 22-6 14Z',
   detail:'M30 67q0-29 20-35m13-1q20 8 27 30m-9 10 5 20'},
  {back:'M28 56q-13 24 2 46l7-4 13-29 26 5q2 21 10 28l16 9-8-20q12-17-7-43Z',
   front:'M25 72q-6-25 9-41 12-11 32-7 24 4 27 32l3 12-9 10 3 13-7 8-7-7 2-9-4-8 8-11-6-20q-9 5-22-8-14 9-17 30l-4 13Z',
   detail:'M34 49q8-16 22-18m15 5 9 6m2 39 7 5-7 5 4 5'},
  {back:'M29 45q-15 13-7 36l-2 15 16 10 13-33h23l8 29 18-7-3-14q7-27-9-36Z',
   front:'M26 64q-9-19 3-31-5-12 5-16 6-9 17-3 8-16 21 0 12-2 17 8l2 11q10 10 1 34l-9-9-3-16q-12 5-18-9-5 12-23 11l-3 17Z',
   detail:'M33 32q0-10 11-11m12 1q9-12 15-4m2 16q10 2 15 11'},
  {back:'M31 43q-10 6-13 23l4 16-5 18 15-5 7 7 13-24h21l16 25 13-7-8-14 6-13-12-26Z',
   front:'M28 65Q26 44 37 31l8-6 1-8 9-6 11 0 8 7-2 6q12 5 18 17l6 26-9-6-6-17q-11 6-25-6-9 13-17 10l-3 14Z',
   detail:'M38 48q4-12 17-17m-8-8 9-8h9l5 6m-2 14q12 3 18 18'},
  {back:'M29 48Q15 65 20 81l-5 18 9 10 7-6 5 10 17-36h20l11 34 10-10 12 3-4-20q6-21-15-40Z',
   front:'M26 74Q22 41 42 28q18-10 37 2 14 8 15 30l-3 19-8-8 2-12-7-13q-20 3-28-12-4 15-12 21l-5 23Z',
   detail:'M30 63q2-24 16-32m12 1q7 13 19 13m4 7q9 11 7 20'},
];

const atmosphere={
 sword_peak:{sky:'#53788a',mountain:'#819e9b',shade:'#3f646f',sun:'#ebdab3'},
 pill_valley:{sky:'#647c65',mountain:'#a6aa73',shade:'#546856',sun:'#f5d99a'},
 market:{sky:'#8f5f65',mountain:'#b38a7c',shade:'#6c525e',sun:'#ffc58a'},
 blood_abyss:{sky:'#704356',mountain:'#956276',shade:'#4d334c',sun:'#f0a095'},
 north_vein:{sky:'#647e9b',mountain:'#afc5ca',shade:'#4f687e',sun:'#f4e1bc'},
 countryside:{sky:'#708c81',mountain:'#9aab87',shade:'#526f65',sun:'#fae3a3'},
} as const;

const chroma=(color:string,withColor:string,ratio:number)=>{
 const match=/^#[0-9a-f]{6}$/iu;
 if(!match.test(color)||!match.test(withColor))return color;
 return '#'+[1,3,5].map(i=>Math.round(Number.parseInt(color.slice(i,i+2),16)*(1-ratio)+
   Number.parseInt(withColor.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('');
};

function artHair(portrait:CultivatorPortraitSpec){
 const elder=portrait.ageBand==='elder';
 return {form:hair[portrait.hairStyle??portrait.face.hair]??hair[0],
   base:elder?chroma(portrait.face.ink,'#cdd4d8',.58):chroma(portrait.face.ink,'#394859',.24),
   glint:elder?'#e0dade':chroma(portrait.face.ink,'#a5a49c',.38)};
}

export function PortraitScenery({portrait,stage=false}:Portrayed&{stage?:boolean}){
 const {palette,locale}=portrait;
 const theme=locale?.theme??'countryside';
 const c=atmosphere[theme];
 const winter=locale?.season==='winter'||theme==='north_vein';
 const mote=winter?'#edffd9':locale?.season==='autumn'?'#ffc582':locale?.season==='summer'?'#d9ea8b':'#ffd2be';
 return <g data-portrait-layer="scenery">
   <rect x="1" y="1" width="118" height="134" rx="13" fill={palette.background}/>
   <rect x="5" y="5" width="110" height="126" rx="10" fill={c.sky} opacity={stage?.93:.78}/>
   <path d="M6 32q35-17 55-8t52-10V9H6Z" fill={palette.background} opacity=".2"/>
   <circle cx="92" cy="25" r="13" fill={c.sun} opacity=".18"/>
   <circle cx="92" cy="25" r="9.2" fill={c.sun} opacity=".86"/>
   <path d="M6 66 19 54 29 55 43 35 55 56 63 49 82 68 93 54 113 63v46H6Z" fill={c.mountain}/>
   <path d="M6 75 28 59l7-4 8-20 12 21 8-7 6 9-14 .6-11-8-9 11-9-1Z" fill={c.sun} opacity={winter?.7:.32}/>
   <path d="M6 82l16-12 19 6 14-11 22 18 20-15 17 7v51H6Z" fill={c.shade}/>
   <path d="M5 76q19-5 31-1t31-3m-50 13q15-4 25-2t21 0m20 10q18-5 30-3M7 61q18-2 28 .8m55-22q12-4 24-2" fill="none" stroke={c.sun} strokeWidth=".9" opacity=".47"/>
   {theme==='market'?<g fill={c.shade} stroke={c.sun} strokeWidth=".45"><path d="M8 82h22l-6-4-2-3H15l-2 4-5 2Zm4 1v12h14V83m65 4h22l-8-5h-8zm3 1v11h15V88"/><circle cx="13" cy="86" r="1.4" fill="#ffba67"/><circle cx="108" cy="90" r="1.5" fill="#ffba67"/></g>:
   theme==='pill_valley'?<path d="M10 105 14 69m5 31 4-41M13 77l-5-6m15-1 6-5m-8 13-6-4m86 30 5-49m3 45 4-25m-7-15-6-3m5 14 7-4" fill="none" stroke={c.sun} strokeWidth="1.2" opacity=".55"/>:
   theme==='blood_abyss'?<path d="M7 106 19 85 23 88l9-14m61 10 5 14 14-23M8 113q8-5 17-3m66 1q14-9 23-4" fill="none" stroke={c.sun} opacity=".49"/>:
   <path d="M13 107V86l-5 8 5-3 6 5-6-10m11 20V88l-4 9 4-2 3 2m76 6V78l-6 11 6-2 7 3-7-10m7 27V91l-4 8 4-2 4 4" fill="none" stroke={winter?'#e8ece4':c.sun} strokeWidth="1.15" opacity=".56"/>}
   <g fill={mote} opacity=".77">
    {[[15,17],[23,33],[41,14],[98,45],[107,19],[14,74],[95,63],[103,59],[11,52],[111,50]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i%3?.58:1}/>)}
   </g>
   <path d="M8 31V15q0-6 6-6h13m66 0h13q6 0 6 6v13M8 108v14q0 6 6 6h13m67 0h12q6 0 6-6v-14" fill="none" stroke={palette.trim} strokeWidth=".7" opacity=".69"/>
 </g>;
}

export function PortraitTreasure({portrait}:Portrayed){
 const {treasure,palette}=portrait;
 if(!treasure)return null;
 return <g data-portrait-layer="treasure" data-portrait-treasure={treasure} strokeLinecap="round" strokeLinejoin="round">
  {treasure==='sword_case'?<g transform="rotate(26 95 60)">
    <path d="M90 122V36l5-7 5 7v86l-5 6Z" fill="#303441" stroke="#172131" strokeWidth="1.4"/>
    <path d="M93 122V39l3-5 1 6v81l-2 2Z" fill={palette.fabric}/>
    <path d="M90 45h10m-10 57h10m-7-52v46m4-61v8" fill="none" stroke={palette.trim} strokeWidth="1.1"/>
    <path d="M88 36h14m-7-1v-15m-2 8h4m-4-5h4m-4-4h4" fill="none" stroke="#edd6a4" strokeWidth="1.5"/>
   </g>:treasure==='gourd'?<g transform="rotate(12 94 84)">
    <path d="M89 65h7l-1 7q12 4 4 13 17 14 4 25-11 8-23-2-8-11 4-23-7-10 6-13Z" fill="#ae7355" stroke="#4d4447" strokeWidth="1.25"/>
    <path d="M90 75q-8 2-6 8m2 8q-9 9-2 15" fill="none" stroke="#f8c586" strokeWidth="1.4"/>
    <path d="M87 65h11m-12 20q7 2 14-1m-7 2q11-7 13 2l-3 6" fill="none" stroke={palette.trim} strokeWidth="1.3"/>
   </g>:treasure==='lute_case'?<g transform="rotate(-15 24 81)">
    <path d="M15 111q-8-7-3-20l8-14V42q4-6 10-2l2 4v33l8 12q7 18-6 24Z" fill="#4e4c5a" stroke="#302e40" strokeWidth="1.3"/>
    <path d="M16 109q-8-9-1-20l8-13V45l4-2 2 3v31l8 14q6 13-4 18Z" fill={palette.fabric} stroke={palette.trim} strokeWidth=".85"/>
    <path d="M25 49v28m-6 16q-4 6-1 11m-4-18 20 1m-18 20 20-1" fill="none" stroke={palette.trim} strokeWidth=".8"/>
   </g>:<g transform="translate(93 78)">
    <circle r="13" fill="#3d495e" stroke={palette.trim} strokeWidth="1.1"/>
    <circle r="10" fill="#2b324b" stroke={palette.spirit} strokeWidth=".55"/>
    <path d="m0-9 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="none" stroke={palette.trim}/>
    <circle r="2.2" fill={palette.spirit}/>
   </g>}
 </g>;
}

export function PortraitHairBack({portrait}:Portrayed){
 const {base,form,glint}=artHair(portrait);
 return <g fill={base} stroke={portrait.face.ink} strokeLinejoin="round">
   <path d={form.back} strokeWidth="1.25"/>
   <path d="M29 56q-5 12-4 23l-2 14m70-40q8 14 6 25l2 13M35 64q-8 18-6 31m59-31q7 22 7 32" fill="none" stroke={glint} strokeWidth=".78" opacity=".5"/>
 </g>;
}

const collars:Record<CultivatorPortraitSpec['attire'],string>={
 neutral:'m40 90 20 20 20-20m-20 20v17',
 crossed:'m41 90 30 31m9-31-30 44m7-33 23 24',
 layered:'m36 94 24 20 24-20m-41-5 17 15 17-15m-17 25v19',
};

export function PortraitRobe({portrait}:Portrayed){
 const {face,palette,attire}=portrait;
 const crease=chroma(palette.fabric,'#1b1935',.59), sheen=chroma(palette.fabric,palette.trim,.38);
 const fine=chroma(palette.trim,'#fff3cb',.37), lining=chroma(palette.fabric,'#522f55',.38);
 return <g data-portrait-layer="robe" strokeLinejoin="round">
  <path d="M6 132q5-24 17-31l17-11 10-6h20l10 6 19 11q12 10 15 31Z" fill={palette.fabric} stroke={face.ink} strokeWidth="1.45"/>
  <path d="M47 83h26l5 10-18 15-18-15Z" fill={crease}/>
  <path d="M50 73h20l3 18-13 13-13-13Z" fill={chroma(face.skin,'#774960',.31)} stroke={face.ink} strokeWidth=".95"/>
  <path d="M53 77h13l2 12-8 10-8-8Z" fill={face.skin}/>
  <path d="M15 132q4-17 13-24l14-10-4 18-7 16Zm89 0q-5-17-14-24L78 98l4 18 7 16Z" fill={sheen}/>
  <path d="M12 132q7-8 11-20l12-5m72 25q-7-8-12-20l-11-5M31 131l10-19 3-9m45 28-10-19-3-9" fill="none" stroke={fine} opacity=".48" strokeWidth=".82"/>
  <path d="M42 92l18 17 18-17 3 8-18 22-2 10H49l7-13-20-21Z" fill={lining}/>
  <path d="M42 92l18 17 18-17 3 8-18 22-2 10m-12 0 7-13-20-21" fill="none" stroke={crease} strokeWidth="1.25"/>
  <path d={collars[attire]} stroke={palette.trim} strokeWidth="1.32" strokeLinecap="round" fill="none"/>
  <path d="m26 110 7-3-1 4-4 4 2-4m65-1-7-3 1 4 4 4-2-4M31 118l-5 6m65-6 5 6M59 113l-4 6" fill="none" stroke={fine} opacity=".63" strokeWidth=".68"/>
  <path d="M15 127q8-7 15 0m60 0q8-7 15 0" fill="none" stroke={palette.trim} opacity=".69" strokeWidth=".8"/>
  <path d="m64 120 4 3.8-4 4.2-4-4.2Z" fill={palette.spirit} stroke={fine} strokeWidth=".56"/>
 </g>;
}

const jaws=[
 'M36 46q2-15 24-18 22 3 24 18l-.3 14q-2.7 13-11 18.4L60 86l-12.7-7.6Q39 73 36.3 60Z',
 'M35 47q1-17 25-20 24 3 25 20l-2 14q-2 16-23 24-21-8-23-24Z',
 'M34 46q2-17 26-19 24 2 26 19l-3 19q-6 14-23 18-17-4-23-18Z',
 'M36 49q1-19 24-22 23 3 24 22l-2 15q-4 11-22 23-18-12-22-23Z',
] as const;

export function PortraitFace({portrait}:Portrayed){
 const {face,ageBand}=portrait;
 const {skin,ink,detail}=face;
 const sunset=chroma(skin,'#9a545a',.48), warm=chroma(skin,'#bd6f66',.3), glow=chroma(skin,'#fff1ca',.63);
 return <g data-portrait-layer="face" transform={detail? `translate(${detail.cheekSlope*.45} 0)` : undefined} strokeLinejoin="round">
  <path d="M39 51q-12-7-8 9 1 7 8 8Zm42 0q12-7 8 9-1 7-8 8Z" fill={skin} stroke={ink} strokeWidth="1.04"/>
  <path d="M36 54q-3-3-3 1l3 7m48-8q3-3 3 1l-3 7" stroke={sunset} strokeWidth=".98" fill="none"/>
  <path d={jaws[face.jaw]} fill={skin} stroke={ink} strokeWidth="1.38"/>
  <path d="M38 52q3 4 7 2l-.6 11 3 7 10 10q-9-3-14-9-6-5-5.4-21Zm44 0q-3 4-7 2l.6 11-3 7-10 10q9-3 14-9 6-5 5.4-21Z" fill={sunset} opacity=".65"/>
  <path d="M42 48q6-9 14-10l9-1q8 2 16 11-14-4-19 3-4-7-20-3Z" fill={glow} opacity=".49"/>
  <path d="M54 67q6-3 12 0l-3 3h-6Z" fill={sunset} opacity=".91"/>
  <path d="M59 52l-1.2 12 3.7 1.1-1.2-4.8 1.2-5.4Z" fill={glow} opacity=".81"/>
  <path d="M59 55 56.5 65.4l2.1 1.6m4.2-.5 2-.8" stroke={sunset} strokeWidth=".8" fill="none" strokeLinecap="round"/>
  <path d="M41 62q5-3 11 1l-5 3-5-.8Zm38 0q-5-3-11 1l5 3 5-.8Z" fill={warm} opacity=".82"/>
  <path d="M54 79q5-1.3 12 0l-4.1 2h-4Z" fill={glow} opacity=".55"/>
  {ageBand==='seasoned'&&<path d="m37 56 2 2m42 0 2-2m-41 4 3 .6m30 0 3-.6" stroke={sunset} strokeWidth=".59" opacity=".71" fill="none"/>}
  {ageBand==='elder'&&<path d="M51 44h16m-13-2h11m-29 14 3 2m-2 1 3 2m44-5-3 2m2 1-3 2M49 68l-2 5m24-5 2 5" stroke={sunset} strokeWidth=".72" opacity=".88" fill="none"/>}
 </g>;
}

const expressions={
 calm:{eye:'M-8 .2Q-2-4.4 3.2-2.5L8 .6Q.4 3.2-8 .2Z',lid:'M-8 .2Q-2-4.4 3.2-2.5L8 .6',brow:'M-8-6q8-3 15-1',ry:1.91,cy:-.32,lips:'M53 73q7 1.4 14 0-7 4.4-14 0Z',mouth:'M54 73.4q6 1.5 12 0'},
 joy:{eye:'M-8 .1Q-2-6.3 4-3.7L8 .3Q2 2.5-8 .1Z',lid:'M-8 .1Q-2-6.3 4-3.7L8 .3',brow:'M-8-8q7-5 15-2',ry:2.03,cy:-.86,lips:'M52 72q8 3 16-.4-5.3 9.8-11.5 6.1Z',mouth:'M53.5 73.2q6 1.5 13 0'},
 fight:{eye:'M-8-.4Q-1-3.5 3.8-.5L8 1.5Q1 3.3-8-.4Z',lid:'M-8-.4Q-1-3.5 3.8-.5L8 1.5',brow:'M-8-8Q-2-8 7-4',ry:1.43,cy:.44,lips:'M53 73l6.7-.8 7.3.8-6.2 2.1Z',mouth:'M53.5 73q5.3-1.7 12.3.3'},
 wounded:{eye:'M-8 .5Q-2-2.4 4-1L8 1Q2 2.6-8 .5Z',lid:'M-8 .5Q-2-2.4 4-1L8 1',brow:'M-8-4q7-1.3 15-5',ry:.91,cy:.45,lips:'M54 75.3q5-4.6 12-1.5-5.9 2.7-12 1.5Z',mouth:'M54.5 75q6.2-3 10.7-1.1'},
 demon:{eye:'M-8-.1Q-3-5 3-2.6L8 1.4Q.5 4.1-8-.1Z',lid:'M-8-.1Q-3-5 3-2.6L8 1.4',brow:'M-8-9q4-.2 15 5',ry:1.95,cy:-.24,lips:'M52 74q9 1 16-3.6-3.5 7.2-9.6 6.6Z',mouth:'M53 74.5q8 1.7 14-3.1'},
} as const;

export function PortraitEyes({portrait}:Portrayed){
 const {face,palette}=portrait;
 const state=portrait.expression??'calm';
 const e=expressions[state];
 const demon=state==='demon',wounded=state==='wounded',joy=state==='joy',fight=state==='fight';
 const iris=demon?'#c84177':fight?chroma(palette.spirit,'#46516a',.51):chroma(palette.spirit,'#473a56',.59);
 const eyeWhite=demon?'#f0aec1':wounded?'#e8d5bf':'#fff0d4';
 const skinShade=chroma(face.skin,'#694157',.46);
 const browOffset=portrait.brow==='sharp'?-.55:portrait.brow==='soft'?.62:0;
 const xOffset=face.detail?.eyeSpread??0;
 const formShift=face.eyes===1?-.6:face.eyes===3?.57:0;
 return <g data-portrait-layer="eyes" data-portrait-expression={state}>
  {([0,1] as const).map(side=><g key={side} transform={`translate(${side===0?47-xOffset:73+xOffset} ${55+formShift+(side===1&&wounded?1.2:0)}) scale(${side===0?1:-1} 1)`}>
   <path d="M-8 2.2Q-1 5.6 8 2" stroke={demon?'#bb5985':skinShade} strokeWidth={wounded?1.75:.75} fill="none" opacity={wounded?.72:.49}/>
   <path d={e.brow} stroke={face.ink} strokeWidth={fight||demon?1.75:1.32} transform={`translate(0 ${browOffset})`} strokeLinecap="round" fill="none"/>
   <path d={e.eye} fill={eyeWhite} stroke={skinShade} strokeWidth=".48"/>
   <ellipse cx={side===0?.7:-.45} cy={e.cy} rx={demon?2.75:2.54} ry={e.ry} fill={iris}/>
   <ellipse cx={side===0?.85:-.27} cy={e.cy-.04} rx={demon?.65:1.34} ry={e.ry*.85} fill={demon?'#4f2459':face.ink}/>
   <circle cx={side===0?.04:-.95} cy={e.cy-e.ry*.47} r={joy?.63:.47} fill={demon?'#ffd0c9':'#fff9e3'} opacity={wounded?.63:1}/>
   {!wounded&&<circle cx={side===0?2.06:1.06} cy={e.cy+e.ry*.59} r=".29" fill={eyeWhite} opacity=".78"/>}
   <path d={e.lid} fill="none" stroke={face.ink} strokeWidth={fight||demon?1.15:.87} strokeLinecap="round"/>
  </g>)}
  <path d={e.lips} fill={demon?'#a95073':wounded?chroma(face.skin,'#815360',.38):chroma(face.skin,'#a45464',.56)}/>
  <path d={e.mouth} fill="none" stroke={demon?'#852b59':'#714052'} strokeWidth={wounded?.65:.84} strokeLinecap="round"/>
  {joy&&<path d="M56 74.35q4.6.65 9-.15l-1.7 1.3h-5.8Z" fill="#fff0d2"/>}
  {fight&&<path d="m58 45 1 4m3-4-1 4" fill="none" stroke={skinShade} strokeWidth=".79"/>}
  {wounded&&<g><path d="M82 61q-4 5-1.5 8 3 1 3-2Z" fill="#eaf3df" opacity=".84"/><path d="M66 74.5q2 2.3.6 3.4" fill="none" stroke="#ab5262" strokeWidth="1.2" strokeLinecap="round"/></g>}
  {demon&&<path d="m60 44 2.5 3.6L60 51l-2.5-3.4Zm-20 16-3 3m43-3 3 3" fill="#ba567d" stroke="#82395d" strokeWidth=".7"/>}
 </g>;
}

export function PortraitHairFront({portrait}:Portrayed){
 const {form,base,glint}=artHair(portrait);
 const shift=portrait.face.detail?.fringeSweep??0;
 return <g data-portrait-layer="hair" data-portrait-hair={portrait.hairStyle??portrait.face.hair}
   transform={shift? `translate(${shift*.5} 0)` : undefined} strokeLinejoin="round" strokeLinecap="round">
   <path d={form.front} fill={base} stroke={portrait.face.ink} strokeWidth="1.55"/>
   <path d={form.detail} fill="none" stroke={glint} strokeWidth="1.04" opacity=".77"/>
   <path d="M35 46q9-13 22-15m10 1q15 3 21 18" fill="none" stroke={glint} strokeWidth=".52" opacity=".47"/>
 </g>;
}

export function PortraitHeadpiece({portrait}:Portrayed){
 const {palette}=portrait;
 const style=portrait.accessoryStyle??portrait.face.ornament;
 const glint=chroma(palette.trim,'#fff0c8',.55), shade=chroma(palette.trim,'#6b4d63',.49);
 return <g data-portrait-layer="headpiece" data-portrait-accessory={style} strokeLinecap="round" strokeLinejoin="round" stroke={palette.trim}>
  {style===0?<g>
    <path d="M42 35q15-8 32-6l7-6 2 2-8 6q-21-.1-32 5Z" fill={shade} strokeWidth=".78"/>
    <path d="M44 35q13-6 29-4m3-4 6-4" fill="none" stroke={glint} strokeWidth=".7"/>
   </g>:style===1?<g>
    <path d="m48 32-.1-7 7-.6 5-5 6 5 7 .9-.2 6q-12-3.1-25 .7Z" fill={shade} strokeWidth="1.1"/>
    <path d="m60 23 3.8 3-3.8 3.8-3.8-3.8Z" fill={palette.spirit} stroke={glint} strokeWidth=".67"/>
    <path d="M51 28h3m13 0h3" stroke={glint} strokeWidth=".9"/>
   </g>:style===2?<g>
    <path d="M43 35q14-7 34-3l6-2m-9 2q6 9 6 17m-2-15q7 6 8 13" fill="none" stroke={glint} strokeWidth=".92"/>
    <path d="m75 30 3.7-3 3.3 3-3.4 3Z" fill={palette.spirit} strokeWidth=".8"/>
    <circle cx="80" cy="49" r="1.3" fill={palette.spirit} strokeWidth=".58"/>
    <circle cx="86" cy="47" r="1.2" fill={glint} strokeWidth=".58"/>
   </g>:<g>
    <path d="M39 39q16-8 39-3l1.2 1.6q-20-1.6-39 3.8Z" fill={shade} strokeWidth=".76"/>
    <path d="m59 34.5 2.7 2.2L59 40l-3-2.8Z" fill={palette.spirit} stroke={glint} strokeWidth=".67"/>
    <path d="M41 40q-3 12-7 21l-2-1q3-8 6-18m40-4q5 9 7 18l-1.6 1-5.1-14" fill={shade} strokeWidth=".6" opacity=".85"/>
   </g>}
 </g>;
}
