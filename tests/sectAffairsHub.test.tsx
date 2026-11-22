import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import {SectAffairsHub} from '../src/components/hubs/SectAffairsHub';

const noop=()=>undefined;
function Fixture({section,focus,historical=false}:{section:string;focus?:{name:string;alignment:string};historical?:boolean}){
  const simulation=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,
    onPreviewContextChange:noop,onHistoricalPreview:noop,onActivate:noop});
  const current=historical?{...simulation,preview:{tick:simulation.world.tick,world:simulation.world}}:simulation;
  return <SectAffairsHub simulation={current} active selectedCultivator={simulation.world.cultivators[0]}
    focusSect={focus} rememberedOpen={section} onSelectCultivator={noop} onCouncil={noop}/>;
}
const render=(section:string,options?:{focus?:{name:string;alignment:string};historical?:boolean})=>
  renderToStaticMarkup(<Fixture section={section} {...options}/>);

describe('sect affairs hub',()=>{
  it('preserves the legacy research selection and makes the existing furnace and workshop directly reachable',()=>{
    const html=render('research');
    expect(html).toContain('aria-label="宗门事务"');
    expect(html).toMatch(/aria-expanded="true"[^>]*>论道会与共研创法/);
    expect(html).toContain('载入论道记录…');
    expect(html).toContain('载入阵炉与工坊…');
    expect(html).not.toContain('打开长老议事厅');
  });

  it('preserves the live council entry and does not show it in retained historical reading',()=>{
    const live=render('council');
    const historical=render('council',{historical:true});
    expect(live).toContain('打开长老议事厅');
    expect(historical).not.toContain('打开长老议事厅');
    expect(historical).toMatch(/aria-expanded="true"[^>]*>宗门地位、库账与外交/);
  });

  it('when following a public chronicle sect, renders only that summary instead of private actor panels or old selections',()=>{
    const html=render('research',{focus:{name:'映雪宗',alignment:'中立'}});
    expect(html).toContain('aria-label="纪事所指宗门"');
    expect(html).toContain('映雪宗');
    expect(html).toContain('公开立场：中立');
    expect(html).not.toContain('打开长老议事厅');
    expect(html).not.toContain('载入阵炉与工坊');
    expect(html).not.toContain('载入修士档案');
  });
});
