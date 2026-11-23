import type {RoguelikeEncounterChoice,RoguelikeEncounterKind,ContextualEncounterKind,RoguelikeEncounterRecord} from '../types/roguelikeEncounter';
import {createStoryletRegistry,type StoryletDefinition} from './storyletEngine';

export interface RoguelikeStoryletStage {
  readonly theme:'sword_peak'|'countryside'|'pill_valley';
  readonly actorPose:'idle'|'fight'|'cultivate'|'labor';
  readonly witnessPose?:'idle'|'fight'|'cultivate'|'labor';
}
interface ChoiceWords {readonly label:string;readonly risk:string}
interface EncounterChoiceWords extends ChoiceWords {readonly choice:RoguelikeEncounterChoice}
interface EncounterScene {readonly title:string;readonly scene:string;readonly stage:RoguelikeStoryletStage}
interface EncounterWords extends EncounterScene {readonly choices:readonly EncounterChoiceWords[]}
export interface RoguelikeNominalEffect {
  readonly qi:number;readonly hpRate:number;readonly karma:number;readonly years:number;readonly affinity:number;readonly petHpRate?:number;
}
export type ChanceDrivenRoguelikeKind=Exclude<RoguelikeEncounterKind,'sect-gate'>;
type Effect={readonly kind:'leave'}|{
  readonly kind:'roll';readonly threshold:number;readonly win:RoguelikeNominalEffect;readonly loss:RoguelikeNominalEffect;
};
type NominalResult={readonly success:boolean;readonly effect:RoguelikeNominalEffect};
type EncounterSchema={
  Id:ChanceDrivenRoguelikeKind;
  Context:{readonly actorId:string;readonly witnessId?:string;readonly aim?:number;readonly contextKind?:ContextualEncounterKind};
  Actor:string;
  Role:'actor'|'witness';
  Scene:EncounterScene;
  Choice:RoguelikeEncounterChoice;
  ChoiceMeta:ChoiceWords;
  Condition:{readonly kind:'aim-band';readonly min:number;readonly stop:number}|{readonly kind:'local-context';readonly encounter:ContextualEncounterKind};
  Binder:{readonly kind:'actor'}|{readonly kind:'witness'};
  Effect:Effect;
  EffectContext:{readonly roll:number};
  Result:NominalResult;
};
type Definition=StoryletDefinition<EncounterSchema>;
const effects=(qi:number,hpRate:number,karma:number,years:number,affinity=0):RoguelikeNominalEffect=>({qi,hpRate,karma,years,affinity});
const empty=Object.freeze(effects(0,0,0,0));
const actorRole={id:'actor',binder:{kind:'actor'}} as const;
const witnessRole={id:'witness',binder:{kind:'witness'}} as const;
const woundedAim={kind:'aim-band',min:34,stop:67} as const;
const retreat={id:'leave',meta:{label:'转身离去',risk:'不取机缘，也不耗气血。'},effect:{kind:'leave'}} as const;

