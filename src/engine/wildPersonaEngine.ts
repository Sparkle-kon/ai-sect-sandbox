import {DESTINY_TRAIT_IDS,type DestinyTraitId} from '../types/destinyTrait';
import type {Cultivator,PersonalityTrait} from '../types/world';

export type PersonaMoment='thought'|'scheme'|'combat_open'|'combat_reply'|'farewell'|'trade_open'|'trade_reply'|
  'dual_cultivation_open'|'dual_cultivation_reply'|'sect_diplomacy_open'|'sect_diplomacy_reply'|'social_open';
export type PersonaActor=Pick<Cultivator,'id'|'personality'|'destinyTraits'>;
export interface PersonaOption {readonly id:string;readonly text:string}
type Three=readonly [string,string,string];

const palette:Readonly<Record<PersonalityTrait,Readonly<Record<'thought'|'scheme'|'combat_open'|'combat_reply'|'farewell',Three>>>>={
  刚正:{
    thought:['浊世未必辨得黑白，我却不能先把自己的心看错。','风吹得山石也响，站得稳的，还得是脚下这一步。','两袖纵然空空，胸中那杆秤不能斜。'],
    scheme:['暗处也照得见本心。此念，我须自己担着。','走的是窄路，总不能连自己的脚印也骗过去。','袖中藏锋容易，回头直视此心却难。'],
    combat_open:['风声如今够响了。你我不妨在明处分个高低。','话若说不尽，便在刀剑前说清。','不借影子遮眼。来，与我堂堂正正地交手。'],
    combat_reply:['我不退，你也不必留手。','我听明白了。是非暂且搁下，先接你这一招。','好，且让刀刃说一句不必遮掩的话。'],
    farewell:['这一口气散了，也不必替我把黑白颠倒。','我这一生走得直，末了就不改路了。','风还往前吹。是非由后来人自己去看。'],
  },
  阴险:{
    thought:['烛焰照见的半边脸，从来不是真相的全貌。','话到七分便足够，余下三分，留给风去猜。','一池水有几层影子？先别急着投石。'],
    scheme:['把念头藏在灯下。人人都看光，未必有人看影。','弦不可绷得叫人听见，手指却一刻也不能松。','与其惊动一池鱼，不如先听它们怎样拨水。'],
    combat_open:['道友何必看我的手？风向往往比手势有趣。','明处只有一寸好走，偏偏你我都想落脚。','剑出半寸，余下半寸，劳道友自己来量。'],
    combat_reply:['也好。我素来喜欢留一分余地给意外。','声势倒足，且看那半句不曾出口的。','不必叫得整座山都知道，招式够真就行。'],
    farewell:['灯灭了，还好最后一个念头只归我自己。','原来尘世到了尽头，连半句话也藏不住。','别猜了。这回我已无话留给风。'],
  },
  狂傲:{
    thought:['云若要低，尽管低。我的眼睛还向着天外。','立在山巅不足为奇，我倒想看看云上还有什么。','世人爱问来路；风本无门，我何须同它报姓名。'],
    scheme:['区区方寸棋盘，且让我想想，天幕能不能作它的边。','霜敢落在峰头，我便敢在暗处走这一着。','且收锋一寸，只怕世人先被剑影吓着。'],
    combat_open:['你若真敢听剑啸，便到我面前来！','一身风雷未曾散尽，今日何妨借刀剑问个高低。','山外尚有山。让我瞧瞧，你是不是那一道峰。'],
    combat_reply:['有些胆色。且别只把它用在开口上！','云海不能拦我一眼，你的锋芒可别叫我失望。','好，今日且让声势和真本事站在一处。'],
    farewell:['原来最高处也有风吹不到的地方……我还想再看一眼。','这一程走到尽头，我仍不惯向天垂首。','且让我望一眼天外；我这一生，还未看够。'],
  },
  苟道:{
    thought:['世上万般玄妙，不如先留一息，让自己慢慢看。','江上浪急，握得牢的未必是剑，也可以是橹。','风过竹仍在，何苦偏在风头去争先。'],
    scheme:['先给自己留道门。门若不在，整盘棋都不值得落子。','走到阴影里才更该看清脚下，莫把退路当作装饰。','乌云比人来得快，有些念头先藏着，不必急展。'],
    combat_open:['不到万不得已，我是不肯出手的。如今便请吧。','只盼刀剑收时，你我都还有心力看一眼天色。','且把脚放稳了。谁也不必为了气盛乱出手。'],
    combat_reply:['我可不打算逞一时声气，先看你落招。','既然避不开，我便把每一步都走仔细。','刀刃无眼，道友最好也别急。'],
    farewell:['我留过那么多条退路。到头来，竟只剩眼前这一条。','且容我安静片刻，最后这一口气也该慢慢吐。','风去了又来，我便不再起来看了。'],
  },
  痴情:{
    thought:['月光从来不催人，偏偏照得心里那一点牵挂清楚。','浮生像一盏隔雨的灯，远看依稀，近了便叫人不舍。','说是修一颗空心，风过时，心里终究还会有回声。'],
    scheme:['此念一动，胸中像落了一叶。且别让它惊动满池水。','若连这点不安也避而不看，我又为何深夜留灯。','月色仍在窗外，心里的结却不能交给月色去解。'],
    combat_open:['且听剑鸣。至于心中所念，不劳锋刃替我道尽。','刀剑无情，握剑的人却不是木石。道友，请。','今朝既要交手，便只问眼前这一招。'],
    combat_reply:['原想不让风吹乱这点心思。如今，且接你一刃。','剑上的光我看得清。心里的话不必说给它听。','既走到这一步，我自会把手握稳。'],
    farewell:['愿月明之时，世上还有人肯为心事停一停。','这一息尽了，心里偏还有一句来不及说。','天光若肯再留片刻……罢了，不必迟。'],
  },
  嗜血:{
    thought:['太静了，连血脉走过指骨的声音都听得见。','炉火若不够烈，刃便总少一分锋意。','喉间像压着一缕火，眼下还不是让它见风的时候。'],
    scheme:['先把躁意按进鞘里。有些锋芒出得早，反钝。','耐心和锋刃一样，都得在暗中磨。','影子里也听得见脉搏，且看自己能忍几声。'],
    combat_open:['刃还没碰上，我已听得见你我之间的风。来！','让风听一听，究竟是锋刃响，还是骨里的气响。','少说一句，便能早听一声刀鸣。'],
    combat_reply:['好，别把锋芒收回去。','这般声响才有趣。你的下一招呢？','让刃口再近些，我还站在这里。'],
    farewell:['刃声停了……这片刻竟比刀鸣还响。','最后这一息倒安静，真叫人不惯。','我这一身火到了尽头，剩一寸冷，自己尝。'],
  },
  逍遥:{
    thought:['云从袖边游过，既不问我从哪儿来，我也不问它往哪儿去。','世事系得再紧，也不过风里一根绳。','山风一笑，许多过不去的念头便也过境了。'],
    scheme:['风不替我藏念头，是我自己不愿将它放出去。','此念如舟，总得先看看溪水往哪边去。','不必把天下都装进袖子，先辨眼前一缕风。'],
    combat_open:['你我既已相逢，不如当面论一论剑。','风向我借衣，你向我问刃。请吧。','相逢就是一人一程。既要交手，何须扫兴。'],
    combat_reply:['我并非爱争，只是不想辜负眼前这阵好风。','行，且把此刻当作山间遇雨。','道友出招，我随风接就是。'],
    farewell:['余下的山水，劳风替我漫游一程。','云散不必再聚，我这一番游历也够长了。','好风还在。此处告别，不必惊醒清山。'],
  },
  诡诈:{
    thought:['门上若画着一条路，我便想看看门背后有什么。','若人人都看见同一个影子，才值得问灯究竟搁在哪里。','山重水复未必难走，有时候是画图者故意拐了一笔。'],
    scheme:['别让手中这一笔落得太直，纸外还有人看。','念头折个弯，才好听清直路尽头的脚步。','棋不必先争胜，我只想看下一子该往哪处落。'],
    combat_open:['别只看刃口。风往哪边绕，才有意思。','你我何妨各留一个疑问，交给第一招回答。','路是直的，刀光可不肯直。道友，留神。'],
    combat_reply:['有趣。可别忙着相信你亲眼看见的。','我接着，至于怎样接，眼下还不该说。','先把下一句话留一留，刃口不太爱听太满的答复。'],
    farewell:['没想到走过这么多迂回，末了倒只得一条直路。','最后这个弯，看来不必再设法绕过去了。','此处再没谜底。也罢，让风去猜。'],
  },
};

