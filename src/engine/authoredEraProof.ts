import type {AuthoredEraOrigin} from '../types/world';

export type AuthoredEraProof=Pick<AuthoredEraOrigin,'baselineDigest'|'designDigest'|'rulesRevision'>;
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function isAuthoredEraProof(proof:unknown):proof is AuthoredEraProof {
  if(!proof||typeof proof!=='object')return false;
  const read=(key:keyof AuthoredEraProof)=>{
    const field=Object.getOwnPropertyDescriptor(proof,key);
    return field&&'value' in field?field.value as unknown:undefined;
  };
  const revision=read('rulesRevision');
  return digest(read('baselineDigest'))&&digest(read('designDigest'))&&typeof revision==='string'&&
    /^[a-z0-9][a-z0-9_.:-]{0,127}$/.test(revision);
}

/** Deterministic provenance label only, not a signature or trust token. */
export function authoredEraId(proof:AuthoredEraProof):string {
  const text=JSON.stringify([proof.designDigest,proof.baselineDigest,proof.rulesRevision]);
  const prime=0x100000001b3n, mask=0xffffffffffffffffn;
  let left=0xcbf29ce484222325n,right=0x9ca49c461c2dc5a1n;
  for(let index=0;index<text.length;index++){
    left=((left^BigInt(text.charCodeAt(index)))*prime)&mask;
    right=((right^BigInt(text.charCodeAt(text.length-1-index)))*prime)&mask;
  }
  return `authored-era-${left.toString(16).padStart(16,'0')}${right.toString(16).padStart(16,'0')}`;
}
export const authoredBranchSectId=(id:string)=>`sect-north-${id.slice(-32)}`;
