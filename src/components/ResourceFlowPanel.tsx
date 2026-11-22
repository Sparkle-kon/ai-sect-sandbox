import { useMemo, useState } from 'react';
import { MARKET_GOODS } from '../engine/marketEngine';
import { projectResourceFlowMonth } from '../engine/resourceFlowEngine';
import { createTerrainMapView } from './terrainMapView';
import type { Cultivator, ResourceFlowAccount, WorldState } from '../types/world';

type Month = NonNullable<ReturnType<typeof projectResourceFlowMonth>>;
type FlowRow = Month['rows'][number];
type FlowGood = FlowRow['good'];

const KIND: Record<FlowRow['kind'], string> = { transfer: '转移', production: '产出', consumption: '消耗', loss: '损失' };
const REASONS: Readonly<Record<string, string>> = {
  upper_array_field_entry_paid: '阵原入关实费',
  upper_array_field_home_paid: '阵原亲建住处实费',
  upper_lattice_material: '凝纹时亲付资材',
  upper_lattice_produced: '阵原实收原批阵材',
  upper_array_practice: '晨修实际耗用阵材或灵石',
  upper_array_field_trade_load: '实封原批阵材随本人携行',
  upper_array_field_trade_lattice_delivery: '双方于旧井实际交割原批',
  upper_array_field_trade_restock: '原批实回阵原',
  upper_array_field_trade_roots_payment: '旧井当事人实付地根',
  frontier_dryland_stones: '在地开井或养群实付灵石',
  frontier_dryland_roots: '在地作业实耗玄土根',
  frontier_dryland_water: '持秤井实际收水或支水',
  frontier_dryland_material: '冲层、喂牧或避雷实用原料',
  frontier_dryland_yield: '原位采盐或采石实收',
  frontier_dryland_trade_load: '原批实装入在途托管',
  frontier_dryland_trade_exchange: '两箱实到后原料交割',
  frontier_dryland_trade_return: '原批经实路退回本仓',
  frontier_port_voyage_rigging: '实装航程耗用船具', frontier_port_voyage_fee: '实际装船所付港费',
  frontier_port_practice_rigging: '借在泊船实修所耗船具',
  frontier_port_work_output: '港方亲自作业实收', frontier_port_work_stones: '港务实际付石',
  frontier_port_work_root: '港务用掉的原玄土根',
  frontier_port_escrow_roots: '签约实押玄土根', frontier_port_salt_loaded: '原批潮晶入船舱托管',
  frontier_port_salt_received: '中坊本人到场验收原潮晶', frontier_port_salt_returned: '原潮晶实回港仓',
  frontier_port_roots_collected: '返港原根经本人验收', frontier_port_roots_refunded: '中坊原托管实退原主',
  frontier_entry_paid: '实际过关所付资材', frontier_home_paid: '登记驻住实际启动资材',
  frontier_tend_spring_root: '泉眼实耗地根', frontier_spring_inflow_water: '真实泉水入槽',
  frontier_draw_tide_water: '开闸后实收潮水', frontier_sow_water: '播种实耗本地水',
  frontier_sow_root: '实用母根播种', frontier_irrigate_water: '补灌实耗本地水',
  frontier_cultivate_water: '南泽实修所耗潮水', frontier_practice: '北岭实修耗用御寒芦',
  frontier_protect_crop: '实取霜药护苗', frontier_crop_harvested: '当事人实际收获入库',
  frontier_winter_detour: '实装背风绕行补给',
  frontier_trade_load: '原货实装转入托管', frontier_trade_exchange: '双方到齐实物交割入库',
  frontier_trade_return: '原货实回本方仓',
  herb_harvest: '现场采集', herb_regrowth: '灵草自然补生', brew_material: '炼丹耗材', brew_fee: '炼丹炉费',
  brew_output: '炼成丹药', pill_use: '使用丹药', treasury_tax: '库账税赋', treasury_mining: '灵石矿产',
  treasury_upkeep: '宗门维护', treasury_overflow: '库容溢出', facility_construction: '设施建设',
  oath_funded: '天道契书托管', oath_paid: '契书价金支付', oath_refunded: '契书托管退款', oath_forfeited: '契书抵押罚没',
  oath_goods: '契书实物交付', commons_upkeep: '中立灵地共管维护', terrain_recovery: '地脉修复实耗',
  waypost_meal_deposit: '山驿茶叶托管', waypost_meal_consumed: '两位同行者实分茶叶', waypost_meal_refund: '茶未分饮，退回原叶',
  scribe_deposit: '书约托管', scribe_ink: '核卷实用纸墨', scribe_wage: '原稿交割实付酬劳', scribe_refund: '退还书约余款',
  workshop_deposit: '委制备料入库', workshop_fuel: '工坊实耗炉钱', workshop_material: '工坊实耗材料',
  workshop_wage: '合格成品工钱', workshop_refund: '工坊退还未用款料', workshop_capacity_release: '容量变动后实退未开工一件备料',
  road_charter: '驿路开工实际支出', road_maintenance: '驿路修缮实耗', road_crossing: '实际启程通行费',
  observatory_instrument: '临时观象实付仪料',
  pilgrimage_camp_provision: '途中留宿实耗玄土根',
  order_deposit: '挂单托管', order_release: '撤单或到期退回', price_improvement: '限价差退回',
  local_fill: '现场交割', shipment_departure: '商队启程转入保管', shipment_delivery: '商队到货交割',
  shipment_return: '商队退运退款退货', shipment_refund: '货损退款', shipment_loss: '实际货损',
  artifact_salvage_recovery: '拆解原器实回玄土根',
  furnace_safety_inspection: '现场验炉实耗灵石', furnace_safety_repair: '炉体修缮实耗备料',
  seed_source_used: '实耗原有灵叶留种', seed_lot_sealed: '另册实存种子',
  seed_trial_consumed: '每次小样实际用种', seed_planted: '实际播种入田',
  seed_crop_rooted: '已发根的实种转成新株', seed_germination_loss: '实测未发根损失',
  seed_crop_matured: '实熟仍存田圃', seed_harvest_delivered: '本人实收入袋',
  seed_plot_loss: '苗圃实际损失', seed_lot_loss: '实际余种损失',
  stipend_payment: '退居俸养本期实际兑付',
  followup_public_stones: '复诊实际公库支出', followup_local_leaf: '复诊实际耗用地库灵叶',
  civic_memorial_supplies: '乡祠立册实际耗用',
  fair_reserve_fee: '乡集摊位预约资金保管', fair_local_service: '原地摆摊实际摊费', fair_refund_fee: '未摆摊实退原预约资金',
  granary_donation: '捐入村镇义仓', granary_draw: '灾后短缺实际支用',
  granary_donation_roots: '实捐玄土根', granary_donation_stones: '实捐灵石',
  village_supply_transport: '互助实耗运费', village_supply_dispatch: '互助原货启运封存',
  village_supply_arrival: '互助原货实到', village_supply_return: '互助原货实退', village_supply_loss: '互助实证货损',
  shipment_salvage: '幸存原物转入封存',
  shipment_survived: '真实幸存货物转入封存', caravan_restitution: '核实封存原货后归还原卖方',
};
const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const PAGE_SIZE = 8;
const MONTHS = 6;

