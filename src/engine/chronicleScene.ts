import type { WorldEvent } from '../types/world';

export type ChronicleSceneFact = Pick<WorldEvent,'title'|'description'|'category'> & Partial<Pick<WorldEvent,'witnessScope'>>;
export interface ChronicleSceneText { title: string; paragraph: string }

// Capture only explicit text emitted by these canonical producers. If the shape differs,
// it belongs to the verbatim fallback, not a guess about names, conflict, or outcome.
const name = String.raw`([^\n】【。！？；，：:]{1,64}?)`;
const site = String.raw`([^】\n]{1,120})`;
const realm = String.raw`(练气|筑基|金丹|元婴|化神|炼虚|合体|大乘|渡劫)`;
const minorBreak = new RegExp(String.raw`^在【${site}】，${name}突破瓶颈，修为精进至【${realm}([1-9])层】！$`);
const majorBreak = new RegExp(String.raw`^在【${site}】，${name}渡过天劫，成功破境踏入【${realm}期】！寿元与战力暴涨！$`);
const trialStarts = new RegExp(String.raw`^${name}引动${realm}天劫，须渡过(\d{1,3})重雷劫与心魔一关。$`);
const trialPassed = new RegExp(String.raw`^${name}渡过劫雷与心魔，踏入【${realm}】境！$`);
const siegeStarts = new RegExp(String.raw`^${name}耗费(\d{1,9})灵石，集结(\d{1,9})名修士向${name}出征。$`);
const backlash = new RegExp(String.raw`^${name}强行冲关失败，雷劫加身吐血重伤，气息萎靡。$`);
const escaped = new RegExp(String.raw`^${name}于【${site}】向${name}悍然出手！一番激斗后，${name}占据上风，${name}受创（-(\d{1,9}) HP）化作血光遁走。$`);
const lethal = new RegExp(String.raw`^【${site}】剑气纵横，${name}与${name}爆发生死决战！最终${name}技高一筹，将${name}当场斩杀并收缴其储物戒：(\d{1,9}) 灵石及 (\d{1,9}) 件法宝。(?:另有(\d{1,9})枚古器碎片循实账随战利品转移。)?$`);
const peaceful = new RegExp(String.raw`^${name}未能突破更高境界，大限将至，于洞府中安然坐化。$`);
const truce = /^双方托管实际保证金及(\d{1,9})灵石重建款，有序撤回(\d{1,9})支参战队伍，暂停敌对行为。$/;
const totalLoss = /^商队途经当回合灾区，遗失(\d{1,9})份货并退买方(\d{1,9})灵石。$/;
const undelivered = /^商队途经当回合灾区，原批(\d{1,9})份货未交付，已退买方(\d{1,9})灵石。$/;
const arrival = /^买方收货(\d{1,9})份，卖方收到(\d{1,9})灵石。$/;
const departure = new RegExp(String.raw`^(\d{1,9})份(翡翠灵叶|玄土根|星露花|幽影苔|筑基丹|九转金丹|破障丹|噬心毒丹)由${name}运往${name}，预计(\d{1,9})回合。货款待到货结算。$`);
const exploring = new RegExp(String.raw`^${name}御剑抵达【${site}】，在古迹残垣间寻得 (\d{1,9}) 枚上品灵石。$`);
const sharing = new RegExp(String.raw`^${name}与${name}于【${site}】畅谈天地法则，(相谈甚欢。|言道：“[^\r\n]{1,400}”)$`);
const authoring = new RegExp(String.raw`^${name}将历练融入【${site}】，(?:并抄本入${name}藏经阁|手稿随身珍藏)。$`);
const brewing = new RegExp(String.raw`^${name}借([1-3])阶丹炉耗费(\d{1,9})灵石与药材炼制【(筑基丹|九转金丹|破障丹|噬心毒丹)】，凝成一枚灵丹。$`);
const forging = /^([^\r\n。！；]{2,150})耗费(\d{1,9})灵石，铸成【((?:金|木|水|火|土|雷|暗|天灵根)纹·(?:法器|灵器|法宝|通天灵宝))】。$/;
const sameDuelPair = (a:string,b:string,winner:string,loser:string) => a !== b &&
  (a === winner && b === loser || b === winner && a === loser);
