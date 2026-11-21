import {
  availableServiceRetirementActions, isRetiredFromService, SERVICE_RETIREMENT_MIN_TICKS, visibleServiceRetirements,
} from '../engine/serviceRetirementEngine';
import type { Cultivator, WorldState } from '../types/world';

export function ServiceRetirementPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!actor) return null;
  const history = visibleServiceRetirements(world, actor).filter(({ actorId, tick }) => actorId === actor.id && tick <= world.tick)
    .sort((a, b) => b.tick - a.tick);
  const service = actor.service && actor.service.changedTick <= world.tick ? actor.service : undefined;
  if (!service && history.length === 0) return null;
  const retired = service ? isRetiredFromService(actor) : false;
  const mayReturn = retired && actor.alive && availableServiceRetirementActions(actor, world).some(({ serviceMove }) => serviceMove === 'return');
  const sects = new Map(world.sects.map((sect) => [sect.id, sect]));
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const locations = new Map(world.locations.map(({ id, name }) => [id, name]));
  const currentSect = sects.get(actor.sectId);
  return (
    <details className="min-w-0 rounded border border-amber-400/25 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-100">告老退居与自愿复出</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p className="font-semibold text-amber-200">{!actor.alive ? '已陨落，以下为生前任事留档' : retired ? '当前已主动退居，不承接公职' : '当前未退居，实际任事以派任为准'}</p>
        <p>退居保留宗门归属、个人资产与历史位阶，不是陨落，也不自动发放俸金。复出只是重新可任事，不自动恢复旧职。</p>
        {service && (
          <p>退居时记录位阶：{sects.get(service.formerSectId)?.name ?? '原宗门未详'} · {service.formerRank} · 变更 Tick #{service.changedTick}</p>
        )}
        {actor.alive && !retired && currentSect?.leaderId === actor.id && <p>当前公职：掌门（有实际任命）。</p>}
        {retired && actor.alive && service && <p className="text-slate-400">
          {mayReturn ? '此时符合自愿复出条件，须本人另行决定。' :
            world.tick < service.retiredTick + SERVICE_RETIREMENT_MIN_TICKS
              ? `最早可于 Tick #${service.retiredTick + SERVICE_RETIREMENT_MIN_TICKS} 审核自愿复出，仍须本人同意。`
              : '此时未满足复出条件，不会自动复出。'}
        </p>}
        {history.length > 0 && <ol aria-label="本人实际退居与复出实录" className="max-h-[26rem] space-y-1.5 overflow-y-auto">
          {history.map((row) => {
            const succession = sects.get(row.sectId)?.succession;
            const successor = row.kind === 'retire' && row.leaderReleased && succession?.tick === row.tick && succession.previousLeaderId === actor.id
              ? people.get(succession.leaderId) : undefined;
            const released = [
              row.leaderReleased && '掌门职责',
              row.forumReleased && '宗门议事职责',
              row.guardLocationId && `驻守职责（${locations.get(row.guardLocationId) ?? '旧地点未详'}）`,
              row.stewardSchoolIds.length > 0 && `道统护持 ${row.stewardSchoolIds.length} 处`,
              row.infirmaryShiftIds.length > 0 && `静养院值守 ${row.infirmaryShiftIds.length} 班`,
            ].filter(Boolean);
            return (
              <li key={row.id} className="min-w-0 space-y-1 break-words rounded border border-slate-800 p-2">
                <p className="font-semibold text-amber-100">Tick #{row.tick} · {row.kind === 'retire' ? '本人自愿退居' : '本人自愿复出'} · 当时记录位阶 {row.formerRank}</p>
                {row.kind === 'retire' && <p>{released.length ? `已实际卸任：${released.join('、')}` : '无可查的职责卸任记录。'}</p>}
                {successor && <p>本轮交接记录：{successor}接任掌门。</p>}
              </li>
            );
          })}
        </ol>}
      </div>
    </details>
  );
}
