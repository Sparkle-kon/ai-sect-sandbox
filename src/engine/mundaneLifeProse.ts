import type { ChronicleAnchor } from '../types/world';
import { ALCHEMY_RECIPES } from './alchemyCatalog';

// This optional editorial layer recognizes original public lower-world locations only.
// A new/dynamic site keeps its existing public source paragraph rather than gaining invented geography.
const LANDMARKS: Readonly<Record<string, string>> = Object.freeze({
  'loc-taixu': '太虚剑峰',
  'loc-danxia': '丹霞灵谷',
  'loc-tianji': '摘星天机台',
  'loc-market': '万仙坊市',
  'loc-market-east': '松灯坊市',
  'loc-vein-north': '极北寒玉脉',
});
const name = String.raw`([\p{L}\p{N}·]{1,32})`;
const place = String.raw`([\p{L}\p{N}·]{1,40})`;
const herbs = '翡翠灵叶|玄土根|星露花|幽影苔';
const pills = '筑基丹|九转金丹|破障丹|噬心毒丹';
const gather = new RegExp(String.raw`^${name}在${place}采得([12])株(${herbs})，灵草存量随之减少。$`,'u');
const brew = new RegExp(String.raw`^${name}借([1-3])阶丹炉耗费([1-9]\d{0,2})灵石与药材炼制【(${pills})】，(凝成一枚灵丹。|炉火失控，药材与灵石尽耗，未能成丹。)$`,'u');
const explore = new RegExp(String.raw`^${name}御剑抵达【${place}】，在古迹残垣间寻得 (\d{2,3}) 枚上品灵石。$`,'u');
const discuss = new RegExp(String.raw`^${name}与${name}于【${place}】畅谈天地法则(?:[。，]言道：“[^\r\n“”]{1,160}”|，相谈甚欢。)$`,'u');
const birth = new RegExp(String.raw`^${place}今年新生([1-3])人，纳入未成年坊籍，成年前不计入招募人选。$`,'u');
const fill = new RegExp(String.raw`^([1-9]\d?)份(${herbs}|${pills})成交，每份([1-9]\d{0,2})灵石，货款当场交割。$`,'u');
const bareId = /^[a-z][a-z0-9_-]{0,119}$/u;
const market = new Set(['loc-market', 'loc-market-east']);

const smallCount=(value:string)=>value==='1'?'一':value==='2'?'两':value==='3'?'三':value;
const seasonMarker = (month: number) => ['春月','夏月','秋月','冬月'][Math.floor((month-1)/3)];

/** Retained public source text stays the proof. This does not consult current weather, actions, or private positions. */
export function writeMundaneLifeProse(anchor: ChronicleAnchor): string | undefined {
  const { id, tick, year, month, category, locationId, actorIds, title, description } = anchor;
  if (!Number.isSafeInteger(tick) || tick < 1 || !Number.isSafeInteger(year) || year < 1 ||
      !Number.isSafeInteger(month) || month < 1 || month > 12 || !locationId ||
      !Object.hasOwn(LANDMARKS,locationId) || ('witnessScope' in anchor && anchor.witnessScope !== undefined) ||
      actorIds.length > 2 || actorIds.some(actor => !bareId.test(actor)) ||
      new Set(actorIds).size !== actorIds.length) return undefined;
  const site = LANDMARKS[locationId];
  const monthSeason = seasonMarker(month);
  const [actor] = actorIds;
  const eventPrefix = `evt-${tick}-${actor}-`;

  if (category === 'breakthrough' && actorIds.length === 1) {
    if (id === `${eventPrefix}alchemy`) {
      const plants = gather.exec(description);
      if (plants && title === `${plants[1]}采集灵草` && plants[2] === site) {
        const [,person,,amount,plant] = plants;
        return site === '极北寒玉脉'
          ? `这一月，这一月，${person}在寒玉脉采得${smallCount(amount)}株${plant}。`
          : `${person}在${site}采得${smallCount(amount)}株${plant}。`;
      }
      const firing = brew.exec(description);
      if (firing) {
        const [,person,gradeText,stones,pill,result] = firing;
        const grade = Number(gradeText);
        const recipe = Object.values(ALCHEMY_RECIPES).find(entry => entry.name === pill);
        if (!recipe || grade < recipe.furnaceGrade ||
            Number(stones) !== Math.ceil(recipe.spiritStones * (1 - (grade - recipe.furnaceGrade) * 0.15))) return undefined;
        const location = site === '丹霞灵谷' ? '丹霞谷中' : `${site}中`;
        if (title === `${person}炼丹成丹` && result === '凝成一枚灵丹。')
          return `${location}，${person}借${grade}阶炉炼${pill}，用去药材与${stones}灵石。开炉时，里头凝成一枚。`;
        if (title === `${person}炼丹失手` && result === '炉火失控，药材与灵石尽耗，未能成丹。')
          return `${location}，${person}借${grade}阶炉炼${pill}，炉火却失了控。药材与${stones}灵石都耗去了，炉中没有成丹。`;
      }
    }
    if (id === `${eventPrefix}explore`) {
      const travel = explore.exec(description);
      if (travel && title === `${travel[1]}游历${site}获机缘` && travel[2] === site &&
          Number(travel[3]) >= 40 && Number(travel[3]) <= 160)
        return `${monthSeason}里，${travel[1]}御剑到了${site}，在古迹残垣间寻得${travel[3]}枚上品灵石。`;
    }
  }

  if (category !== 'diplomacy') return undefined;
  if (actorIds.length === 0 && title === '凡村人口添丁' && month === 1 &&
      id === `evt-settlement-${tick}-growth-village-${locationId}-births`) {
    const born = birth.exec(description);
    if (born && born[1] === `${site}外村`)
      return `开春，${born[1]}添了${smallCount(born[2])}个孩子。`;
  }
  if (actorIds.length === 2 && title === '坊市当场结算' && market.has(locationId) &&
      id.startsWith(`evt-${tick}-market-fill-`) && /^[1-9]\d{0,12}$/u.test(id.slice(`evt-${tick}-market-fill-`.length))) {
    const trade = fill.exec(description);
    if (trade && Number(trade[1]) <= 12 && Number(trade[3]) <= 500)
      return `${site}做成一桩买卖。${trade[1]}份${trade[2]}，每份${trade[3]}灵石，货与灵石就在坊里交割了。`;
  }
  if (actorIds.length === 2 && id === `${eventPrefix}social`) {
    const conversation = discuss.exec(description);
    if (conversation && conversation[3] === site && title === `${conversation[1]}与${conversation[2]}坐而论道`)
      return `${conversation[1]}与${conversation[2]}在${site}坐下，说了一番天地法则。`;
  }
  return undefined;
}