const context:Readonly<Record<Exclude<PersonaMoment,'thought'|'scheme'|'combat_open'|'combat_reply'|'farewell'>,Three>>={
  trade_open:['道友，眼前这件东西，能否当面商量？','我愿把价摆在明处，请道友先验看。','货与价当面说清才好。道友意下如何？'],
  trade_reply:['先验货，再谈价。','言语不抵凭据，且当面核过。','价且摆在眼前，货也须看个仔细。'],
  dual_cultivation_open:['若道友也愿意，可于此处同守一周天。','这一回只谈吐纳。道友若有意，不妨共行周天。','我愿同修一程，各守丹田，不逾半寸。'],
  dual_cultivation_reply:['只此一诀，若气脉不稳便各自收功。','好，只随吐纳，不问旁事。','各自看住一息，应收功时便收。'],
  sect_diplomacy_open:['且彼此听一听来意，暂不谈盟誓。','我来以言会道友，不借一句话作盟约。','先把信意说清，约定另当再议。'],
  sect_diplomacy_reply:['来意我愿如实传达，此言不作盟誓。','好，话可以听，约不能凭空既成。','此话我记下了，若要结盟还须正式议定。'],
  social_open:['且坐下，容我说一段心中疑问。','不妨说说你所见的道，我也讲一讲自己的疑问。','今朝得闲，何妨借此片刻各陈所见？'],
};
const turnOfVoice:Readonly<Record<PersonalityTrait,string>>={
  刚正:'我素爱在明处说话。',阴险:'风过得太巧，倒让人想细听。',狂傲:'这点山风，且听我说。',苟道:'话不必急，且给自己留一口气。',
  痴情:'有些念头，不说出口也会回响。',嗜血:'且把心头燥意按一按。',逍遥:'心若像云一般闲，才便于听道友一谈。',诡诈:'眼前的话听一层，余下还可再听一层。',
};

