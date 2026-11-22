import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProtagonistArchive, type ProtagonistSuccessionView } from '../src/components/ProtagonistArchive';

type Arc = ProtagonistSuccessionView['archived'][number];
type Handoff = NonNullable<Arc['handoff']>;
const old:Arc = { id:'old-opaque-arc',actorId:'old-opaque-body',name:'闻笛',openedTick:1,endedTick:14,
  predecessorArcId:undefined,closeReason:'public_death',compromised:false,evidence:[],
  death:{eventId:'old-opaque-death',category:'death',tick:14,attribution:'named_first',title:'闻笛陨于剑峰'} };
const ties:Handoff['ties'] = [
  {kind:'duel',eventId:'opaque-fight',tick:12,siteId:'opaque-site',title:'崖前对剑'},
  {kind:'encounter',eventId:'opaque-meet',tick:3,siteId:'opaque-site',title:'山门相逢'},
  {kind:'practice',eventId:'opaque-practice',tick:9,siteId:'opaque-site',title:'同演一式，说道：“不得公开的引语”'},
];
const next:Arc = {id:'new-opaque-arc',actorId:'new-opaque-body',name:'闻笛',openedTick:14,endedTick:undefined,
  predecessorArcId:old.id,closeReason:undefined,compromised:false,evidence:[],handoff:{exitKind:'public_death',ties}};
const show=(previous=old,active:Arc|undefined=next,others:Arc[]=[])=>renderToStaticMarkup(
  <ProtagonistArchive succession={{archived:[previous,...others],active}}/>);

describe('the quiet archive row for a witnessed handoff',()=>{
  it('keeps the real end and the distinct same-name successor, adding the three attested old scenes in order',()=>{
    const html=show();
    expect(html.match(/data-protagonist-handoff/g)).toHaveLength(1);
    expect(html).toContain('公开实录证实陨落，前卷收束');
    expect(html).toContain('陨落实录：〈闻笛陨于剑峰〉');
    expect(html).toContain('两人同名，并非同一人。');
    expect(html).toContain('相逢〈山门相逢〉');
    expect(html).toContain('共修〈同演一式。〉');
    expect(html).toContain('交锋〈崖前对剑〉');
    expect(html.indexOf('相逢〈')).toBeLessThan(html.indexOf('共修〈'));
    expect(html.indexOf('共修〈')).toBeLessThan(html.indexOf('交锋〈'));
    expect(html).not.toMatch(/opaque-|不得公开|<button\b/u);
  });

  it('does not infer a death or an immortal exit from absent, incomplete, conflicted, or mismatched evidence',()=>{
    const neutral:Arc={...old,closeReason:'receded',death:undefined};
    const scenarios=[
      show(neutral,{...next,handoff:undefined}),
      show(neutral,{...next,handoff:{exitKind:'ascension',ties:ties.slice(1)}}),
      show(neutral,{...next,handoff:{exitKind:'ascension',ties:[ties[0],ties[1],{...ties[2],eventId:ties[1].eventId}]}}),
      show(neutral,next),
      show(neutral,{...next,handoff:{exitKind:'ascension',ties}},[
        {...next,id:'other-successor',actorId:'other-actor',endedTick:19,handoff:undefined},
      ]),
    ];
    for(const html of scenarios){
      expect(html).toContain('前卷主线淡出');
      expect(html).not.toMatch(/飞升实录|陨落实录|data-protagonist-handoff/u);
    }
    expect(show(old,{...next,compromised:true})).not.toContain('两卷相接');
  });

  it('distinguishes a proved irreversible ascension from the quiet receded fallback',()=>{
    const html=show({...old,closeReason:'receded',death:undefined},{...next,handoff:{exitKind:'ascension',ties}});
    expect(html).toContain('飞升实录证实越过仙门，前卷收束。');
    expect(html).toContain('两卷相接');
    expect(html).not.toMatch(/陨落实录|确证陨落|前卷主线淡出/u);
  });
});