const goodName = (good: FlowGood) => good === 'stone' ? '灵石' : good === 'jade_seed' ? '青玉叶种子' :
  good === 'frost_dose' ? '霜药' : good === 'ward_reed' ? '御寒芦' : good === 'frontier_water' ? '在地水' :
  good === 'reef_salt' ? '潮晶' : good === 'port_rigging' ? '船具' :
  good === 'rift_salt' ? '旱盐' : good === 'stormstone' ? '雷石' : good === 'upper_lattice' ? '阵纹片' : MARKET_GOODS[good]?.label ?? '物资未详';
const units = (good: FlowGood) => good === 'stone' ? '灵石' : good === 'jade_seed' ? '粒'
  : good === 'frost_dose' || good === 'ward_reed' || good === 'frontier_water' || good === 'reef_salt' || good === 'port_rigging' ? '份'
  : good === 'rift_salt' || good === 'stormstone' ? '块' : good === 'upper_lattice' ? '片'
  : good === 'jade_leaf' || good === 'earth_root' || good === 'star_bloom' || good === 'shadow_moss' ? '株' : '枚';

export function ResourceFlowMonth({ ledger, world, scope, visibleSiteIds }: {
  ledger: Month;
  world: WorldState;
  scope: 'actor' | 'observer';
  visibleSiteIds: ReadonlySet<string>;
}) {
  const [requested, setRequested] = useState(0);
  const pages = Math.max(1, Math.ceil(ledger.rows.length / PAGE_SIZE));
  const page = Math.min(requested, pages - 1);
  const pageRows = ledger.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const actors = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.filter(({ id }) => scope === 'observer' || visibleSiteIds.has(id)).map(({ id, name }) => [id, name]));
  const account = (row: ResourceFlowAccount | undefined, fallback: string) => {
    if (!row) return fallback;
    switch (row.kind) {
      case 'actor': return actors.get(row.id) ?? '修士未详';
      case 'site': return sites.get(row.id) ?? '未观测地点';
      case 'sect': return sects.get(row.id) ?? '宗门未详';
      case 'oath': return row.pocket === 'payment' ? '契书价金托管' : '契书抵押托管';
      case 'order': return '坊市挂单托管';
      case 'shipment': return '商队在途保管';
      case 'granary': return '村镇义仓';
      case 'village_supply': return '互助在途封存';
      case 'village_fair': return '乡集摊位待付保管';
      case 'seed_lot': return '留种实物批次';
      case 'seed_plot': return '在地苗圃与实收暂存';
      case 'salvage': return '货损幸存物封存';
      case 'relocation': return '迁址在途公库';
      case 'waypost_meal': return '山驿茶叶托管';
      case 'scribe_commission': return '掌卷书约托管';
      case 'workshop': return '工坊备料托管';
      case 'upper_array_store': return '阵原在地仓';
      case 'frontier_store': return row.id==='east-offshore'?'外港在地仓':
        row.id==='western-saltwell'?'西漠在地仓':row.id==='plateau-thunderridge'?'雷脊在地仓':'另图在地仓';
    }
  };

  return (
    <section aria-label="此月已记录物资" className="min-w-0 space-y-2">
      <p>仙历 {ledger.year} 年 {ledger.month} 月 · Tick #{ledger.tick} · {ledger.closed ? '已完成的月份' : '当月尚未结束'}</p>
      {ledger.partial && <p className="text-amber-200">本月只列{scope === 'actor' ? '可见且保留的明细' : '已保留的明细'}；未列明细不按零计。</p>}
      {ledger.omittedEntries !== undefined && ledger.omittedEntries > 0 && <p className="text-amber-200">另有 {ledger.omittedEntries} 条明细超出保留上限，不能展开；只能依据此处已经保留的汇总。</p>}
      {ledger.totals.length === 0 ? <p className="text-slate-400">当前视角没有此月可列出的记录，不代表没有发生物资活动。</p> : (
        <ul aria-label="按物资各自对账" className="space-y-1.5">
          {ledger.totals.map(({ good, transfer, production, consumption, loss }) => (
            <li key={good} className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2">
              <h6 className="font-semibold text-cyan-100">{goodName(good)} · 单位：{units(good)}</h6>
              <dl className="grid grid-cols-2 gap-1 text-slate-300 sm:grid-cols-4">
                <div><dt className="inline text-slate-400">产出 </dt><dd className="inline">{production}</dd></div>
                <div><dt className="inline text-slate-400">消耗 </dt><dd className="inline">{consumption}</dd></div>
                <div><dt className="inline text-slate-400">损失 </dt><dd className="inline">{loss}</dd></div>
                <div><dt className="inline text-slate-400">转移 </dt><dd className="inline">{transfer}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {pageRows.length > 0 && (
        <ol className="space-y-1" aria-label="有方向的物资收据">
          {pageRows.map((row) => (
            <li key={row.id} className="min-w-0 break-words rounded bg-slate-900/70 p-2">
              <p className="font-semibold text-slate-100">{KIND[row.kind]} · {row.amount} {units(row.good)}{row.good !== 'stone' && ` ${goodName(row.good)}`} · {REASONS[row.reason] ?? '其他已记录活动'}</p>
              <p className="text-slate-400">{account('from' in row ? row.from : undefined, row.kind === 'production' ? '产出' : '来源未列')} → {account('to' in row ? row.to : undefined, row.kind === 'consumption' ? '消耗' : row.kind === 'loss' ? '实际损失' : '去向未列')}</p>
            </li>
          ))}
        </ol>
      )}
      {pages > 1 && <div className="flex flex-wrap items-center gap-1.5" aria-label="月度收据分页">
        <button type="button" className={control} disabled={page === 0} onClick={() => setRequested(page - 1)}>上一页</button>
        <button type="button" className={control} disabled={page + 1 === pages} onClick={() => setRequested(page + 1)}>下一页</button>
        <p className="text-slate-400" role="status">明细第 {page + 1}/{pages} 页 · 每页最多 {PAGE_SIZE} 条</p>
      </div>}
    </section>
  );
}

export function ResourceFlowPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const [opened, setOpened] = useState(false);
  const [scope, setScope] = useState<'actor' | 'observer'>('actor');
  const [requested, setRequested] = useState<number>();
  const actor = cultivator && world.cultivators.find(({ id }) => id === cultivator.id);
  const months = (world.resourceFlow?.months ?? []).filter(({ tick }) => tick <= world.tick).sort((a, b) => b.tick - a.tick).slice(0, MONTHS);
  const selected = months.find(({ tick }) => tick === requested) ?? months.find(({ tick }) => tick < world.tick) ?? months[0];
  const visibleSiteIds = useMemo(() => {
    if (!opened || scope !== 'actor') return new Set<string>();
    const view = createTerrainMapView(world, actor, true);
    return new Set(view.seenLocations.filter(({ id }) => view.isCurrentLocation(id)).map(({ id }) => id));
  }, [world, actor, opened, scope]);
  const ledger = opened && selected ? projectResourceFlowMonth(world, selected.tick, scope === 'observer'
    ? { kind: 'observer' } : { kind: 'actor', actorId: actor?.id, visibleSiteIds }) : undefined;
  return (
    <details className="min-w-0 rounded border border-cyan-400/20 bg-slate-950/55"
      onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-cyan-100">物资流向与月度对账</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>只统计已接入对账的活动，不是全世界总账。转移单列，不算新增或净变化；不同物资不相加。</p>
        {opened && <>
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">对账视角
              <select className={control} value={scope} onChange={(event) => setScope(event.currentTarget.value === 'observer' ? 'observer' : 'actor')}>
                <option value="actor">所选修士可见</option><option value="observer">天道视角（查看已记录总量）</option>
              </select>
            </label>
            {selected && <label className="grid min-w-0 gap-1">月份（最多保留 {MONTHS} 期）
              <select className={control} value={selected.tick} onChange={(event) => setRequested(Number(event.currentTarget.value))}>
                {months.map(({ tick, year, month }) => <option key={tick} value={tick}>{year} 年 {month} 月 · Tick #{tick}</option>)}
              </select>
            </label>}
          </div>
          <p className="text-slate-400">{scope === 'actor' ? (actor ? '只显示本修士可见或参与的记录；不返回隐藏账目。' : '未选修士，不将空缺当作全局记录。') : '只看已接入的数据汇总，未记录活动不在其中。'}</p>
          {ledger ? <ResourceFlowMonth key={`${scope}:${actor?.id ?? ''}:${ledger.tick}`} ledger={ledger}
            world={world} scope={scope} visibleSiteIds={visibleSiteIds} />
            : <p className="text-slate-400">尚无可查看的月度记录。</p>}
        </>}
      </div>
    </details>
  );
}
