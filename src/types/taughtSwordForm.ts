export interface TaughtSwordPractice {
  tick: number;
  siteId: string;
  masteryBefore: number;
  masteryAfter: number;
}

export interface TaughtSwordProof {
  tuitionId: string;
  learnerId: string;
  mentorId: string;
  lessonTick: number;
  practiceTick: number;
  practiceSiteId: string;
}
