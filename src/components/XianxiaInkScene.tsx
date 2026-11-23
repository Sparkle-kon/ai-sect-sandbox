import { useId } from 'react';

export type XianxiaInkSceneVariant = 'people' | 'sect' | 'map' | 'civic' | 'chronicle' | 'story';

interface XianxiaInkSceneProps {
  variant: XianxiaInkSceneVariant;
  className?: string;
}

const palettes = {
  people: ['#385858', '#132d32', '#ecc584'],
  sect: ['#465c5c', '#162a35', '#f4cf8e'],
  map: ['#405a63', '#17343c', '#f1d394'],
  civic: ['#4a5f56', '#172e31', '#eac27b'],
  chronicle: ['#5f6255', '#243739', '#eccc94'],
} as const;

function Pavilion({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} strokeLinejoin="round">
      <path fill="#1c3032" stroke="#9d8056" d="M-21 10h42v29h-42z" />
      <path fill="#354b47" stroke="#d0a16a" d="M-49 13q17-3 22-11l6-6H21l6 6q5 8 22 11-23 3-49 0-26 3-49 0ZM-35-4q19-3 28-14h14Q16-7 35-4q-34 6-70 0Z" />
      <path stroke="#cfa875" fill="none" d="M-7-18Q0-21 0-24q1 4 7 6M-10 19v20m20-20v20M-24 39h48m-28 4h8" />
      <path fill="#e1b36b" d="M-4 25h8v11h-8z" />
    </g>
  );
}

function PeopleScene() {
  return (
    <g data-ink-subject="courtyard">
      <path fill="#233a3b" stroke="#627161" d="M286 150q19-12 47-16l58-8 55 15 15 27H286Z" />
      <path fill="none" stroke="#ab9467" opacity=".63" d="m316 153 83-2 47 7m-97-4-10 7m40-8 3 7m30-6 15 11" />
      <path fill="none" stroke="#47534a" strokeWidth="4" d="M305 143q10-21-7-30-12-7-22-1m23 1q11-19 0-28m-4 51q-17-8-34-3" />
      <path fill="#4e6054" d="M264 111q0-6 18-10 24 1 24 7-18 9-42 3Zm19-24q9-8 25-9 15 3 13 8-15 6-38 1ZM251 132q12-10 31-9 8 0 8 5-21 8-39 4Z" />
      <path fill="#253e3e" stroke="#ac986f" d="M347 145q-3-8 5-15 8-6 14-18h12q1 18 22 28l10 12q-36 8-63-7Z" />
      <path fill="#192f32" stroke="#b29468" d="M358 120q4-12 8-15-2-4 1-10 4-4 11-1 6 4 3 11-3 6-8 7l6 12Z" />
      <path fill="none" stroke="#e3bc80" d="M372 116q0 17 21 28m-31-16-7 15m10-18 18 12m-12-44q-3-4 2-6 5 0 6 7" />
      <path fill="#273c3b" stroke="#a99b74" d="M410 157q-3-8 6-20l3-8q-4-8 1-12 12-5 12 5l-4 9 8 13 9 8q-13 9-35 5Z" />
      <path fill="none" stroke="#d5b47b" d="m424 135 5 12 7 4m-14-35q2-4 6-2" />
    </g>
  );
}

function SectScene() {
  return (
    <g data-ink-subject="mountain-temple">
      <path fill="#233b3c" stroke="#607061" d="M229 163 271 142 312 139 331 122 349 121 364 108 425 104 448 118 464 143 507 151 536 168H229Z" />
      <path fill="#324846" stroke="#998568" d="m364 111 59 1 17 7-78 3 33 5-41 4 17 4-56 20 124-1-53-15 47-4-28-7 49-5-26-12Z" />
      <Pavilion x={392} y={72} scale={1.05} />
      <Pavilion x={338} y={115} scale={0.49} />
      <Pavilion x={466} y={119} scale={0.55} />
      <path fill="none" stroke="#cba571" opacity=".65" d="M281 148q13-10 23-7m164 15q10-4 29 5M375 156h61m-50-13h37m-41-10h29" />
    </g>
  );
}

function MapScene() {
  return (
    <g data-ink-subject="river-valley">
      <path fill="#1e383b" stroke="#607369" d="M214 166q59-25 101-38l21-34 25 25 12-6 23 19 30 3 26-28 22 22 29 1 58 36Z" />
      <path fill="#577976" opacity=".8" d="M356 125q55 4 41 13-8 7-39 9-26 4 75 26h53q-79-30-93-28 44-7 25-15-16-7-62-5Z" />
      <path fill="none" stroke="#a2b4a0" opacity=".66" d="M358 123q91 6 32 24 25 2 73 23m-200-17 49-16 25-35 18 21m94 8 9-16 16 19" />
      <path fill="none" stroke="#d1a871" strokeDasharray="2 4" d="M300 143q38-3 63-17t84-18l-18 38 42 12" />
      <g fill="#d0ab72" stroke="#203739" strokeWidth="2">
        <path d="m300 138 5 5-5 5-5-5Zm63-17 5 5-5 5-5-5Zm84-18 5 5-5 5-5-5Zm-18 38 5 5-5 5-5-5Zm42 12 5 5-5 5-5-5Z" />
      </g>
      <g transform="translate(506 81)" fill="none" stroke="#d5b180">
        <circle r="19" opacity=".38" />
        <path d="M0-18 3-4 14 0 3 3 0 18-3 3-14 0-3-4Z" fill="#b8915e" opacity=".86" />
        <path d="M-10-10 10 10m0-20-20 20" opacity=".5" />
      </g>
    </g>
  );
}

