const MIB=1024*1024;
/** Checked against native century storage in fastForwardCapacityNotice.test.tsx. */
export const CAMPAIGN_FRAME_BYTES=32*MIB;
export const CAMPAIGN_RETAINED_BYTES=128*MIB;

export function campaignFrameBlocksStart(campaign:boolean,currentBytes:number):boolean{
  return campaign&&currentBytes>CAMPAIGN_FRAME_BYTES;
}

/** Preflight measures one current JSON only and never allocates a second copy of retained history. */
export function FastForwardCapacityNotice({campaign,currentBytes,ordinaryLimit}:{
  campaign:boolean;currentBytes:number;ordinaryLimit:number;
}){
  const tooLarge=campaignFrameBlocksStart(campaign,currentBytes);
  return <>
    <p>快照份数不是内存用量，也不是人口上限。</p>
    {campaign&&<p>
      可续长局另有限额：每份快照 {CAMPAIGN_FRAME_BYTES/MIB} MiB，各分支保留的不同快照合计 {CAMPAIGN_RETAINED_BYTES/MIB} MiB。
      这里只测了当前一份；合计会在启动前查验，若超限不会开始，也不会删除既有分支。
    </p>}
    {tooLarge?<p role="status" className="text-amber-200">当前这份已经超过长局单份上限，不能启动本次可续长局。</p>:
      currentBytes>ordinaryLimit&&<p role="status" className="text-amber-200">
        普通 JSON 超过导入上限。{campaign?'这不等于超过长局上限。':'本次仅在独立副本短跑，不以普通 JSON 导入为前提。'}
      </p>}
  </>;
}
