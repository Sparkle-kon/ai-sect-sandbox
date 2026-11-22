/** A second, separately witnessed deed. It does not replace the original inscription. */
export interface CivicMemorialAddition {
  id:string;
  deedId:string;
  witnessId:string;
  appendedTick:number;
}
