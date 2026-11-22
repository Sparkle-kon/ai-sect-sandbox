import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DestinyTraitCard,EarnedDestinyTraits} from '../src/components/DestinyTraitCard';
import {createInitialWorld} from '../src/data/initialWorld';
import type {DestinyTraitAwakening,DestinyTraitOffer} from '../src/types/destinyTrait';

const sample=(actorId='private-actor'):DestinyTraitOffer=>({id:'private-awakening',actorId,fromRealm:'筑基',realm:'金丹',openedTick:4,
  sourceEventId:'private-old-event',options:['clear-sword-heart','unfading-blood-sea','heaven-favored']});

describe('guided destiny awakening, single focused stage',()=>{
  it('uses three named real effect choices and no globally available action',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<DestinyTraitCard actorName="岑闻溪" offer={sample()} busy={false} onChoose={onChoose}/>);
    for(const text of ['命格初显','已踏入金丹','剑心通明','血海不枯','天道眷顾','气血不足半数时','平日修行更顺'])
      expect(html).toContain(text);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.match(/min-h-12/g)).toHaveLength(3);
    expect(html).not.toContain('收起这一幕');
    expect(html).not.toContain('private-');
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('disables the exact choices while work is busy and only closes an earned result',()=>{
    const onChoose=vi.fn(),onContinue=vi.fn();
    const busy=renderToStaticMarkup(<DestinyTraitCard actorName="岑闻溪" offer={sample()} busy onChoose={onChoose}/>);
    expect(busy.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    expect(busy).toContain('尚在落定');
    const earned:DestinyTraitAwakening={...sample(),traitId:'unfading-blood-sea',chosenTick:4};
    const finished=renderToStaticMarkup(<DestinyTraitCard actorName="岑闻溪" awakening={earned} busy={false} onContinue={onContinue}/>);
    expect(finished).toContain('这一念已入命格');
    expect(finished).toContain('血海不枯');
    expect(finished).not.toContain('天道眷顾');
    expect(finished).not.toContain('private-');
    expect(finished.match(/<button/g)).toHaveLength(1);
    expect(finished).toContain('收起这一幕');
    expect(onContinue).not.toHaveBeenCalled();
  });
  it('shows only exact actor earned badges in existing dossier and never pending, detached or future rows',()=>{
    const world=createInitialWorld(37),actor=world.cultivators[0];
    world.tick=5;
    const offer=sample(actor.id);
    actor.destinyTraits={earned:[
      {...offer,traitId:'clear-sword-heart',chosenTick:4},
      {...offer,id:'future',openedTick:6,traitId:'heaven-favored',chosenTick:6},
    ],pending:offer};
    const html=renderToStaticMarkup(<EarnedDestinyTraits world={world} actor={actor}/>);
    expect(html).toContain('已觉醒命格');
    expect(html).toContain('剑心通明');
    expect(html).not.toContain('天道眷顾');
    expect(html).not.toContain('血海不枯');
    expect(html).not.toContain('private-');
    expect(renderToStaticMarkup(<EarnedDestinyTraits world={world} actor={{...actor}}/>)).toBe('');
  });
});
