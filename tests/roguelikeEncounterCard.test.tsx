import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {encounterOutcomeText,RoguelikeEncounterCard} from '../src/components/RoguelikeEncounterCard';
import {ROGUELIKE_ENCOUNTER_KINDS,type RoguelikeEncounterRecord} from '../src/types/roguelikeEncounter';

const offered:RoguelikeEncounterRecord={id:'private-encounter',actorId:'private-actor',fromSiteId:'private-origin',
  siteId:'private-destination',openedTick:9,kind:'sword-cave',guided:true,status:'offered'};
const outcome={success:false,qiDelta:-3,hpDelta:-11,karmaDelta:0,lifespanDelta:-2,affinityDelta:0};
function card(encounter:RoguelikeEncounterRecord,busy=false,witnessName?:string){
  const onChoose=vi.fn(),onContinue=vi.fn();
  const html=renderToStaticMarkup(<RoguelikeEncounterCard encounter={encounter} actorName="闻笛" siteName="旧墟"
    witnessName={witnessName} busy={busy} onChoose={onChoose} onContinue={onContinue}/>);
  expect(onChoose).not.toHaveBeenCalled();
  expect(onContinue).not.toHaveBeenCalled();
  expect(html).not.toContain('private-');
  return html;
}

describe('one dramatic encounter, three distinct actions',()=>{
  it('presents three large deliberate options for every current encounter instead of generic controls or assumed results',()=>{
    for(const kind of ROGUELIKE_ENCOUNTER_KINDS.filter(kind=>kind!=='sect-gate')){
      const html=card({...offered,kind,choice:'bold',outcome},false,'岑闻溪');
      expect(html).toContain('半途奇遇');
      expect(html).toContain('旧墟 · 闻笛');
      expect(html.match(/<button/g)).toHaveLength(3);
      expect(html.match(/min-h-12/g)).toHaveLength(3);
      for(const text of ['稳妥','冒险','收手'])expect(html).toContain(text);
      expect(html).not.toContain('未能如愿');
      expect(html).not.toContain('收起这一幕');
      if(kind==='wounded-traveler')expect(html).toContain('岑闻溪');
    }
  });
  it('holds all three choices while an actual source is being settled',()=>{
    const html=card(offered,true);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    expect(html).toContain('这一幕尚在落定');
  });
  it('shows only actual signed outcome and no way to repeat the choice, including failed costs',()=>{
    const html=card({...offered,status:'resolved',resolvedTick:10,choice:'bold',outcome});
    expect(html).toContain('奇遇余音');
    expect(html).toContain('未能如愿');
    for(const line of ['耗去一些灵气','气血受创','折了些寿元'])expect(html).toContain(line);
    expect(html).not.toContain('添了几分气运');
    expect(html).not.toContain('这一幕尚在落定');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('收起这一幕');
  });
  it('does not confuse deliberate retreat with a failed attempt',()=>{
    const html=card({...offered,status:'resolved',resolvedTick:10,choice:'leave',
      outcome:{success:false,qiDelta:0,hpDelta:0,karmaDelta:0,lifespanDelta:0,affinityDelta:0}});
    expect(html).toContain('就此收手');
    expect(html).toContain('未留下新的得失');
    expect(html).not.toContain('未能如愿');
  });
  it('reads bounded settled actual relationships and distinguishes an expired encounter',()=>{
    const words=encounterOutcomeText({...outcome,success:true,qiDelta:0,hpDelta:0,lifespanDelta:0,affinityDelta:8},'岑闻溪');
    expect(words).toBe('与岑闻溪多了一份交情。');
    const expired=card({...offered,status:'expired'});
    expect(expired).toContain('没有新的结果可读');
    expect(expired).not.toContain('未能如愿');
    expect(expired.match(/<button/g)).toHaveLength(1);
  });
});
