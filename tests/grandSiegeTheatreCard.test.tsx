import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {GrandSiegeTheatreCard,type GrandSiegeRead} from '../src/components/GrandSiegeTheatreCard';
import {GrandSiegeMapScene} from '../src/components/GrandSiegeMapScene';
import {createInitialWorld} from '../src/data/initialWorld';

const world=createInitialWorld(54);
const [a,b,c]=world.cultivators;
const scope:GrandSiegeRead={siegeId:'private-siege',siteId:'private-site',attackerName:'青云宗',defenderName:'照夜宗',
  status:'sieging',arrivedTick:7,options:[]};
const round:NonNullable<GrandSiegeRead['round']>={round:1,tick:8,sourceEventId:'private-event',wallBefore:168,wallAfter:112,wallMax:200,
  attackers:[{actorId:a.id,sectId:a.sectId,rank:'太上长老'}],defenders:[{actorId:b.id,sectId:b.sectId,rank:'掌门'},{actorId:c.id,sectId:c.sectId,rank:'真传弟子'}],
  clash:{attackerId:a.id,defenderId:b.id,winnerId:b.id,attackerDamage:23,defenderDamage:11},
  hero:{actorId:b.id,move:'leader-last-stand',origin:'player',rank:'掌门',paidQi:18,paidHp:12,wallSaved:22}};
const options:GrandSiegeRead['options']=['leader-last-stand','hold'].map((move)=>({
  action:'GRAND_SIEGE_HERO',targetGrandSiegeId:scope.siegeId,grandSiegeHeroMove:move==='hold'?'hold':'leader-last-stand',
}));
function read(view:GrandSiegeRead,live=false){
  const onChoose=vi.fn(()=>true),onAdvance=vi.fn(()=>true);
  const html=renderToStaticMarkup(<GrandSiegeTheatreCard world={world} view={view} siteName="照泠山门"
    controls={live?{busy:false,onChoose,onAdvance}:undefined}/>);
  expect(onChoose).not.toHaveBeenCalled();
  expect(onAdvance).not.toHaveBeenCalled();
  expect(html).not.toContain('private-');
  return html;
}

describe('named verified battle theatre',()=>{
  it('records real array change, named roster, first clash damage and distinct actual heroic payment',()=>{
    const html=read({...scope,round});
    for(const text of ['山门阵前','照泠山门','168 → 112','太上长老','真传弟子','头一场交锋',a.name,b.name,
      '23 点气血','11 点气血','实付 18 点灵气、12 点气血','挡下 22 点阵损'])expect(html).toContain(text);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('身陨');
  });
  it('keeps read-only observers and actual arrival distinct from a fight or hero options',()=>{
    const html=read({...scope,options});
    expect(html).toContain('两边还未真正交手');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('头一场交锋');
    expect(html).not.toContain('掌门亲守阵眼');
    expect(renderToStaticMarkup(<GrandSiegeMapScene world={world} viewer={a} fog visible/>)).toBe('');
  });
  it('shows only exact eligible options, optional no-cost hold, then just one deliberate native month',()=>{
    const html=read({...scope,options},true);
    expect(html).toContain('掌门亲守阵眼');
    expect(html).toContain('若真能入阵，下月才付 18 点灵气、12 点气血');
    expect(html).toContain('不另出手');
    expect(html).not.toContain('太上长老援阵');
    expect(html).not.toContain('实付');
    expect(html.match(/min-h-12/g)).toHaveLength(2);
    const queued=read({...scope,options,queued:{actorId:b.id,move:'hold',queuedTick:7}},true);
    expect(queued).toContain('尚未出手，也未扣代价');
    expect(queued).toContain('推进一月，继续守阵');
    expect(queued.match(/<button/g)).toHaveLength(1);
  });
  it('distinguishes a fought victory from withdrawal before combat and refuses to imply conquest',()=>{
    const victory=read({...scope,round,status:'victory',terminal:{status:'victory',tick:8,sourceEventId:'private-won',battlefield:true}});
    expect(victory).toContain('胜的是攻坚，不是占领山门');
    expect(victory).not.toContain('易主');
    const withdrawal=read({...scope,status:'withdrawn',terminal:{status:'withdrawn',tick:8,sourceEventId:'private-peace',battlefield:false}});
    expect(withdrawal).toContain('此役未曾真正交手');
    expect(withdrawal).not.toContain('阵损');
    expect(withdrawal).not.toContain('胜的是攻坚');
  });
});
