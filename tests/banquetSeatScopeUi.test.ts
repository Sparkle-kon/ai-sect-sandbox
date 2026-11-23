import {expect,it} from 'vitest';
import {scopeBanquetSeatForStory} from '../src/components/useBanquetSeatStory';
import type {BanquetSeatView} from '../src/engine/banquetSeats';

const table:BanquetSeatView={id:'seat',hallEventId:'hall',siteId:'venue',siteName:'论剑台',invitedTick:10,
  presentCount:2,tableLine:'两人都按约到场，在同一张桌前坐下。',options:[]};

it('retains an eligible remote original recipient or fresh own receipt without showing the formal table',()=>{
  expect(scopeBanquetSeatForStory(table,false,11,'story')).toBeUndefined();
  const options=[{action:'BANQUET_SEAT',banquetSeatMove:'late',targetBanquetSeatId:'seat'}] as const;
  const remote=scopeBanquetSeatForStory({...table,options},false,11,'story');
  expect(remote?.options).toBe(options);
  expect(remote?.presentCount).toBeUndefined();
  expect(remote?.tableLine).not.toContain('两人都按约到场');
  const withReceipt={...table,receipt:{title:'亲口辞席',description:'只辞本人这一席。',tick:11}};
  expect(scopeBanquetSeatForStory(withReceipt,false,11,'world')?.receipt).toEqual(withReceipt.receipt);
  expect(scopeBanquetSeatForStory(withReceipt,false,12,'world')).toBeUndefined();
  expect(scopeBanquetSeatForStory(table,true,11,'story')?.presentCount).toBe(2);
});
