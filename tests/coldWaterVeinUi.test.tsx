import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ColdWaterDisclosurePanel,ColdWaterVeinPanel,reviewedWaterOrder,type ColdWaterControls,type WaterVeinChoice} from '../src/components/ColdWaterVeinPanel';

const initial={};
const order:WaterVeinChoice={action:'WATER_VEIN',waterVeinMove:'open',targetLocationId:'loc-vein-north'};
const observe:WaterVeinChoice={action:'WATER_VEIN',waterVeinMove:'observe',targetLocationId:'loc-vein-north'};
const controls:ColdWaterControls={scopeKey:'true',revisionKey:initial,choices:[order,observe],onQueue:vi.fn(()=>true)};

describe('local northern water panel',()=>{
  it('adds nothing without scoped evidence and never offers a reported or dated view any current action',()=>{
    expect(renderToStaticMarkup(<ColdWaterDisclosurePanel disclosure={{}}/>)).toBe('');
    const remote=renderToStaticMarkup(<ColdWaterVeinPanel controls={controls} view={{
      scope:'rumor',siteName:'极北寒玉脉',year:1001,month:6,symptom:'well',
    }}/>);
    expect(remote).toContain('1001 年 6 月的旧闻');
    expect(remote).toContain('眼下水位和缘由未查明');
    expect(remote).not.toMatch(/试启天门|定水尺|实付|寸/);
    const own=renderToStaticMarkup(<ColdWaterVeinPanel controls={controls} view={{
      scope:'survey',siteName:'极北寒玉脉',year:1001,month:4,symptom:'field',wellDepth:9,wellBaseline:12,fieldDeficit:9,mineYield:2,
    }}/>);
    expect(own).toContain('本人旧测（不是当前实况）');
    expect(own).toContain('浅 3 寸');
    expect(own).not.toMatch(/试启天门|定水尺|实付/);
  });
  it('separates a physical symptom from the payer’s actual private receipt and a pending intent',()=>{
    const local={scope:'local',siteId:'loc-vein-north',siteName:'极北寒玉脉',year:1001,month:8,wellBaseline:12,wellDepth:9,mineYield:2,symptom:'well'} as const;
    const until=renderToStaticMarkup(<ColdWaterVeinPanel view={local} controls={controls}/>);
    expect(until).toContain('井水比常尺浅 3 寸');
    expect(until).toContain('因何下落还不能断');
    expect(until).not.toContain('实付');
    const result=renderToStaticMarkup(<ColdWaterVeinPanel view={{...local,ownOpening:{year:1001,month:7,paidStones:40,borrowedUnits:9,remainingUnits:9}}} controls={{...controls,pending:'open'}}/>);
    expect(result).toContain('实付 40 灵石');
    expect(result).toContain('灵压 9 份');
    expect(result).toContain('已候下月：试启天门。尚未落账。');
    expect(result).not.toContain('记作下月打算');
    expect(controls.onQueue).not.toHaveBeenCalled();
  });
  it('a new frame, missing choice, wrong location or ambiguous offer cannot retain old review',()=>{
    const staged={choice:order,revision:initial};
    expect(reviewedWaterOrder(staged,initial,controls.choices)).toBe(order);
    expect(reviewedWaterOrder(staged,{},controls.choices)).toBeUndefined();
    expect(reviewedWaterOrder(staged,initial,[observe])).toBeUndefined();
    expect(reviewedWaterOrder(staged,initial,[{...order,targetLocationId:'some-other-site'}])).toBeUndefined();
    expect(reviewedWaterOrder(staged,initial,[order,{...order}])).toBeUndefined();
  });
});
