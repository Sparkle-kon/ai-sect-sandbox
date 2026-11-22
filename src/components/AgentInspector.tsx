import {labelAction} from './actionLabels';
import {AscensionPanel,type AscensionControls} from './AscensionPanel';
import {projectAscension} from '../engine/ascensionEngine';
import {verifiedImmortalAscension} from '../engine/ascensionProof';
import {CultivationClanRead,type ClanControls} from './CultivationClanRead';
import {projectCultivationClans} from '../engine/cultivationClanEngine';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {DaoPathRead,type DaoPathControls} from './DaoPathRead';
import {projectDaoPath} from '../engine/daoPathEngine';
import {canReadOwnPersona,personaDossierMemories,PersonaDossierRead} from './personaDossierRead';
import {ActorDramaticBondRead,type PersonalBondRead,type PublicBondArc} from './DramaticBondRead';
import {ForbiddenArtScarsRead} from './ForbiddenArtCard';
import {EarnedDestinyTraits} from './DestinyTraitCard';
import type {CraftTrainingControls} from './CraftTrainingRead';
import type {WorkshopEstateControls} from './WorkshopEstateRead';
import type {WorkshopReleaseControls} from './WorkshopReleaseRead';
import type {DanxiaMedicineControlsProps} from './DanxiaMedicineControls';
import type {DanxiaSeasonReviewControlsProps} from './DanxiaSeasonReviewControls';
import React from 'react';
import { Shield, Coins, Compass, Heart } from 'lucide-react';
import { Cultivator, WorldState } from '../types/world';
import { expeditionRescueCheckpoint } from '../engine/expeditionRescueCheckpoint';
import { boundaryReliefCheckpoint } from '../engine/boundaryReliefCheckpoint';
import { MemoryPanel } from './MemoryPanel';
import { RecollectionPanel } from './RecollectionPanel';
import { ReflectionPanel } from './ReflectionPanel';
import { ProbationPanel } from './ProbationPanel';
import { ServiceRetirementPanel } from './ServiceRetirementPanel';
import { SealedCourierPanel } from './SealedCourierPanel';
import { RumorPanel } from './RumorPanel';
import { SchemePanel } from './SchemePanel';
import { SpiritRootBadge } from './SpiritRootBadge';
import { visibleScriptureEditions } from '../engine/scriptureEngine';
import { TechniquePanel } from './TechniquePanel';
import { AlchemyPanel } from './AlchemyPanel';
import type {HeavenlyAlchemyControls} from './HeavenlyAlchemyRead';
import { heldRelicFragments } from '../engine/relicEngine';
import { WorkshopPanel } from './WorkshopPanel';
import { FurnaceReservationPanel } from './FurnaceReservationPanel';
import { ArtifactPanel } from './ArtifactPanel';
import type { ArtifactSalvageControls } from './ArtifactPanel';
import { TribulationPanel } from './TribulationPanel';
import { SectHierarchyPanel } from './SectHierarchyPanel';
import { SectEconomyPanel } from './SectEconomyPanel';
import { SectDiplomacyPanel } from './SectDiplomacyPanel';
import { WorldOccasionsPanel } from './WorldOccasionsPanel';
import { BOUNTY_STATUS, relevantBounty } from './bountyLabels';
import { SpiritBeastPanel } from './SpiritBeastPanel';

const ScriptureEditionPanel = React.lazy(async () => ({ default: (await import('./ScriptureEditionPanel')).ScriptureEditionPanel }));
const RelicSetPanel = React.lazy(async () => ({ default: (await import('./RelicSetPanel')).RelicSetPanel }));

interface AgentInspectorProps {
  allowPersonalThought?:boolean;
  publicBonds?:readonly PublicBondArc[];
  personalBonds?:PersonalBondRead;
  medicineControls?:DanxiaMedicineControlsProps;
  seasonReviewControls?:DanxiaSeasonReviewControlsProps;
  world: WorldState;
  cultivator: Cultivator | undefined;
  onSelectCultivator: (id: string) => void;
  workspaceSection?: 'profile' | 'cultivation' | 'mind' | 'sect';
  artifactSalvage?: ArtifactSalvageControls;
  workshopReleaseControls?:WorkshopReleaseControls;
  workshopEstateControls?:WorkshopEstateControls;
  craftTrainingControls?:CraftTrainingControls;
  heavenlyAlchemyControls?:HeavenlyAlchemyControls;
  daoPathControls?:DaoPathControls;
  clanControls?:ClanControls;
  ascensionControls?:AscensionControls;
  onListenAscension?:()=>Promise<boolean>;
}

