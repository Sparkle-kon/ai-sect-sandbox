import type {AvatarOrder,WorldState} from '../types/world';
import {projectProtagonistSuccession} from '../engine/protagonistSuccession';
import {activeAvatar,availableAvatarHosts,AVATAR_ORDER_COST,AVATAR_POSSESSION_COST,canQueueAvatarSalvage,
  possessAvatar,queueAvatarOrder} from '../engine/avatarEngine';

export type StoryPlayerRole =
  | {kind:'ensemble'}
  | {kind:'observer';name:string;canEnter:boolean;unavailable?:string}
  | {kind:'playing';name:string;isLead:boolean;queued?:AvatarOrder|'other';canOrder:boolean;unavailable?:string};

type EarnedLead={id:string;name:string};

function mayEnter(world:WorldState,actorId:string):boolean {
  const state=world.playerAvatar;
  return Boolean(state&&!state.possessedId&&!state.pendingOrder&&
    state.essence>=AVATAR_POSSESSION_COST+AVATAR_ORDER_COST&&
    availableAvatarHosts(world).some(({id})=>id===actorId));
}

export function projectStoryPlayerRole(world:WorldState,lead?:EarnedLead):StoryPlayerRole {
  const avatar=activeAvatar(world),state=world.playerAvatar;
  if(avatar){
    const order=state.pendingOrder?.actorId===avatar.id?state.pendingOrder.action:undefined;
    const queued=order==='REST'||order==='CULTIVATE'?order:order?'other':undefined;
    const canOrder=canQueueAvatarSalvage(world,avatar.id);
    return {kind:'playing',name:avatar.name,isLead:avatar.id===lead?.id,canOrder,
      ...(queued?{queued}:{}),...(!canOrder&&!queued?{unavailable:state.essence<AVATAR_ORDER_COST?'神识不足，暂时不能下令。':'这次入世将结束，赶不上安排下个月。'}:{})};
  }
  if(!lead)return {kind:'ensemble'};
  const canEnter=mayEnter(world,lead.id);
  return {kind:'observer',name:lead.name,canEnter,...(!canEnter?{unavailable:
    state.essence<AVATAR_POSSESSION_COST+AVATAR_ORDER_COST?'神识不足，暂时只能看他的见闻。':
    '此刻无法入世，可以先看这位人物亲历的事。'}:{})};
}

/** Same world, same exact proven lead; use existing avatar costs and never advance here. */
export function enterStoryLead(world:WorldState,lead:EarnedLead):WorldState {
  const active=projectProtagonistSuccession(world,world.tick).active;
  if(active?.actorId!==lead.id||world.cultivators.filter(actor=>actor.id===lead.id&&actor.alive&&actor.hp>0).length!==1||
      !mayEnter(world,lead.id))return world;
  const next=structuredClone(world);
  return possessAvatar(next,lead.id)?next:world;
}

export function orderStoryAvatar(world:WorldState,action:AvatarOrder):WorldState {
  const avatar=activeAvatar(world);
  if(!avatar||!canQueueAvatarSalvage(world,avatar.id))return world;
  const next=structuredClone(world);
  return queueAvatarOrder(next,action)?next:world;
}

/** Only a trace from the exact submitted next turn can describe the order as applied. */
export function storyOrderOutcome(before:WorldState,after:WorldState):string|undefined {
  const order=before.playerAvatar.pendingOrder;
  if(after.tick!==before.tick+1||!order||order.queuedTick!==before.tick||
    (order.action!=='REST'&&order.action!=='CULTIVATE'))return undefined;
  const actor=activeAvatar(before);
  if(!actor||actor.id!==order.actorId)return undefined;
  const traces=after.decisionTrace.records.filter(trace=>trace.id===`decision-${after.tick}-${actor.id}`&&
    trace.actorId===actor.id&&trace.tick===after.tick);
  const verb=order.action==='REST'?'调息':'修炼';
  return traces.length===1&&traces[0].source==='avatar'&&traces[0].applied&&traces[0].chosenAction===order.action
    ? `这月，${actor.name}依你的安排${verb}了。`
    : `已到下个月，未能确认${actor.name}按安排${verb}。`;
}