function CivicScene() {
  return (
    <g data-ink-subject="market-bridge">
      <path fill="#243d3f" stroke="#5e736a" d="M258 166q45-19 79-21l50-8 62 8q37 2 72 21Z" />
      <Pavilion x={310} y={111} scale={0.54} />
      <Pavilion x={373} y={99} scale={0.81} />
      <Pavilion x={452} y={117} scale={0.62} />
      <path fill="none" stroke="#b4966a" d="M283 129q44 18 80 5 46 14 108-2m-156 4v7m23-6v11m61-8v7m20-6v9m26-10v6" />
      <path fill="#dfad64" d="M312 141h6v6h-6zm23 4h6v7h-6zm61 0h6v6h-6zm20 2h6v7h-6zm26-5h6v7h-6z" />
      <path fill="#36534f" stroke="#a18e6e" d="M355 162q38-26 76 0h-10q-27-13-55 0Z" />
      <path fill="none" stroke="#7e9990" opacity=".64" d="M293 163h47m95 0h61m-77 5h38m-117 0h32" />
    </g>
  );
}

function ChronicleScene() {
  return (
    <g data-ink-subject="open-manuscript">
      <path fill="#2e4442" stroke="#677160" d="m254 166 66-16 92-4 71 3 65 17Z" />
      <path fill="#554b3b" stroke="#bb9a66" d="m287 148 45-51q22-4 57 17 25-18 54-19l41 51q-36-3-93 17-37-15-104-15Z" />
      <path fill="#a18e64" stroke="#c9aa77" d="m296 143 38-48q25 0 55 19 27-18 52-19l36 46q-46 3-86 17-38-12-95-15Z" />
      <path fill="#c2aa7b" stroke="#e8cc91" d="m307 138 31-42q20 1 51 18 26-16 49-18l30 40q-47 6-78 19-35-14-83-17Z" />
      <path fill="none" stroke="#61563e" opacity=".74" d="m389 116 1 38m-51-45q20 1 40 12m-45-4q20 1 45 12m-51-4q25 2 52 12m22-13q19-12 33-14m-33 22q23-12 39-14m-39 22q27-13 45-13" />
      <path fill="#7e5a45" d="m445 116 6 7-9 4-5-8Z" />
      <path fill="#233738" stroke="#af8d5d" d="m475 132 35-38 4 4-36 37-8 5Z" />
      <path fill="#c9ab78" d="m470 140 4-8 5 4Z" />
    </g>
  );
}

const subjects = {
  people: PeopleScene,
  sect: SectScene,
  map: MapScene,
  civic: CivicScene,
  chronicle: ChronicleScene,
} as const;

/** Original, entirely local linework; the center of each composition survives a compact crop. */
export function XianxiaInkScene({ variant, className }: XianxiaInkSceneProps) {
  const id = useId();
  const sky = `${id}-sky`;
  const haze = `${id}-haze`;
  const theme = variant === 'story' ? 'chronicle' : variant;
  const Subject = subjects[theme];
  const [skyColor, inkColor, sunColor] = palettes[theme];

  return (
    <svg
      className={className ? `xianxia-ink-scene ${className}` : 'xianxia-ink-scene'}
      data-ink-scene={variant}
      viewBox="0 0 760 168"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      pointerEvents="none"
    >
      <defs>
        <linearGradient id={sky} x2="0%" y2="100%">
          <stop stopColor={inkColor} />
          <stop offset="1" stopColor={skyColor} />
        </linearGradient>
        <radialGradient id={haze}>
          <stop stopColor={sunColor} stopOpacity=".36" />
          <stop offset="1" stopColor={sunColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path fill={`url(#${sky})`} d="M0 0h760v168H0z" />
      <ellipse cx="390" cy="60" rx="153" ry="71" fill={`url(#${haze})`} />
      <circle cx="390" cy="53" r="24" fill={sunColor} opacity=".81" />
      <path fill="none" stroke={sunColor} opacity=".33" d="M285 43h67m76 0h51m-202 8h58m110 5h57m-188 8h54m44-1h44m-99 10h79" />
      <path fill="#425c59" opacity=".75" d="M0 126 68 85l17-6 23 8 37-33 10-4 21 20 17 1 38 29 28 1 27-22 16-8 31 25 24 7 31 29 107-42 38-3 23-21 17-4 19-20 19 16 39 31 32 4 38-24 16 4 34 27v65H0Z" />
      <path fill="#304c4c" stroke="#658073" strokeOpacity=".45" d="m0 142 56-10 39-24 15-4 27 9 42 25 42-5 32-20 23 3 59 30 64 5 55-13 33-2 66-31 24-4 47 36 24 4 25-17 38-11 49 19v36H0Z" />
      <path fill="none" stroke="#839589" opacity=".42" d="M34 139q56-14 93-8t56 7m-32 6q45 6 82-3m279-3q37-13 87-5t120 0m-159 12q37-5 77 0m-453 7h43m326 2h52" />
      <path fill="#192f33" d="m0 153 46-5 49 8 49-4 40 8 34-4 47 12H0Zm760-3-49 7-55-4-58 9-41-3-27 9h230Z" />
      <Subject />
    </svg>
  );
}
