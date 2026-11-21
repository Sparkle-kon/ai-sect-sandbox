/** Narrow declarations for this headless audit harness; no new package dependency. */
interface NativeFile {
  writeFile(data:string|Uint8Array):Promise<void>;
  sync():Promise<void>;
  close():Promise<void>;
}
interface NativeFiles {
  mkdir(path:string,options:{recursive:boolean}):Promise<unknown>;
  open(path:string,flags:string):Promise<NativeFile>;
  readFile(path:string,encoding:'utf8'):Promise<string>;
  readFile(path:string):Promise<Uint8Array>;
  rename(from:string,to:string):Promise<void>;
  stat(path:string):Promise<{size:number}>;
  unlink(path:string):Promise<void>;
  writeFile(path:string,data:string|Uint8Array):Promise<void>;
}
interface NativeOS {
  arch():string;
  platform():string;
  release():string;
  cpus():Array<{model:string}>;
  totalmem():number;
}
const filesModule='node:fs/promises';
const plainFilesModule='node:fs';
const pathModule='node:path';
const osModule='node:os';
export const {mkdir,open,readFile,rename,stat,unlink,writeFile}=await import(filesModule) as NativeFiles;
export const {existsSync}=await import(plainFilesModule) as {existsSync(path:string):boolean};
export const {join}=await import(pathModule) as {join(...parts:string[]):string};
export const {arch,platform,release,cpus,totalmem}=await import(osModule) as NativeOS;
