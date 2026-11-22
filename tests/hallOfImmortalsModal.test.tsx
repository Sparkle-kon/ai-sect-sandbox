import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {BiographyScroll,HallOfImmortalsModal,HallOfImmortalsRead} from '../src/components/HallOfImmortalsModal';
import {createInitialWorld} from '../src/data/initialWorld';

describe('Hall of Immortals surfaces',()=>{
  it('keeps closed dialog out of DOM, and labels an older public scope clearly',()=>{
    const props={world:createInitialWorld(),onClose:vi.fn(),scopeKey:'private-scope',
      currentVisibleSiteIds:new Set<string>(),currentVisibleActorIds:new Set<string>()};
    expect(renderToStaticMarkup(<HallOfImmortalsModal {...props} open={false}/>)).toBe('');
    const open=renderToStaticMarkup(<HallOfImmortalsModal {...props} open historical/>);
    expect(open).toContain('<dialog');
    expect(open).toContain('所读旧卷');
    expect(open).toContain('封神榜卷类别');
    expect(open).toContain('合上封神榜与列传');
    expect(open).not.toContain('private-scope');
    expect(open).toContain('此栏暂无线索可入榜');
  });

  it('presents verified ranking entries without their internal identities',()=>{
    const html=renderToStaticMarkup(<HallOfImmortalsRead view={{rankings:{power:[{
      actorId:'internal-actor-id',name:'云袖',title:'山客',realm:'筑基',score:18,
    }],karma:[],alchemy:[]},memorials:[],ascended:[]}}/>);
    expect(html).toContain('云袖');
    expect(html).toContain('山客');
    expect(html).toContain('18');
    expect(html).not.toContain('internal-actor-id');
  });

  it('renders a scene-led illustrated scroll without manufacturing missing milestones',()=>{
    const html=renderToStaticMarkup(<BiographyScroll row={{actorId:'hidden-person',name:'青萝',
      title:'散修',realm:'练气',deathTick:15,scenes:[{kind:'ending',tick:15,year:2,month:3,
        title:'剑影止处',text:'青萝行至山口，此后剑声绝。'}]}} ending="陨落" onReturn={vi.fn()}/>);
    expect(html).toContain('青萝传');
    expect(html).toContain('剑影止处');
    expect(html).toContain('青萝行至山口');
    expect(html).toContain('2年3月');
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).not.toContain('hidden-person');
    expect(html).not.toContain('飞升');
  });
});
