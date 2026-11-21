import {campaignSHA256} from '../src/engine/campaignMemento';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {granaryAt} from '../src/engine/villageGranaryEngine';
import {FROM,TO,nativeCorridorFixture,place,plot,town,turn,wait} from '../tests/fixtures/villageEvolutionNativeFixture';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const prepared=nativeCorridorFixture();
const source=structuredClone(prepared.w);
plot(source,FROM).stress=72;
const moved=wait(source,w=>w.villageEvolution.migrations.some(row=>row.fromSettlementId===FROM),24);
const carried=moved.villageEvolution.migrations.find(row=>row.fromSettlementId===FROM);
if(!carried)throw Error('未取得实际迁居凭据。');
let beforeBlock=source;
while(beforeBlock.tick<carried.tick-1)beforeBlock=turn(beforeBlock);
const tile=beforeBlock.terrain.tiles.find(row=>row.id===carried.path[Math.floor(carried.path.length/2)]);
if(!tile)throw Error('原路经过的中段无法复核。');
const at={x:(tile.col+.5)*1000/beforeBlock.terrain.columns,y:(tile.row+.5)*600/beforeBlock.terrain.rows};
const blocked=turn(applyMapBrush(applyMapBrush(beforeBlock,'cursed_miasma',[at]),'cursed_miasma',[at]));
const frontier=nativeCorridorFixture(true);
const origin=place(frontier.w,FROM);
const ruined=wait(applyMapBrush(frontier.w,'meteor',[{x:origin.x,y:origin.y}]),w=>town(w,FROM)?.status==='ruin',6);
const pressure=structuredClone(ruined);
for(const v of pressure.settlements.villages)if(v.id!==FROM&&v.id!==TO)v.stress=65;
plot(pressure,FROM).stress=4;
plot(pressure,TO).stress=80;
const inhabited=wait(pressure,w=>town(w,FROM).status==='village',10);
for(const [label,w] of [['actually_moved',moved],['actual_blockage',blocked],['true_ruin',ruined],['true_return',inhabited]] as const){
  const native=encodeEraWorldSave(w);
  if(encodeEraWorldSave(decodeEraWorldSave(native))!==native)throw Error('存档读回不一致。');
  const origin=town(w,FROM),dest=town(w,TO);
  const move=w.villageEvolution.migrations.find(row=>row.tick===w.tick&&row.fromSettlementId===FROM);
  console.log(JSON.stringify({label,seed:w.random.seed,rule:__SECT_UTILITY_RULE_VERSION__,tick:w.tick,year:w.year,month:w.month,
    well:w.villageWorks.projects.find(row=>row.kind==='well'&&row.settlementId===TO)?.settledTick,
    delivery:w.villageSupply.agreements[0]?.closedTick,from:{name:origin.registeredName,current:plot(w,FROM).population,stage:origin.status,
      change:origin.changes.at(-1),stock:granaryAt(w,FROM)?.roots},to:{name:dest.registeredName,current:plot(w,TO).population,
      stage:dest.status,change:dest.changes.at(-1),routes:dest.samples.at(-1)?.passableCorridors,stock:granaryAt(w,TO)?.stones},
    ...(move?{adults:move.people,leftMinors:move.leftJuveniles,leftNamed:move.leftNamed,pathTiles:move.path.length}:{}),
    sha:await campaignSHA256(new TextEncoder().encode(native)),bytes:new TextEncoder().encode(native).length,byteExactRestore:true}));
}
