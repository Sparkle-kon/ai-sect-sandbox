import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ChapterTurningPoints} from '../src/components/ChapterTurningPoints';
import type {SharedTurningPoint} from '../src/components/sharedTurningPointsModel';

const evidence=(key:string,tick:number,title:string,paragraph:string):SharedTurningPoint['people'][0]['earlier']=>({eventId:'private-'+key,tick,title,paragraph});
const view:SharedTurningPoint={
  eventId:'private-cross',tick:8,siteName:'松灯坊市',title:'芦叶过手，石账两清',
  paragraph:'顾行舟接过御寒芦，苏闻竹收了灵石。两人的旧路，在坊市这一处交到一起。',
  reunion:false,people:[
    {actorId:'private-buyer',arcId:'private-buyer-arc',name:'顾行舟',role:'buyer',settlement:'实收一份御寒芦；付八灵石。',
      earlier:evidence('buyer-prior',2,'雪前领药','雪谷领药。'),
      aftermath:evidence('buyer-after',9,'独去护泉','后来独去护泉。')},
    {actorId:'private-seller',arcId:'private-seller-arc',name:'苏闻竹',role:'seller',settlement:'交出一份御寒芦；实收八灵石。',
      earlier:evidence('seller-prior',3,'南泽收苇','南泽收苇。')},
  ]
};
it('inserts one ordinary turning-point fold with each person and missing evidence explicitly separate',()=>{
  const html=renderToStaticMarkup(<ChapterTurningPoints arcs={[]} shared={[view]}/>);
  expect(html.match(/>有据转折<\/summary>/g)).toHaveLength(1);
  expect(html).toContain('顾行舟 · 买方');
  expect(html).toContain('苏闻竹 · 卖方');
  expect(html).toContain('相逢处：松灯坊市');
  expect(html).not.toContain('再度相逢');
  expect(html).not.toContain('初次相逢');
  expect(html).not.toContain('private-');
  expect(html).not.toContain('<button');
  const [buyer,seller]=[...html.matchAll(/<li[^>]*class="min-w-0[^"]+">([\s\S]*?)<\/li>/g)].map(row=>row[1]);
  expect(buyer).toContain('后来独去护泉');
  expect(buyer).not.toContain('没有可接读');
  expect(seller).not.toContain('后来独去护泉');
  expect(seller).toContain('没有可接读');
  expect(html).toContain('先后并不能证明');
  expect(html).toContain('查两人各自的原卷');
});
it('labels a documented reunion without turning chronology into motive and gives a neutral empty state',()=>{
  const html=renderToStaticMarkup(<ChapterTurningPoints arcs={[]} shared={[{...view,reunion:true}]}/>);
  expect(html).toContain('两人再度相逢');
  expect(html.indexOf('芦叶过手')).toBeLessThan(html.indexOf('查两人各自的原卷'));
  expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
  expect(renderToStaticMarkup(<ChapterTurningPoints arcs={[]}/>)).toBe('');
});