export const AgentInspector: React.FC<AgentInspectorProps> = ({
  world,
  cultivator,
  onSelectCultivator, workspaceSection, artifactSalvage,
  medicineControls,
  seasonReviewControls,
  workshopReleaseControls,
  workshopEstateControls,
  craftTrainingControls,
  heavenlyAlchemyControls,daoPathControls,clanControls,ascensionControls,onListenAscension,
  publicBonds,personalBonds,allowPersonalThought=false,
}) => {
  if (!cultivator) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
        请在地图或下方列表中选择一位修士以洞察其识海。
      </div>
    );
  }

  const sect = world.sects.find((s) => s.id === cultivator.sectId);
  const extractionPoint = expeditionRescueCheckpoint(world, cultivator);
  const reliefPoint = boundaryReliefCheckpoint(world, cultivator);
  const location = extractionPoint || reliefPoint ? undefined : world.locations.find((l) => l.id === cultivator.locationId);
  const bounty = relevantBounty(world.bounties, cultivator.id);
  const profile = !workspaceSection || workspaceSection === 'profile';
  const clan=profile?projectCultivationClans(world,cultivator):undefined;
  const ascended=profile&&cultivator.positionPlane==='immortal'&&!!verifiedImmortalAscension(world,cultivator);
  const portrait = profile ? projectCultivatorPortrait(world,cultivator) : undefined;
  const cultivation = !workspaceSection || workspaceSection === 'cultivation';
  const ascension=cultivation?projectAscension(world,cultivator):undefined;
  const daoPath=cultivation?projectDaoPath(world,cultivator):undefined;
  const mind = !workspaceSection || workspaceSection === 'mind';
  const ownThought=mind&&canReadOwnPersona(world,cultivator,allowPersonalThought);
  const readableMind=mind?personaDossierMemories(cultivator,ownThought):cultivator;
  const sectDetails = !workspaceSection || workspaceSection === 'sect';
  const scriptureCatalog = cultivation && world.scriptures ? visibleScriptureEditions(world, cultivator) : undefined;
  const showsRelic = cultivation && (cultivator.artifacts.some(({ relicSetId }) => relicSetId !== undefined) ||
    !!world.relics && heldRelicFragments(world, cultivator.id).length > 0);

  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3.5 break-words">
      {/* Quick Switch Roster */}
      {!workspaceSection && <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-800">
        {world.cultivators.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectCultivator(c.id)}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              c.id === cultivator.id
                ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50'
                : c.alive
                  ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-900 text-slate-600 line-through'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>}

      {/* Header */}
      {profile && <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 max-w-full items-start gap-2.5">
          {portrait&&<CultivatorPortrait portrait={portrait}/>}
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">
                {cultivator.name}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-amber-300 border border-amber-500/30">
                {cultivator.realm} {cultivator.realmStage}层
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300">
                性格：{cultivator.personality}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {sect?.name ?? '散修'} · {cultivator.title} · 寿元 {cultivator.age}/
              {cultivator.lifespan}载
            </p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            cultivator.alive
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/20 text-rose-400'
          }`}
        >
          {ascended?'已飞升':cultivator.alive?`当前：${labelAction(cultivator.currentAction)}`:'已陨落'}
        </span>
      </div>}

      {profile&&<EarnedDestinyTraits world={world} actor={cultivator}/>}
      {profile&&<ForbiddenArtScarsRead world={world} actor={cultivator}/>}

      {profile&&world.cultivators.includes(cultivator)&&<ActorDramaticBondRead actorId={cultivator.id} publicArcs={publicBonds} personal={personalBonds}/>}

      {clan&&<CultivationClanRead key={cultivator.id} view={clan} tick={world.tick} controls={clanControls}
        named={id=>world.cultivators.find(actor=>actor.id===id)?.name??'修士未详'}/>}

      {mind&&<PersonaDossierRead world={world} actor={cultivator} live={allowPersonalThought}/>}

      {profile && <>
      {/* Vital Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 flex items-center gap-1">
            <Heart className="w-3 h-3 text-rose-400" /> 气血 (HP)
          </div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {cultivator.hp} / {cultivator.maxHp}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 flex items-center gap-1">
            <Shield className="w-3 h-3 text-sky-400" /> 综合战力
          </div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {cultivator.combatPower}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 flex items-center gap-1">
            <Coins className="w-3 h-3 text-amber-400" /> 灵石储备
          </div>
          <div className="font-semibold text-slate-100 mt-0.5">
            {cultivator.spiritStones}
          </div>
        </div>
        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 flex items-center gap-1">
            <Compass className="w-3 h-3 text-emerald-400" /> 所在灵地
          </div>
          <div className="font-semibold text-slate-100 mt-0.5 truncate">
            {extractionPoint ? '实际撤离关口' : reliefPoint ? '实际换防关口' : location?.name ?? cultivator.locationId}
          </div>
        </div>
      </div>

      {/* Qi Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">当前境界灵气圆满度</span>
          <span className="text-amber-300 font-semibold">
            {cultivator.qiProgress}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-amber-400 transition-all duration-300"
            style={{ width: `${cultivator.qiProgress}%` }}
          />
        </div>
      </div>

      </>}

      {cultivation && <section aria-label="灵根、功法与法宝" className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">灵根：</span>
            <SpiritRootBadge root={cultivator.spiritRoot} />
          </div>
          <div className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400">功法：</span>
            <span className="text-slate-200">{cultivator.technique.name}</span>
            <SpiritRootBadge root={cultivator.technique.spiritRoot} />
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">所在灵脉：</span>
            {location
              ? <SpiritRootBadge root={location.spiritRoot} />
              : <span className="text-slate-500">未详</span>}
          </div>
        </div>
        <ArtifactPanel world={world} cultivator={cultivator} cultivators={world.cultivators} salvage={artifactSalvage} />
        <WorkshopPanel world={world} cultivator={cultivator} releaseControls={workshopReleaseControls} estateControls={workshopEstateControls} trainingControls={craftTrainingControls} />
        <FurnaceReservationPanel world={world} cultivator={cultivator} />
        {showsRelic && <React.Suspense fallback={<p role="status" className="text-xs text-slate-400">载入套装记录…</p>}>
          <RelicSetPanel world={world} actor={cultivator} />
        </React.Suspense>}
      </section>}

      {profile && <p aria-label="业力与悬赏摘要" className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>业力 {cultivator.karma}</span>
        <span>恶行记录 {cultivator.transgressions}</span>
        {bounty && <span className={bounty.status === 'open' ? 'text-rose-300' : 'text-slate-400'}>悬赏：{BOUNTY_STATUS[bounty.status]}</span>}
      </p>}
      {profile && <ServiceRetirementPanel world={world} cultivator={cultivator} />}
      {profile && <ProbationPanel world={world} cultivator={cultivator} />}
      {sectDetails && <>
      <SectHierarchyPanel cultivator={cultivator} sect={sect} cultivators={world.cultivators} />
      <SectEconomyPanel cultivator={cultivator} sect={sect} world={world} medicineControls={medicineControls} seasonReviewControls={seasonReviewControls} />
      <SectDiplomacyPanel sect={sect} world={world} />
      </>}
      {!workspaceSection && <WorldOccasionsPanel world={world} cultivator={cultivator} />}
      {profile && <SpiritBeastPanel world={world} cultivator={cultivator} location={location} beasts={world.spiritBeasts ?? []} />}
      {cultivation && <>
      <TribulationPanel cultivator={cultivator} />
      {ascension&&<AscensionPanel key={cultivator.id} view={ascension} controls={ascensionControls} onListen={onListenAscension}/>}
      <TechniquePanel world={world} cultivator={cultivator} sect={sect} location={location} cultivators={world.cultivators} />
      {daoPath&&<DaoPathRead key={daoPath.actorId} view={daoPath} tick={world.tick} controls={daoPathControls}/>}
      {scriptureCatalog?.original && <React.Suspense fallback={<p role="status" className="text-xs text-slate-400">载入经义校勘…</p>}>
        <ScriptureEditionPanel world={world} actor={cultivator} catalog={scriptureCatalog} />
      </React.Suspense>}
      <AlchemyPanel world={world} cultivator={cultivator} location={location} heavenlyAlchemyControls={heavenlyAlchemyControls} />
      </>}
      {mind && <>
      <RecollectionPanel world={world} actorId={cultivator.id} />
      <ReflectionPanel cultivator={readableMind} />
      <RumorPanel cultivator={cultivator} locations={world.locations} cultivators={world.cultivators} />
      <SealedCourierPanel world={world} cultivator={cultivator} />
      <SchemePanel cultivator={cultivator} locations={world.locations} cultivators={world.cultivators} />

      {/* Both banks are the engine's current state, not a separate UI cache. */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          情景记忆会逐月淡忘，每12个月凝练重要经历；核心记忆衰减更慢，但也会淡忘并受容量限制。
        </p>
        <MemoryPanel memories={readableMind.coreMemories} tick={world.tick} core />
        <MemoryPanel memories={readableMind.memories} tick={world.tick} />
      </div>
      </>}
    </div>
  );
};
