import { structure } from './primitives';
import { worldRulesActors } from './worldRulesActors';
import { worldRulesInstitutions } from './worldRulesInstitutions';
import { worldRulesSettlements } from './worldRulesSettlements';
import { worldRulesFrontier } from './worldRulesFrontier';
import { worldRulesAvatars } from './worldRulesAvatars';

// Declaration order is part of the legacy validation error precedence.
export const shape = structure({
  ...worldRulesActors,
  ...worldRulesInstitutions,
  ...worldRulesSettlements,
  ...worldRulesFrontier,
  ...worldRulesAvatars,
});