function choice(id:'cautious'|'bold',label:string,risk:string,threshold:number,
  win:RoguelikeNominalEffect,loss:RoguelikeNominalEffect):Definition['choices'][number]{
  return {id,meta:{label,risk},effect:{kind:'roll',threshold,win,loss}};
}
const definitions:readonly Definition[]=[
  {id:'beast-guard',conditions:[{kind:'local-context',encounter:'beast-guard'}],roles:[actorRole],
    scene:{title:'灵兽护主',scene:'险势撞到路口，随行的灵兽伏低身子，挡在半步之前。要并肩撑过这一阵，还是自己先挡上去？',
      stage:{theme:'countryside',actorPose:'fight'}},
    choices:[
      choice('cautious','与灵兽共挡险势','你耗灵气稳住阵脚，灵兽要挨这一下。',100,
        {...effects(-6,0,2,0),petHpRate:-.12},empty),
      choice('bold','护着灵兽冲出险势','护住灵兽，让最险的一步由自己担。',100,effects(-2,-.18,5,0),empty),retreat,
    ]},
  {id:'river-farewell',conditions:[{kind:'local-context',encounter:'river-farewell'}],roles:[actorRole],
    scene:{title:'夜渡引魂灯',scene:'水边天色暗下。你想起那位已故的旧识，掌中还有一点灵火。灯只照水，不会把人照回来。',
      stage:{theme:'countryside',actorPose:'cultivate'}},
    choices:[
      choice('cautious','留一盏灯，道一声别','耗一些灵气静守。若能放下牵挂，往后修行少一分暗伤。',82,
        effects(-4,0,5,1),effects(-4,0,1,0)),
      choice('bold','以心火送灯入水','心火映照旧念。若压不住余焰，要伤气血，也可能折寿。',53,
        effects(10,0,9,2),effects(-6,-.12,-1,-1)),retreat,
    ]},
  {id:'snow-shelter',conditions:[{kind:'local-context',encounter:'snow-shelter'}],roles:[actorRole],
    scene:{title:'风雪借宿',scene:'寒夜到了有人烟的村落，门内留着一点灶火。你若想借宿，可以帮着收拾灶间，也可以主动到檐下守一夜。',
      stage:{theme:'countryside',actorPose:'labor'}},
    choices:[
      choice('cautious','帮着收拾灶火，借宿一晚','用一点灵气烧旺炉火，进屋调养伤势。',100,effects(-4,.12,2,0),empty),
      choice('bold','在寒檐下替人守夜','守住时可得修行感悟；硬扛寒气，也可能伤身乃至折寿。',70,
        effects(8,.05,6,0),effects(-5,-.17,0,-1)),retreat,
    ]},
  // If a real injured witness exists, it wins in the overlapping interval before the fallback.
  {id:'wounded-traveler',conditions:[woundedAim],roles:[actorRole,witnessRole],
    scene:{title:'路边负伤的修士',scene:'路旁有人捂伤倚着断石，气息未绝，却没有开口唤你。你既看见了，便只差向前一步。',
      stage:{theme:'countryside',actorPose:'idle',witnessPose:'idle'}},
    choices:[
      choice('cautious','留一缕灵气相助','用一点修为护住一线生机；若对方认下这份情，便结下善缘。',84,
        effects(-4,0,4,0,10),effects(-4,0,1,0)),
      choice('bold','替他挡下近处的险意','须耗修为，也可能受伤；若守得住，能结下更深的善缘。',59,
        effects(-8,-.05,8,0,22),effects(-8,-.10,1,0)),
      retreat,
    ]},
  {id:'sword-cave',conditions:[{kind:'aim-band',min:0,stop:50}],roles:[actorRole],
    scene:{title:'坐化剑仙洞府',scene:'石门半掩，一线剑意从尘中透出。不知多少年前，有人把最后一招留在了这里。',
      stage:{theme:'sword_peak',actorPose:'fight'}},
    choices:[
      choice('cautious','隔石观剑','得悟时略增修为与气运；神念稍有差错，可能受伤。',82,
        effects(12,0,2,0),effects(0,-.04,0,0)),
      choice('bold','上前接最后一剑','若有所悟，可大进修为并添寿；若接不住，气血和修为都可能受损。',52,
        effects(24,0,4,2),effects(-8,-.16,-2,0)),
      retreat,
    ]},
  {id:'sealed-scroll',conditions:[{kind:'aim-band',min:50,stop:100}],roles:[actorRole],
    scene:{title:'残卷里的一声问',scene:'旧卷封口有一道乌痕。指尖还没拂过，耳边先听见一声极轻的问话。',
      stage:{theme:'pill_valley',actorPose:'cultivate'}},
    choices:[
      choice('cautious','在封印之外读卷','只取能辨认的字句，所得较少；封印反噬时也可能受伤。',80,
        effects(9,0,3,0),effects(0,-.03,0,0)),
      choice('bold','以神念入卷','真意若现，可进修为并添寿；若陷入幻象，气血与寿元皆可能受损。',49,
        effects(20,0,3,3),effects(-5,-.12,-2,-1)),
      retreat,
    ]},
];
const registry=createStoryletRegistry<EncounterSchema>(definitions,{
  conditions:{'aim-band':({min,stop},{aim})=>aim===undefined||aim>=min&&aim<stop,
    'local-context':({encounter},{contextKind})=>encounter===contextKind},
  roles:{
    actor:(_binder,{actorId})=>actorId?[actorId]:[],
    witness:(_binder,{actorId,witnessId})=>witnessId&&witnessId!==actorId?[witnessId]:[],
  },
  effects:{
    leave:()=>({success:false,effect:empty}),
    roll:({threshold,win,loss},{roll})=>({success:roll<threshold,effect:roll<threshold?win:loss}),
  },
});

