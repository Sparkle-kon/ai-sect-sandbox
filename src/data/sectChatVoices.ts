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
export const COMIC_NEUTRAL:Voices=['且留一句闲笔。话写得太满，下个月的我不好落款。','容我留个句读。不是话说完了，是这一盏茶要凉了。',
  '请掌门宽坐。我先收起这一段话，再想下一段能不能短些。','一句话只占半张纸。余下半张，权作给自己留的退路。'];
export const WITNESS_VOICES:Voices=['这桩我在场：「{title}」。别替我添后半折。','说的是「{title}」这回事。我只说我见过的那一段。',
  '「{title}」，我当时就在跟前。后头如何，容旁人另说。','「{title}」这桩我见着了。诸位若押韵，莫把前后押颠倒。'];
export const RUMOR_VOICES:Voices=['听闻「{title}」。我没在场，先把这句传话记在边上。','有人提起「{title}」。传话归传话，先别给它押韵。',
  '听来的消息，说的是「{title}」。原委我还没见着。','听道友说起「{title}」。当不得亲见，诸位且慢下断语。'];
export const GRAVE_VOICES:Readonly<Record<'witness'|'rumor',string>>={
  witness:'「{title}」是我亲见。余情未明，先不妄议。',rumor:'听闻「{title}」。不是亲见，还请待来者分说。',
};
