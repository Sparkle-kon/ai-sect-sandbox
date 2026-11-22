import {onLowerPlane} from './upperPassageIsolation';
import { registerScriptureOriginal, scriptureEditionModifiers } from './scriptureEngine';
import type { Cultivator, PersonalityTrait, Technique, WorldEvent, WorldState } from '../types/world';
import { elementalRelation } from './elementalEngine';
import { recallMemories, recordMemory } from './memoryEngine';

const HIGH_REALMS = new Set<Cultivator['realm']>(['元婴', '化神', '炼虚', '合体', '大乘', '渡劫']);
const PERSONAL_STYLES: Record<PersonalityTrait, string> = {
  刚正: '守正', 阴险: '藏锋', 狂傲: '凌霄', 苟道: '敛息',
  痴情: '念心', 嗜血: '饮锋', 逍遥: '行云', 诡诈: '玄机',
};
const MEMORY_IMAGERY = {
  cultivation: '长生', combat: '破阵', social: '同契', heavenly: '观天', whisper: '听玄',
} as const;

export function mayAuthorTechnique(actor: Cultivator): boolean {
  return actor.alive && HIGH_REALMS.has(actor.realm) && actor.techniqueMastery >= 75 && !actor.authoredTechnique;
}

export function gainMastery(actor: Cultivator, amount: number): void {
  actor.techniqueMastery = Math.min(100, actor.techniqueMastery + amount);
}

export function masteryMultiplier(actor: Cultivator, purpose: 'combat' | 'cultivation' = 'combat'): number {
  return (1 + actor.techniqueMastery * 0.001) * scriptureEditionModifiers(actor)[purpose];
}

export interface TechniqueOption {
  id: string;
  scripture: Technique;
  source: 'pavilion' | 'inheritance';
}

export function availableTechniques(actor: Cultivator, world: WorldState): TechniqueOption[] {
  const sect = world.sects.find((item) => item.id === actor.sectId);
  const place = world.locations.find((item) => item.id === actor.locationId);
  const choices: TechniqueOption[] = [];
  const add = (scriptures: Technique[], source: TechniqueOption['source']) => {
    for (const scripture of scriptures) {
      if (scripture.id && scripture.id !== actor.technique.id &&
          !choices.some((option) => option.id === scripture.id)) {
        choices.push({ id: scripture.id, scripture, source });
      }
    }
  };
  if (place) add(place.inheritanceScrolls, 'inheritance');
  if (sect && actor.locationId === sect.headquartersId) add(sect.pavilion, 'pavilion');
  return choices;
}

export function utilityStudyTarget(actor: Cultivator, world: WorldState): string | undefined {
  const place = world.locations.find((item) => item.id === actor.locationId);
  const value = (scripture: Technique): number => {
    const own = elementalRelation(actor.spiritRoot, scripture.spiritRoot);
    const ambient = place ? elementalRelation(place.spiritRoot, scripture.spiritRoot) : 'neutral';
    return (own === 'matching' ? 4 : own === 'nurturing' ? 2 : own === 'overcoming' ? -3 : 0) +
      (ambient === 'matching' ? 3 : ambient === 'nurturing' ? 2 : ambient === 'overcoming' ? -3 : 0);
  };
  const baseline = value(actor.technique);
  return availableTechniques(actor, world).find(({ scripture, source }) =>
    value(scripture) > baseline + (actor.techniqueMastery >= 60 ? 2 : 0) ||
    (source === 'inheritance' && actor.techniqueMastery <= 28 && value(scripture) >= baseline)
  )?.id;
}

function scriptureEvent(world: WorldState, actor: Cultivator, token: string, title: string, description: string): WorldEvent {
  return {
    id: `evt-${world.tick}-${actor.id}-${token}`, tick: world.tick, year: world.year,
    month: world.month, title, description, category: 'breakthrough',
    actorIds: [actor.id], locationId: actor.locationId,
  };
}

export function authorTechnique(actor: Cultivator, world: WorldState): WorldEvent | null {
  if (!mayAuthorTechnique(actor)) return null;
  const inspiration = recallMemories(actor, world.tick, 1)[0]?.category;
  const image = inspiration ? MEMORY_IMAGERY[inspiration] : '悟道';
  const technique: Technique = {
    id: `technique-${actor.id}-${world.tick}`, authorId: actor.id, createdTick: world.tick,
    name: `${PERSONAL_STYLES[actor.personality]}${image}${actor.spiritRoot === '天灵根' ? '天' : actor.spiritRoot}诀`,
    spiritRoot: actor.spiritRoot,
  };
  if (!registerScriptureOriginal(world, technique, 'authored', actor.locationId, actor.sectId || undefined)) return null;
  delete actor.activeEdition;
  actor.authoredTechnique = { ...technique };
  actor.technique = { ...technique };
  actor.techniqueMastery = 55;
  const sect = world.sects.find((item) => item.id === actor.sectId);
  if (sect) sect.pavilion.push({ ...technique });
  const description = sect
    ? `${actor.name}将历练融入【${technique.name}】，并抄本入${sect.name}藏经阁。`
    : `${actor.name}将历练融入【${technique.name}】，手稿随身珍藏。`;
  recordMemory(actor, world.tick, description, 9, 'cultivation', 4);
  return scriptureEvent(world, actor, 'author-technique', `${actor.name}自创功法`, description);
}

export function studyTechnique(actor: Cultivator, world: WorldState, techniqueId: string | undefined): WorldEvent | null {
  if (!techniqueId || !actor.alive) return null;
  const option = availableTechniques(actor, world).find((entry) => entry.id === techniqueId);
  if (!option) return null;
  if (!registerScriptureOriginal(world, option.scripture, option.source, actor.locationId,
    option.source === 'pavilion' ? actor.sectId || undefined : undefined)) return null;
  delete actor.activeEdition;
  actor.technique = { ...option.scripture };
  const school = option.source === 'pavilion'
    ? world.sects.find((sect) => sect.id === actor.sectId)?.facilities.scripture_pavilion ?? 0 : 0;
  actor.techniqueMastery = option.scripture.authorId === actor.id ? 50 : 15 + school * 5;
  if (option.source === 'inheritance') {
    const location = world.locations.find((item) => item.id === actor.locationId);
    if (location) location.inheritanceScrolls = location.inheritanceScrolls.filter((item) => item.id !== techniqueId);
  }
  const description = `${actor.name}从${option.source === 'inheritance' ? '遗落传承' : '本宗藏经阁'}研习【${option.scripture.name}】。`;
  recordMemory(actor, world.tick, description, 7, 'cultivation', 3);
  return scriptureEvent(world, actor, 'study-technique', `${actor.name}研习新法`, description);
}

export function dropInheritance(actor: Cultivator, world: WorldState): void {
  const technique = actor.authoredTechnique;
  if (!technique || actor.alive || !onLowerPlane(actor)) return;
  const place = world.locations.find((item) => item.id === actor.locationId);
  if (place && !place.inheritanceScrolls.some((item) => item.id === technique.id)) {
    place.inheritanceScrolls.push({ ...technique });
  }
}