const plain = (text:string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();

/** Scene copy is a deterministic view of one public fact, not a new event, quotation or source of truth. */
export function writeChronicleScene(fact: ChronicleSceneFact): ChronicleSceneText {
  if (fact.witnessScope === 'participants') return {title:'未公开的纪事',paragraph:''};
  const title = plain(fact.title);
  const text = plain(fact.description);
  if (fact.category === 'heavenly' && title === '天道沙盒开启：风起陨仙墟' &&
    text === '仙历1001年春，上古陨仙墟灵气暴涨，太虚剑宗、血月魔宗、丹霞谷与天机阁修士纷纷出动，修仙界大幕拉开。') {
    return {title:'陨仙墟异动',paragraph:'那年春天，先有动静的是上古陨仙墟。墟中灵气骤盛，太虚剑宗、血月魔宗、丹霞谷和天机阁的修士纷纷动身。这一卷，便从陨仙墟写起。'};
  }
  if (fact.category === 'breakthrough') {
    const explored = exploring.exec(text);
    if (explored && title === `${explored[1]}游历${explored[2]}获机缘`) {
      const [,actor,place,stones] = explored;
      return {title:`${place}残垣中的灵石`,
        paragraph:`${actor}御剑到了${place}。机缘就在古迹的残垣间：${actor}在残垣间寻得了${stones}枚上品灵石。`};
    }
    const scripture = authoring.exec(text);
    if (scripture && title === `${scripture[1]}自创功法`) {
      const [,actor,technique,sect] = scripture;
      return {title:`《${technique}》由此而成`,
        paragraph:`一路所得的历练，${actor}写进了《${technique}》。功法既成，${sect ?
          `一份抄本又送入${sect}的藏经阁。` : '手稿便随身珍藏。'}`};
    }
    const brewed = brewing.exec(text);
    if (brewed && title === `${brewed[1]}炼丹成丹`) {
      const [,actor,grade,cost,pill] = brewed;
      return {title:`炉中凝成一枚${pill}`,
        paragraph:`${actor}借${grade}阶丹炉炼药，药材和${cost}灵石就这样耗去。炉中最后凝成的，是一枚${pill}。`};
    }
    const forged = title === '炼器开炉，灵宝成形' ? forging.exec(text) : null;
    if (forged) {
      const [,personAndPlace,cost,artifact] = forged;
      return {title:`${artifact}终成`,
        paragraph:`${personAndPlace}花去${cost}灵石。这一炉铸成的器物，名为「${artifact}」。`};
    }
    const trial = title === '天劫圆满' ? trialPassed.exec(text) : null;
    if (trial) {
      const [,actor,stage] = trial;
      return {title:`劫尽，${actor}入${stage}`,
        paragraph:`劫雷已渡，心魔也终于越了过去。两关过后，${actor}踏进${stage}境。`};
    }
    const minor = minorBreak.exec(text);
    if (minor && title === `${minor[2]}突破至${minor[3]}${minor[4]}层`) {
      const [,place,actor,stage,layer] = minor;
      return {title:`${actor}踏上${stage}${layer}层`,
        paragraph:`瓶颈终于松开了。就在${place}，${actor}冲过这一道关，修为进到了${stage}${layer}层。`};
    }
    const major = majorBreak.exec(text);
    if (major && title === `天地异象：${major[2]}晋升${major[3]}期！`) {
      const [,place,actor,stage] = major;
      return {title:`${actor}渡劫入${stage}`,
        paragraph:`天劫过了。在${place}，${actor}由此踏入${stage}期；随这一破境暴涨的，还有寿元与战力。`};
    }
  }
  if (fact.category === 'heavenly') {
    if (title === '兽潮实损，炉事暂止' && text === '兽潮损伤实有丹炉，本炉停用；装炉品阶与已有凭据不改。') {
      return {title:'兽潮之后，炉火暂歇',
        paragraph:'兽潮伤了原有的丹炉，炉火只得暂歇。旧炉的品阶没有跌，过去已经结清的炉事也还在账上；眼下，这座炉子确实不能再开。'};
    }
    const trial = title === '天劫降临' ? trialStarts.exec(text) : null;
    if (trial) {
      const [,actor,stage,waves] = trial;
      return {title:`${actor}引动${stage}天劫`,
        paragraph:`${actor}引动了${stage}天劫。这一关尚未闯过，前头还有${waves}重劫雷，以及一道心魔关。`};
    }
    const fail = backlash.exec(text);
    if (fail && title === `${fail[1]}破境遭天劫反噬`) {
      const [,actor] = fail;
      return {title:`${actor}没能闯过天劫`,
        paragraph:`${actor}强行冲关，却没能越过那重境界。雷劫反噬之下，${actor}吐血重伤，气息随即萎靡下去。`};
    }
  }
  if (fact.category === 'combat') {
    const rows = escaped.exec(text);
    if (rows) {
      const [,attacker,place,defender,winner,loser,hp] = rows;
      if (title === `惊天斗法：${attacker}激战${defender}` && sameDuelPair(attacker,defender,winner,loser)) {
        return {title:`${loser}负伤遁走`,
          paragraph:`在${place}，${attacker}悍然向${defender}出手。一番激斗下来，${winner}占了上风。失去${hp}点气血的${loser}随即化作血光遁走。`};
      }
    }
  }
  if (fact.category === 'death') {
    const pass = peaceful.exec(text);
    if (pass && title === `寿元耗尽：${pass[1]}坐化陨落`) {
      const [,actor] = pass;
      return {title:`${actor}在洞府坐化`,paragraph:`下一重境界始终未能踏入，大限却先一步到了。${actor}最终在洞府中安然坐化。`};
    }
    const rows = lethal.exec(text);
    if (rows) {
      const [,place,attacker,defender,winner,loser,stones,treasures,fragments] = rows;
      if (title === `陨落：${winner}斩杀${loser}！` && sameDuelPair(attacker,defender,winner,loser)) {
        return {title:`${loser}陨于${place}`,
          paragraph:`剑气纵横，${place}成了${attacker}与${defender}决生死的地方。斗到末了，${winner}将${loser}当场斩杀，收缴其储物戒。戒中有${stones}灵石、${treasures}件法宝。${fragments ? `另有${fragments}枚古器碎片随战利品转移。` : ''}`};
      }
    }
  }
  if (fact.category === 'diplomacy') {
    const exchange = sharing.exec(text);
    if (exchange && exchange[1] !== exchange[2] && title === `${exchange[1]}与${exchange[2]}坐而论道`) {
      const [,first,second,place,close] = exchange;
      return {title:`${place}论道`,
        paragraph:`${first}与${second}在${place}坐而论道，说的是天地法则。${close === '相谈甚欢。' ?
          '这一番论道，两人相谈甚欢。' : `论道中有这么一句：${close.slice('言道：'.length)}`}`};
    }
    if (title === '宗门集结攻山') {
      const launch = siegeStarts.exec(text);
      if (launch) {
        const [,attacker,cost,force,defender] = launch;
        return {title:`${attacker}出征${defender}`,
          paragraph:`${attacker}拨出${cost}灵石，集结了${force}名修士。队伍就此出发，所向正是${defender}。`};
      }
    }
    if (title === '两宗签署停战撤军议约') {
      const terms = truce.exec(text);
      if (terms) {
        const [,aid,withdrawals] = terms;
        return {title:'两宗暂止干戈',
          paragraph:`停战的约已经签下。双方将实际保证金与${aid}灵石重建款一并托管；${Number(withdrawals) > 0 ?
            `${withdrawals}支参战队伍有序撤回，敌对行动暂停了。` : '这一回没有撤回参战队伍，敌对行动仍按约暂停。'}`};
      }
    }
    if (title === '商队货损退款') {
      const lost = totalLoss.exec(text);
      if (lost) {
        const [,goods,refund] = lost;
        return {title:'货失途中，灵石退回',
          paragraph:`这桩交易没等到交货。商队途经灾区，遗失了${goods}份货；买方收到退回的${refund}灵石。货没送到，原定的交割也就没有发生。`};
      }
      const late = undelivered.exec(text);
      if (late) {
        const [,goods,refund] = late;
        return {title:'商队未能交货',
          paragraph:`行经灾区后，原批${goods}份货没有交付。买方等来的不是货，而是退回的${refund}灵石。`};
      }
    }
    if (title === '商队到货结算') {
      const closing = arrival.exec(text);
      if (closing) {
        const [,goods,paid] = closing;
        return {title:'货到，账清',paragraph:`这趟商队运来的${goods}份货到了买方手中。另一边，卖方也收到了这笔货款：${paid}灵石。到此，交易才算结清。`};
      }
    }
    if (title === '跨坊商队启程') {
      const departing = departure.exec(text);
      if (departing) {
        const [,goods,good,origin,destination,eta] = departing;
        return {title:`往${destination}去的商队`,
          paragraph:`${goods}份${good}从${origin}启运，目的地是${destination}，预计还要走${eta}回合。货已经上路，货款却还未交割，须待到货再结。`};
      }
    }
  }
  return {title:title || '山河一页',paragraph:text || title};
}
