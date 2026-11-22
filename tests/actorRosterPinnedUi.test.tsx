import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {ActorRoster} from '../src/components/ActorRoster';
import {createActorRosterIndex,pageActorRoster,partitionActorRosterPage,selectActorRoster} from '../src/components/actorRosterIndex';
import {createInitialWorld} from '../src/data/initialWorld';

it('keeps one lead and one selected row without treating either as an extra matching person',()=>{
  const world=createInitialWorld(284),focal=world.cultivators.at(-1)!,selected=world.cultivators[0];
  const index=createActorRosterIndex(world);
  expect(createActorRosterIndex(world)).toBe(index);
  const only=selectActorRoster(index,selected.name,'all');
  const page=pageActorRoster(only,0);
  const partition=partitionActorRosterPage(index,page.actors,selected,focal.id);
  expect(page.total).toBe(1);
  expect(partition.rows).toHaveLength(0);
  expect(partition.pinned).toEqual([{actor:focal,focal:true,selected:false},{actor:selected,focal:false,selected:true}]);
  const markup=renderToStaticMarkup(<ActorRoster world={world} selected={selected} focalId={focal.id} scopeKey="private-branch"
    onSelect={vi.fn()} scene={{actorId:selected.id,eventId:'private-id',title:'雨后坊市'}} onReadScene={vi.fn()}/>);
  expect(markup.match(new RegExp(selected.name,'g'))).toHaveLength(1);
  expect(markup.match(new RegExp(focal.name,'g'))).toHaveLength(1);
  expect(markup).toContain('名册中的主角与已选人物');
  expect(markup).toContain('读此人的这一幕');
  expect(markup).not.toMatch(/读主角的这一幕|private-(?:id|branch)/);
});
it('renders a proven focal scene if requested and refuses branch-stale selected objects and ambiguous stable identities',()=>{
  const old=createInitialWorld(41),world=structuredClone(old);
  const actor=world.cultivators[0],other=world.cultivators[2];
  const base={world,focalId:actor.id,onSelect:vi.fn(),onReadScene:vi.fn()};
  const html=renderToStaticMarkup(<ActorRoster {...base} selected={old.cultivators[0]}
    scene={{actorId:actor.id,eventId:'private-e',title:'旧卷见闻'}}/>);
  expect(html).toContain('读主角的这一幕');
  expect(html).not.toContain('>已选人物</span>');
  const mismatch=renderToStaticMarkup(<ActorRoster {...base} selected={old.cultivators[2]}
    scene={{actorId:other.id,eventId:'private-e',title:'旧卷见闻'}}/>);
  expect(mismatch).not.toContain('旧卷见闻');
  const ambiguous=structuredClone(world);
  ambiguous.cultivators[1].id=actor.id;
  expect(createActorRosterIndex(ambiguous).byId.get(actor.id)).toBeUndefined();
  expect(renderToStaticMarkup(<ActorRoster {...base} world={ambiguous}
    scene={{actorId:actor.id,eventId:'private-e',title:'旧卷见闻'}}/>)).not.toContain('旧卷见闻');
});
it('labels same names with physical records and keeps search, pagination and scene controls hit-sized',()=>{
  const world=createInitialWorld(173),first=world.cultivators[0],second=world.cultivators[1];
  first.name=second.name='顾行舟';
  first.age=35;second.age=82;
  const markup=renderToStaticMarkup(<ActorRoster world={world} selected={second} focalId={first.id}
    onSelect={vi.fn()} scene={{actorId:second.id,eventId:'scene-b',title:'独证的坊市见闻'}} onReadScene={vi.fn()}/>);
  expect(markup).toContain('35 岁 · 同名 1');
  expect(markup).toContain('82 岁 · 同名 2');
  expect(markup.match(/顾行舟/g)).toHaveLength(2);
  expect(markup.match(/<button[^>]+>/g)?.every(tag=>tag.includes('min-h-11'))).toBe(true);
  expect(markup.indexOf('type="search"')).toBeLessThan(markup.indexOf('搜索与分页结果'));
  expect(markup.indexOf('搜索与分页结果')).toBeLessThan(markup.indexOf('名册分页'));
});
