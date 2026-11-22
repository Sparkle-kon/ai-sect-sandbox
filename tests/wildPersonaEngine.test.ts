import {describe,expect,it} from 'vitest';
import type {DestinyTraitAwakening,DestinyTraitOffer} from '../src/types/destinyTrait';
import type {PersonalityTrait} from '../src/types/world';
import {
  latestEarnedPersonaTrait,personaLine,personaOptions,privatePersonaText,type PersonaActor,type PersonaMoment,
} from '../src/engine/wildPersonaEngine';

const voices:readonly PersonalityTrait[]=['刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'];
const moments:readonly PersonaMoment[]=['thought','scheme','combat_open','combat_reply','farewell','trade_open','trade_reply',
  'dual_cultivation_open','dual_cultivation_reply','sect_diplomacy_open','sect_diplomacy_reply','social_open'];
const origin:DestinyTraitOffer={actorId:'exact-actor',id:'exact-offer',fromRealm:'筑基',realm:'金丹',openedTick:8,
  sourceEventId:'evt-8-source',options:['clear-sword-heart','night-wandering-soul','still-heart-mirror']};
const actor:PersonaActor={id:origin.actorId,personality:'狂傲'};
const earned:DestinyTraitAwakening={...origin,traitId:'clear-sword-heart',chosenTick:9};

describe('bounded wuxia persona language',()=>{
  it('offers three authored choices per moment and separates all eight personalities deterministically',()=>{
    for(const moment of moments){
      const choices=new Set<string>();
      for(const personality of voices){
        const subject={...actor,personality};
        const options=personaOptions(subject,moment);
        expect(options).toHaveLength(3);
        expect(new Set(options.map(option=>option.id)).size).toBe(3);
        const line=personaLine(subject,moment);
        expect(options.map(option=>option.text)).toContain(line);
        expect(personaLine(structuredClone(subject),moment)).toBe(line);
        expect(options.every(option=>option.text.length>=2&&option.text.length<=90)).toBe(true);
        choices.add(line);
      }
      expect(choices.size).toBe(voices.length);
    }
  });
  it('uses the latest exact earned person motif only, not pending, sibling, or impossible stamps',()=>{
    const pending:PersonaActor={...actor,destinyTraits:{earned:[],pending:origin}};
    expect(personaLine(pending,'combat_open')).toBe(personaLine(actor,'combat_open'));
    const live:PersonaActor={...actor,destinyTraits:{earned:[
      earned,
      {...earned,id:'later',traitId:'night-wandering-soul',chosenTick:10},
      {...earned,id:'invalid',traitId:'still-heart-mirror',actorId:'same-name-sibling',chosenTick:19},
      {...earned,id:'invalid-date',traitId:'still-heart-mirror',openedTick:21,chosenTick:20},
    ]}};
    expect(latestEarnedPersonaTrait(live)).toBe('night-wandering-soul');
    for(const moment of moments){
      expect(personaLine(live,moment)).toBe('长夜也有微光可循。'+personaLine(actor,moment));
      expect(personaLine(live,moment).length).toBeLessThanOrEqual(90);
    }
  });
  it('permits bounded private prose without markup, spoofed links or control sequences',()=>{
    const exact='青灯落尽，我尚留一息不肯散。';
    expect(privatePersonaText('  '+exact+'  ')).toBe(exact);
    expect(privatePersonaText('剑'.repeat(160))).toBe('剑'.repeat(160));
    expect(privatePersonaText('剑'.repeat(161))).toBeUndefined();
    for(const malformed of [null,7,'剑','青灯\u202e剑','某某\n新句','＜script＞','https：／／bad.host','某处 www.bad.test',
      'bad-source.xyz/trail','10.3.0.8','[传音](原处)'])expect(privatePersonaText(malformed)).toBeUndefined();
  });
});
