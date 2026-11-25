import { SECT_FAILURE_REASONS, SECT_RATINGS, type SectGrowthState } from '../../types/sectGrowth';
import type { SectManagementState } from '../../types/sectManagement';
import type { WorldState } from '../../types/world';
import { num, one, optional, SAVE_COLLECTION_LIMIT, structure, tick, wealth } from './primitives';

const rating=one(...SECT_RATINGS);
const stipendTreasuryLimit=50_000;
const debtLimit=1_000_000_000;
export const sectGrowthShape=structure({
  closing:structure({
    tick, treasury:wealth, overduePrincipal:num(0,debtLimit,true),
    closingNet:num(-debtLimit,1_000_000_000), livingDisciples:num(0,SAVE_COLLECTION_LIMIT,true),
    negativeMonths:num(0,3,true),
  }),
  review:optional(structure({
    tick, year:tick, previousRating:rating, rating, score:num(0,100,true), stipend:num(0,40,true),
  })),
  failure:optional(structure({tick,reason:one(...SECT_FAILURE_REASONS)})),
});

function chapterStipend(ratingIndex:number):number {
  if(ratingIndex>=9)return 40;
  if(ratingIndex>=6)return 28;
  if(ratingIndex>=3)return 16;
  return ratingIndex>0?8:0;
}

export function validateSectGrowth(
  world:WorldState,state:SectManagementState,growth:SectGrowthState,fail:(field:string)=>never,
):void {
  const {closing,review,failure}=growth;
  const dueTick=state.foundedTick+6;
  const afterDue=closing.tick>dueTick;
  // The native treasury cannot be negative; unpaid debt is counted here only as an obligation.
  // Later repayment can make the current principal *smaller* than the closing snapshot.
  if(closing.tick<=state.foundedTick||closing.tick>world.tick||
      closing.closingNet!==closing.treasury-closing.overduePrincipal||
      closing.livingDisciples>world.cultivators.length-1||
      (closing.closingNet<0)!==(closing.negativeMonths>0)||
      (!afterDue&&closing.overduePrincipal!==0)||
      (state.debt!==undefined&&closing.tick>state.debt.dueTick&&
        (state.debt.comedyAdjustedTick??0)<closing.tick&&closing.overduePrincipal<state.debt.principal)||
      closing.negativeMonths>Math.max(0,closing.tick-dueTick))
    return fail('sectManagement.growth.closing');
  if(review){
    const elapsed=review.tick-state.foundedTick,rank=Math.floor(review.score/10);
    const absolute=world.year*12+world.month-1-(world.tick-review.tick);
    const observedYear=Math.floor(absolute/12);
    const stipend=chapterStipend(rank);
    if(elapsed<12||elapsed%12!==0||absolute%12!==0||review.tick>closing.tick||review.year!==observedYear||
        review.rating!==SECT_RATINGS[rank]||elapsed===12&&review.previousRating!==SECT_RATINGS[0]||
        review.stipend>stipend||review.tick===closing.tick&&review.stipend!==Math.max(0,Math.min(stipend,Math.floor(stipendTreasuryLimit-closing.treasury))))
      return fail('sectManagement.growth.review');
  }
  if(failure){
    if(failure.tick!==closing.tick||
        failure.reason==='bankruptcy'&&(closing.negativeMonths!==3||closing.livingDisciples===0)||
        failure.reason==='disciples_gone'&&closing.livingDisciples!==0||
        review?.tick===failure.tick)
      return fail('sectManagement.growth.failure');
  }else if(closing.negativeMonths===3||closing.livingDisciples===0){
    return fail('sectManagement.growth.failure');
  }
}