function storyletWords(kind:ChanceDrivenRoguelikeKind):EncounterWords {
  const entry=registry.definition(kind);
  if(!entry)throw new Error(`Invalid native Storylet definition: ${kind}`);
  return {...entry.scene,choices:entry.choices.map(({id,meta})=>({...meta,choice:id}))};
}

/** Presentation compatibility view; sect-gate retains its separate exact authority and reputation rules. */
export const ROGUELIKE_ENCOUNTER_CATALOG:Readonly<Record<RoguelikeEncounterKind,EncounterWords>>={
  'sect-gate':{
    title:'拜山试心',
    scene:'你已到了本门山门。掌门把一张空名笺放在门规旁：未曾自报名，便不立约。门规就在眼前，要应承怎样的来意，只由你自己开口。',
    stage:{theme:'sword_peak',actorPose:'idle'},
    choices:[
      {choice:'cautious',label:'守诺',risk:'只应自己能守的约，止步在门前，说明来意。声望按本门实规落下。'},
      {choice:'bold',label:'识破',risk:'当面指出空名笺不能代人应约。门中按本门看重的分寸记下这一答。'},
      {choice:'leave',label:'离开',risk:'收起话头，不应试也不开约。人仍在这处山门；要离山须另行赶路。'},
    ],
  },
  'sword-cave':storyletWords('sword-cave'),
  'wounded-traveler':storyletWords('wounded-traveler'),
  'sealed-scroll':storyletWords('sealed-scroll'),
  'beast-guard':storyletWords('beast-guard'),
  'river-farewell':storyletWords('river-farewell'),
  'snow-shelter':storyletWords('snow-shelter'),
};

export function roguelikeEncounterChoiceIds(kind:RoguelikeEncounterKind):readonly RoguelikeEncounterChoice[]{
  return ROGUELIKE_ENCOUNTER_CATALOG[kind].choices.map(row=>row.choice);
}

export function roguelikeStoryletCanUseWitness(aim:number):boolean {
  return Number.isInteger(aim)&&aim>=woundedAim.min&&aim<woundedAim.stop;
}

export function selectRoguelikeStorylet(aim:number,actorId:string,witnessId?:string) {
  return Number.isInteger(aim)&&aim>=0&&aim<100?registry.select({aim,actorId,witnessId}):undefined;
}

export function admitRoguelikeStorylet(kind:ChanceDrivenRoguelikeKind,actorId:string,witnessId?:string,contextKind?:ContextualEncounterKind){
  return registry.admit(kind,{actorId,witnessId,contextKind});
}

export function resolveRoguelikeStorylet(kind:ChanceDrivenRoguelikeKind,option:RoguelikeEncounterChoice,roll:number,
  actorId:string,witnessId?:string,contextKind?:ContextualEncounterKind){
  return registry.resolve(kind,option,{actorId,witnessId,contextKind},{roll});
}

/** Static arithmetic for historical storage validation, never a live-role or effect commit. */
export function roguelikeNominalEffect(kind:ChanceDrivenRoguelikeKind,option:RoguelikeEncounterChoice,roll:number):NominalResult {
  const result=registry.previewEffect(kind,option,{roll});
  if(!result)throw new Error(`Invalid stored Storylet option: ${kind}/${option}`);
  return result;
}


/** Use only actual settled deltas when describing a choice's lasting effect. */
export function roguelikeSettlementNarration(row:RoguelikeEncounterRecord):string {
  if(row.choice==='leave')return '你没有伸手，把这一步留给了将来。';
  const outcome=row.outcome;
  const settled=outcome?.success?'你没有白走这一遭。所得所失，都写在这段亲历里。':
    '此路未如所愿。你从险处抽身，所受的波折都已落在身上。';
  if(!outcome||!['beast-guard','river-farewell','snow-shelter'].includes(row.kind))return settled;
  const effects=[
    outcome.petHpDelta!==undefined&&outcome.petHpDelta<0?`灵兽挡在前面，气血减了${-outcome.petHpDelta}。`:'',
    outcome.hpDelta<0?`你伤了${-outcome.hpDelta}点气血。`:outcome.hpDelta>0?`你养回${outcome.hpDelta}点气血。`:'',
    outcome.lifespanDelta<0?`这一遭折去${-outcome.lifespanDelta}年寿元。`:outcome.lifespanDelta>0?`这一遭添了${outcome.lifespanDelta}年寿元。`:'',
  ].join('');
  return effects||settled;
}
