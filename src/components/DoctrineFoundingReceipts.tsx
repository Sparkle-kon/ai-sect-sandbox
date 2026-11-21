import type { DoctrineFoundingView } from '../engine/doctrineFoundingEngine';
import type { DoctrineMaturityView } from '../engine/doctrineMaturityEngine';
import { DoctrineMaturityReceipt } from './DoctrineMaturityReceipt';

const statusText: Record<DoctrineFoundingView['status'], string> = {
  proposed: '议立中，尚未成宗',
  established: '别宗已立',
  declined: '立宗未获允议',
  withdrawn: '立宗提议已撤',
  expired: '提议期满',
  invalidated: '条件已变，未成宗',
};
const viewerText: Record<DoctrineFoundingView['role'], string> = {
  founder: '你是发起人',
  parent_leader: '你是原宗掌门',
  school_member: '你是学舍成员',
  independent_member: '你是别宗成员',
};

export function DoctrineFoundingReceipts({ rows, maturity }: {
  rows: readonly DoctrineFoundingView[]; maturity?: ReadonlyMap<string, DoctrineMaturityView>;
}) {
  if (!rows.length) return null;
  return <section aria-label="别宗立宗实录" className="min-w-0 space-y-2 text-xs leading-relaxed text-slate-300">
    <h5 className="font-semibold text-teal-100">别宗立宗实录</h5>
    <p className="text-slate-400">自主学舍仍在原宗籍下；另立宗门须有实地允议和各人同意，不由支持人数代替。</p>
    {rows.map(row => {
      const later = maturity?.get(row.id);
      const stage = later?.settlement?.kind === 'merged' ? '曾立 · 已并宗'
        : later?.settlement?.kind === 'dispersed' ? '曾立 · 已散亡' : statusText[row.status];
      return <details key={row.id} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2 font-semibold text-teal-100">
        {row.independentName} · {stage}
      </summary>
      <div className="min-w-0 space-y-2 break-words border-t border-slate-800 p-3">
        <p>{viewerText[row.role]} · 第 {row.proposedTick} 轮提出{row.founderName ? ` · 发起人：${row.founderName}` : ''}。</p>
        {row.oldSiteName && <p>立宗所据原宗旧址：{row.oldSiteName}。</p>}
        {row.authorizedTick !== undefined
          ? <p>第 {row.authorizedTick} 轮，原宗掌门在原宗迁后的山门{row.authorizationSiteName ? `（${row.authorizationSiteName}）` : ''}亲自允议。</p>
          : <p>尚无原宗掌门在迁后山门允议的记录。</p>}
        {row.status === 'proposed' && <p className="text-slate-400">第 {row.expiresTick} 轮届期。提议时学舍账面 {row.schoolTreasury} 灵石，尚未交割。</p>}
        <p>本案留有 {row.consentCount} 人的同意（含发起人，已撤回者不计）；同意不等于已经改宗。</p>
        {!!row.joins?.length && <ul className="list-inside list-disc space-y-0.5 text-slate-400" aria-label="本人分别签下的入宗意愿">
          {row.joins.map((join, index) => <li key={index}>
            第 {join.tick} 轮 · {join.own ? '你本人' : `第 ${index + 1} 位成员`}同意
            {join.withdrawnTick !== undefined && `；第 ${join.withdrawnTick} 轮撤回`}
          </li>)}
        </ul>}
        {row.status === 'established' && row.establishedTick !== undefined && <>
          <p className="text-teal-100">第 {row.establishedTick} 轮立宗成事{row.confirmedMemberCount !== undefined
            ? `：实有 ${row.confirmedMemberCount} 人入别宗（含立宗发起人）` : ''}。</p>
          {row.transferredStones !== undefined && <p>立宗当时，学舍公库实交 {row.transferredStones} 灵石，记入新宗；不是当前余额。</p>}
          {row.scriptureName && <p>发起人授权的《{row.scriptureName}》抄本收入新宗。</p>}
          <p className="text-slate-400">此事未划转原宗公库、旧宗器物或旧债；旧约仍照原当事方。各人私物不是宗门受让。</p>
        </>}
        {row.continuity && <p>第 {row.continuity.tick} 轮，别宗依实际传位更换掌门{row.continuity.successorName ? `：${row.continuity.successorName}` : ''}；立宗旧录仍存。</p>}
        <DoctrineMaturityReceipt view={later} />
      </div>
    </details>; })}
  </section>;
}
