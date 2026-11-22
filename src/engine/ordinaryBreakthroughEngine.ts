import {REALM_BASE_POWER,REALM_LIFESPAN,REALM_ORDER} from '../data/initialWorld';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {recordMemory} from './memoryEngine';

function clamp(value:number,min:number,max:number):number {
  return Math.max(min,Math.min(max,value));
}

/** Original non-tribulation breakthrough settlement, shared without changing an actor's physical plane. */
export function resolveOrdinaryBreakthrough(
  world:WorldState,cultivator:Cultivator,siteName:string|undefined,rng:()=>number,
):WorldEvent|null {
  if (cultivator.realmStage >= 9 && cultivator.realm === REALM_ORDER.at(-1)) return null;
  const successChance =
    0.55 + (cultivator.karma / 500) + (cultivator.qiProgress >= 95 ? 0.2 : 0);
  if (rng() <= successChance) {
    cultivator.qiProgress = 0;
    let majorRealmUp = false;
    if (cultivator.realmStage < 9) {
      cultivator.realmStage += 1;
    } else {
      const currentIdx = REALM_ORDER.indexOf(cultivator.realm);
      if (currentIdx < REALM_ORDER.length - 1) {
        cultivator.realm = REALM_ORDER[currentIdx + 1];
        cultivator.realmStage = 1;
        majorRealmUp = true;
      }
    }
    const basePower = REALM_BASE_POWER[cultivator.realm];
    cultivator.maxHp = Math.round(
      basePower * (1 + cultivator.realmStage * 0.08)
    );
    cultivator.hp = cultivator.maxHp;
    cultivator.combatPower = Math.round(
      basePower * (1 + cultivator.realmStage * 0.1) +
        cultivator.artifacts.length * 45
    );
    cultivator.lifespan = REALM_LIFESPAN[cultivator.realm];

    const msg = majorRealmUp
      ? `渡过天劫，成功破境踏入【${cultivator.realm}期】！寿元与战力暴涨！`
      : `突破瓶颈，修为精进至【${cultivator.realm}${cultivator.realmStage}层】！`;

    recordMemory(cultivator, world.tick, msg, majorRealmUp ? 10 : 7, 'cultivation', majorRealmUp ? 5 : 3);
    return {
      id: `evt-${world.tick}-${cultivator.id}-break`,
      tick: world.tick,
      year: world.year,
      month: world.month,
      title: majorRealmUp
        ? `天地异象：${cultivator.name}晋升${cultivator.realm}期！`
        : `${cultivator.name}突破至${cultivator.realm}${cultivator.realmStage}层`,
      description: `在【${siteName ?? '灵山'}】，${cultivator.name}${msg}`,
      category: 'breakthrough',
      actorIds: [cultivator.id],
      locationId: cultivator.locationId,
    };
  } else {
    // Tribulation backlash
    const backlashDamage = Math.round(cultivator.maxHp * 0.28);
    cultivator.hp = clamp(cultivator.hp - backlashDamage, 10, cultivator.maxHp);
    cultivator.qiProgress = 45;
    recordMemory(
      cultivator,
      world.tick,
      `冲击更高境界时心魔丛生，惨遭反噬受损 ${backlashDamage} 点气血！`,
      8,
      'cultivation', -4
    );
    return {
      id: `evt-${world.tick}-${cultivator.id}-fail`,
      tick: world.tick,
      year: world.year,
      month: world.month,
      title: `${cultivator.name}破境遭天劫反噬`,
      description: `${cultivator.name}强行冲关失败，雷劫加身吐血重伤，气息萎靡。`,
      category: 'heavenly',
      actorIds: [cultivator.id],
      locationId: cultivator.locationId,
    };
  }
}
