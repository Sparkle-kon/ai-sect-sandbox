import type {WorldEvent,WorldState} from '../types/world';
import {writePublicChronicleScene} from '../engine/chroniclePublicProse';

export function splitAuthoredEraChronicle(world:WorldState,visible:readonly WorldEvent[]){
  const source=world.authoredEraOrigin;
  if(!source)return undefined;
  const priorIds=new Set(source.openingEventIds);
  const prior:WorldEvent[]=[],later:WorldEvent[]=[];
  for(const event of visible){
    if(event.witnessScope==='participants'||event.tick>world.tick)continue;
    (event.tick<source.openedTick||event.tick===source.openedTick&&priorIds.has(event.id)?prior:later).push(event);
  }
  return {source,prior,later};
}

export function AuthoredEraChronicle({world,visible}:{world:WorldState;visible:readonly WorldEvent[]}){
  const reading=splitAuthoredEraChronicle(world,visible);
  if(!reading)return null;
  const {source,prior,later}=reading;
  const name=(siteId:string)=>world.locations.find(site=>site.id===siteId)?.name??'原址未详';
  const sample=(rows:WorldEvent[])=>rows.length?writePublicChronicleScene(rows.reduce((a,b)=>b.tick>a.tick?b:a)).title:undefined;
  const first=sample(prior),latest=sample(later);
  return <details className="min-w-0 space-y-1.5 rounded border border-teal-500/30 bg-slate-950/60 p-2 text-xs text-slate-300">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-teal-100">作者纪元的三类纪事</summary>
    <p>开局：仙历 {source.year} 年 {source.month} 月。</p>
    <section aria-label="作者设定开局生效">
      <h4 className="font-semibold text-teal-100">作者设定 · 开局生效</h4>
      <ul className="list-inside list-disc space-y-0.5">
        {source.effects.map((effect,i)=><li key={i} className="break-words">{
          effect.kind==='jade_vein_depleted'?`${name(effect.siteId)}余灵气 ${effect.after.spiritQi}，灵叶承载 ${effect.after.jadeCapacity}`:
          effect.kind==='danxia_branch_moves_north'?`丹霞一支以${name(effect.destinationId)}为开局所在地，${effect.memberIds.length} 人及独立实账 ${effect.branchStones} 灵石`:
          `${name(effect.siteId)}的村落承载设为 ${effect.capacityAfter}，不改原有居民`
        }。</li>)}
      </ul>
    </section>
    <section aria-label="开局之前已有实录">
      <h4 className="font-semibold text-teal-100">已有实录 · 设定前已经演算</h4>
      <p>{first?`仍有 ${prior.length} 条可读旧事，包括「${first}」。`:'当前没有保留下来且可展示的旧事。'}</p>
    </section>
    <section aria-label="此后实际发生">
      <h4 className="font-semibold text-teal-100">此后发生 · 本分支的实际新事</h4>
      <p>{latest?`现有 ${later.length} 条可读新事，包括「${latest}」。`:'还没有可读的新事。作者设定不会被补写成一条纪事。'}</p>
    </section>
  </details>;
}
