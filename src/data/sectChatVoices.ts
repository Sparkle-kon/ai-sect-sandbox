import type {Cultivator,PersonalityTrait,WorldEvent} from '../types/world';
import type {SectChatRoomId,SectChatSource} from '../types/sectChat';

export const LABELS:Readonly<Record<SectChatRoomId,string>>={
  own:'本宗内部群',jiuzhou:'九州修仙交流群',market:'坊市二手灵器群',leaders:'掌门私聊',
};
export type Greeting=Extract<SectChatSource,{kind:'room_greeting'}>['kindOfGreeting'];
type Voices=readonly [string,string,string,string];
export const GREETINGS:Readonly<Record<Greeting,Voices>>={
  own:['诸位同门早。今日谁先借墨？先说好，不连砚台一道借。','晨钟敲三响便好。第四响一出，我总觉得还有差事没领。',
    '且给茶壶留一壶水。炼丹的道友若来借，烦请先说借的是水还是壶。','诸位若有话且慢说。若没话，也给蒲团留个座。'],
  jiuzhou:['请诸位清谈论道。说得太玄的道友，烦请给晚辈留两句听得懂的。',
    '借问一句，闭关之前先写告示好，还是出关之后再补个告示好？','行道不争这半日。谁若争得，我先请他代看一炉茶。',
    '诸位慢谈。这里茶盏尚有空位，只怕一时没有那么多大道。'],
  market:['问价随意。若要以半卷剑诀抵半袋米，烦请说清是哪半卷。','诸位议价归议价。算盘的珠子，经不起用剑气拨。',
    '若是借秤，尽可开口。若是借秤砣去镇妖，请另寻一块大的。','有意换货不妨留话。只写「识货来」的，恕我先问是何货。'],
};
export const GRAVE_VOICES:Readonly<Record<'witness'|'rumor',string>>={
  witness:'「{title}」是我亲见。余情未明，先不妄议。',rumor:'听闻「{title}」。不是亲见，还请待来者分说。',
};
/** Settled scores stay on the record even if model chatter is enabled. */
export const CHALLENGE_RESULT_VOICES:Readonly<Record<'witness'|'rumor',Voices>>={
  witness:['亲见这一场山门踢馆，是{winner}胜了。','门前那番交手我看见了，{winner}赢下此场。',
    '这一回在山门分了高下，亲眼见{winner}占了上风。','我在山门跟前，{winner}确实赢下这一场。'],
  rumor:['听人传来，山门踢馆是{winner}胜了。','这一场山门交锋，传来的胜者是{winner}。',
    '我未在门前；只听说是{winner}赢了。','山门那场有消息了，听说{winner}取胜。'],
};

type Tone='blade'|'wary'|'food'|'keeper'|'silver'|'talk';
const PERSONA_TONE:Readonly<Record<PersonalityTrait,Tone>>={
  狂傲:'blade',嗜血:'blade',苟道:'wary',阴险:'wary',逍遥:'food',刚正:'keeper',诡诈:'silver',痴情:'talk',
};
const TONE_WORDS:Readonly<Record<Tone,Voices>>={
  blade:['也请把我的剑谱拿来。我知道，你们还未问。','这下有人肯听我讲第一式了。','可惜这等热闹总慢我一步。','听得我袖中剑还想自己出鞘。'],
  wary:['这回我离门口三步远，正好留条退路。','先让一让，后面那块石头早被我看作退路了。','这便是为何弟子从不坐第一排。','诸位忙着喝彩，我已经把回去的路认了一遍。'],
  food:['我听得入神，连茶盏边都多啃了一口。','话说到这里，茶冷了，热饼倒还来得及。','掌勺的道友可有空？我还有半盘菜没听明白。','这事得配一样脆的，否则笑起来牙关不响。'],
  keeper:['想起门里那只铜钟，它最见不得旁人比它响。','要记就写直一些，纸上歪了我得重抄。','照这份声势，师弟今晚得少敲一回钟。','可有人肯替我把袖口那滴墨拭了？'],
  silver:['且让我看看，一声喝彩究竟收不收茶钱。','摊位还没摆，先有人问这段可否抄了卖。','若这故事值钱，请先告诉我卖的是哪一折。','我有一副旧算盘，听见热闹自己就会响。'],
  talk:['我只续一句。至于这一句多长，诸位容我慢慢说。','故事若有下折，劳烦给我留半张凳。','话到静处最好听。谁再添一句？我正有茶。','这句我留到回山再讲，门里的鹤最肯听人说话。'],
};
export function sectChatWitnessLine(knowledge:'witness'|'rumor',category:WorldEvent['category'],person:Cultivator,variant:number){
  if(category==='death')return GRAVE_VOICES[knowledge];
  const quirks=person.quirks??[];
  const tone:Tone=quirks.includes('glutton')?'food':quirks.includes('miser')?'silver':quirks.includes('chatterbox')?'talk':
    quirks.includes('coward_king')?'wary':quirks.includes('chuunibyou')?'blade':PERSONA_TONE[person.personality];
  const intro=category==='combat'?'擂边传来':category==='breakthrough'?'出关这桩':category==='heavenly'?'天上那桩':'这桩见闻';
  return `${knowledge==='rumor'?'听说':'亲眼见了'}「{title}」。${intro}的声势颇大，${TONE_WORDS[tone][variant%4]}`;
}
