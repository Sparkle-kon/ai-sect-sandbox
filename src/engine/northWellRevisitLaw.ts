import type { NorthWellRevisitLaw,WorldState } from '../types/world';
import type { VerifiedEraCheckpoint } from './eraCheckpointEngine';
import { encodeEraWorldSave } from './storageEngine';
import { findNorthWellRevisitEvidence } from './northWellRevisitEvidence';
import { northWellLawId } from './northWellRevisitTerms';
import { NORTH_MINING_SITE } from './northMiningCharterTerms';

const hex=/^[a-f0-9]{64}$/u;
async function rawDigest(bytes:Uint8Array):Promise<string> {
  if(!globalThis.crypto?.subtle)throw Error('不能计算所选自然原帧摘要。');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
}

/** Verify again that the reviewed frame is the native export, then attach ONLY a legal author declaration. */
export async function buildNorthWellRevisitAuthor(verified:VerifiedEraCheckpoint,sourceCharterId:string,signal?:AbortSignal):Promise<WorldState>{
  if(signal?.aborted)throw Error('旧井作者分支已取消。');
  const {manifest,world}=verified;
  if(world.northWellRevisitLaw||world.northWellRevisitReviews||world.authoredEraOrigin||world.scenarioOrigin||
    world.playerAvatar.possessedId||world.playerAvatar.pendingOrder||!hex.test(manifest.payloadSha256)||
    manifest.tick!==world.tick||manifest.year!==world.year||manifest.month!==world.month)throw Error('原帧不是未经改写的同日旧井自然母本。');
  const evidence=findNorthWellRevisitEvidence(world,sourceCharterId);
  if(!evidence)throw Error('所选原井没有已经核验的三百年原契同址证据。');
  const raw=encodeEraWorldSave(world), bytes=new TextEncoder().encode(raw);
  if(bytes.byteLength!==manifest.payloadBytes||await rawDigest(bytes)!==manifest.payloadSha256||encodeEraWorldSave(world)!==raw)
    throw Error('审阅过程中原帧或校验摘要已经改变。');
  if(signal?.aborted)throw Error('旧井作者分支已取消。');
  const law:NorthWellRevisitLaw={version:1,kind:'authored_old_village_restriction',id:northWellLawId(world.tick,sourceCharterId),
    declaredTick:world.tick,year:world.year,month:world.month,nativeFrameDigest:manifest.payloadSha256,
    sourceCharterId,freightClosedTick:evidence.freightClosedTick,siteId:NORTH_MINING_SITE,wellProjectId:evidence.well.id,retainedPopulation:evidence.village.population};
  return {...structuredClone(world),northWellRevisitLaw:law};
}