const motif:Readonly<Record<DestinyTraitId,string>>={
  'clear-sword-heart':'心似拭净的剑脊。',
  'unfading-blood-sea':'胸中潮声犹未平。',
  'heaven-favored':'且听天风来处。',
  'supreme-patience':'山影不动自有道理。',
  'alchemy-poison-transmutation':'苦意如炉边余烟。',
  'star-reforged-bones':'想来星光也经炉火。',
  'still-heart-mirror':'心镜上不留浮尘。',
  'primordial-breath':'一息绵长如天地初分。',
  'benevolent-worldtree':'草木自负深根，向来无言。',
  'night-wandering-soul':'长夜也有微光可循。',
};

const traitIds:ReadonlySet<DestinyTraitId>=new Set(DESTINY_TRAIT_IDS);
export function latestEarnedPersonaTrait(actor:PersonaActor):DestinyTraitId|undefined{
  let best:NonNullable<Cultivator['destinyTraits']>['earned'][number]|undefined;
  for(const earned of actor.destinyTraits?.earned??[]){
    if(earned.actorId!==actor.id||!traitIds.has(earned.traitId)||!earned.options.includes(earned.traitId)||
      !Number.isSafeInteger(earned.chosenTick)||earned.chosenTick<earned.openedTick)continue;
    if(!best||earned.chosenTick>best.chosenTick||earned.chosenTick===best.chosenTick&&earned.id<best.id)best=earned;
  }
  return best?.traitId;
}
const coreMoment=(moment:PersonaMoment):moment is keyof typeof palette[PersonalityTrait]=>
  moment==='thought'||moment==='scheme'||moment==='combat_open'||moment==='combat_reply'||moment==='farewell';

export function personaOptions(actor:PersonaActor,moment:PersonaMoment):readonly PersonaOption[]{
  const earned=latestEarnedPersonaTrait(actor);
  const authored=coreMoment(moment)?palette[actor.personality][moment]:context[moment];
  const prelude=coreMoment(moment)?'':turnOfVoice[actor.personality];
  return authored.map((line,index)=>({
    id:`${moment}-${index+1}`,
    text:`${earned?motif[earned]:''}${prelude}${line}`,
  }));
}

export function personaLine(actor:PersonaActor,moment:PersonaMoment):string{
  const alternatives=personaOptions(actor,moment);
  let hash=2166136261;
  for(const ch of `${actor.id}:${actor.personality}:${moment}`)hash=Math.imul(hash^(ch.codePointAt(0)??0),16777619);
  return alternatives[(hash>>>0)%alternatives.length].text;
}

/** Validates creative first-person fiction for the authorized private reader only, never public quotes. */
export function privatePersonaText(raw:unknown):string|undefined{
  if(typeof raw!=='string'||raw.length>640)return undefined;
  const text=raw.trim(),checked=text.normalize('NFKC');
  if(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>{}`]/u.test(checked)||/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/iu.test(checked)||
    /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?:\b|\/)/iu.test(checked)||
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/u.test(checked)||/\[[^\]]*\]\([^)]*\)/u.test(checked))return undefined;
  const length=Array.from(text).length;
  return length>=2&&length<=160?text:undefined;
}
