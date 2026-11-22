import type {RoguelikeEncounterChoice,RoguelikeEncounterKind} from '../types/roguelikeEncounter';

interface EncounterChoiceWords {readonly choice:RoguelikeEncounterChoice;readonly label:string;readonly risk:string}
interface EncounterWords {readonly title:string;readonly scene:string;readonly choices:readonly EncounterChoiceWords[]}
const retreat:EncounterChoiceWords={choice:'leave',label:'转身离去',risk:'不取机缘，也不耗气血。'};
export const ROGUELIKE_ENCOUNTER_CATALOG:Readonly<Record<RoguelikeEncounterKind,EncounterWords>>={
  'sword-cave':{
    title:'坐化剑仙洞府',
    scene:'石门半掩，一线剑意从尘中透出。不知多少年前，有人把最后一招留在了这里。',
    choices:[
      {choice:'cautious',label:'隔石观剑',risk:'得悟时略增修为与气运；神念稍有差错，可能受伤。'},
      {choice:'bold',label:'上前接最后一剑',risk:'若有所悟，可大进修为并添寿；若接不住，气血和修为都可能受损。'},
      retreat,
    ],
  },
  'wounded-traveler':{
    title:'路边负伤的修士',
    scene:'路旁有人捂伤倚着断石，气息未绝，却没有开口唤你。你既看见了，便只差向前一步。',
    choices:[
      {choice:'cautious',label:'留一缕灵气相助',risk:'用一点修为护住一线生机；若对方认下这份情，便结下善缘。'},
      {choice:'bold',label:'替他挡下近处的险意',risk:'须耗修为，也可能受伤；若守得住，能结下更深的善缘。'},
      retreat,
    ],
  },
  'sealed-scroll':{
    title:'残卷里的一声问',
    scene:'旧卷封口有一道乌痕。指尖还没拂过，耳边先听见一声极轻的问话。',
    choices:[
      {choice:'cautious',label:'在封印之外读卷',risk:'只取能辨认的字句，所得较少；封印反噬时也可能受伤。'},
      {choice:'bold',label:'以神念入卷',risk:'真意若现，可进修为并添寿；若陷入幻象，气血与寿元皆可能受损。'},
      retreat,
    ],
  },
};

export interface RoguelikeNominalEffect {
  readonly qi:number;readonly hpRate:number;readonly karma:number;readonly years:number;readonly affinity:number;
}
type Chances=Readonly<Record<Exclude<RoguelikeEncounterChoice,'leave'>,
  {readonly threshold:number;readonly win:RoguelikeNominalEffect;readonly loss:RoguelikeNominalEffect}>>;
const effects=(qi:number,hpRate:number,karma:number,years:number,affinity=0):RoguelikeNominalEffect=>({qi,hpRate,karma,years,affinity});
const empty=effects(0,0,0,0);
const outcomes:Readonly<Record<RoguelikeEncounterKind,Chances>>={
  'sword-cave':{
    cautious:{threshold:82,win:effects(12,0,2,0),loss:effects(0,-.04,0,0)},
    bold:{threshold:52,win:effects(24,0,4,2),loss:effects(-8,-.16,-2,0)},
  },
  'wounded-traveler':{
    cautious:{threshold:84,win:effects(-4,0,4,0,10),loss:effects(-4,0,1,0)},
    bold:{threshold:59,win:effects(-8,-.05,8,0,22),loss:effects(-8,-.10,1,0)},
  },
  'sealed-scroll':{
    cautious:{threshold:80,win:effects(9,0,3,0),loss:effects(0,-.03,0,0)},
    bold:{threshold:49,win:effects(20,0,3,3),loss:effects(-5,-.12,-2,-1)},
  },
};

export function roguelikeNominalEffect(kind:RoguelikeEncounterKind,choice:RoguelikeEncounterChoice,roll:number):
  {success:boolean;effect:RoguelikeNominalEffect}{
  if(choice==='leave')return {success:false,effect:empty};
  const row=outcomes[kind][choice];
  const success=roll<row.threshold;
  return {success,effect:success?row.win:row.loss};
}
