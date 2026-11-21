export type SeedEntropy = Pick<Crypto,'getRandomValues'>;
export type SeedClipboard = Pick<Clipboard,'writeText'>;

export function drawWorldSeed(source:SeedEntropy|undefined=globalThis.crypto):number|undefined {
  if(!source||typeof source.getRandomValues!=='function')return;
  try {
    const uniformWord=new Uint32Array(1);
    source.getRandomValues(uniformWord);
    return uniformWord[0];
  }catch{return undefined;}
}

export async function copyWorldSeed(seed:number,clipboard:SeedClipboard|undefined):Promise<boolean>{
  if(!Number.isInteger(seed)||seed<0||seed>0xffff_ffff||!clipboard||typeof clipboard.writeText!=='function')return false;
  try {await clipboard.writeText(String(seed));return true;}catch{return false;}
}
