import {ensureManagedSectQuirks} from '../sectQuirkAssignment';
import { advanceFrontierProduction } from '../frontierProductionEngine';
import { advanceNorthGateRenewal } from '../northGateRenewalEngine';
import { advanceRouteWarnings } from '../routeWarningEngine';
import { openResourceFlowMonth } from '../resourceFlowEngine';
import { advanceNorthMiningCharters } from '../northMiningCharterEngine';
import { maintainMentorship } from '../mentorshipEngine';
import { consumeAvatarOrder, maintainPlayerAvatar } from '../avatarEngine';
import { trackFlightTurn } from '../protagonistFlightTape';
import { advanceProtagonistSuccession } from '../protagonistSuccession';
import { maintainAlchemy } from '../alchemyEngine';
import { maintainSectEconomy } from '../sectEconomyEngine';
import type { PreTurnContext, TickBaseContext } from './tickContext';
import { defineTickPlugins, runTickPlugins } from './tickPlugins';

const preTurnMaintenance = defineTickPlugins<TickBaseContext>([
  { id: 'expireSectRecruitAd', run: ({nextState})=>{
    const managed=nextState.sectManagement,chat=managed?.playerChat;
    if(managed&&chat?.recruitAd&&chat.recruitAd.targetTick<nextState.tick){
      const {recruitAd:_expired,...rest}=chat;
      managed.playerChat=rest;
    }
  } },
  { id: 'ensureManagedSectQuirks', run: ({ nextState }) => ensureManagedSectQuirks(nextState) },
  { id: 'advanceProtagonistSuccession', run: ({ nextState, prevState }) => advanceProtagonistSuccession(nextState, prevState) },
  { id: 'trackFlightTurn', run: ({ nextState }) => trackFlightTurn(nextState) },
  { id: 'openResourceFlowMonth', run: ({ nextState }) => openResourceFlowMonth(nextState) },
  { id: 'advanceNorthMiningCharters', run: ({ nextState }) => advanceNorthMiningCharters(nextState) },
  { id: 'advanceNorthGateRenewal', run: ({ nextState }) => advanceNorthGateRenewal(nextState) },
  { id: 'advanceFrontierProduction', run: ({ nextState }) => advanceFrontierProduction(nextState) },
  { id: 'advanceRouteWarnings', run: ({ nextState }) => advanceRouteWarnings(nextState) },
  { id: 'maintainPlayerAvatar', run: ({ nextState }) => maintainPlayerAvatar(nextState) },
  { id: 'maintainMentorship', run: ({ nextState }) => maintainMentorship(nextState) },
]);

export function runPreTurn(context: TickBaseContext): PreTurnContext {
  const { nextState } = context;
  nextState.tick += 1;
  if (nextState.month >= 12) {
    nextState.year += 1;
    nextState.month = 1;
  } else {
    nextState.month += 1;
  }

  runTickPlugins(context, preTurnMaintenance);
  const avatarOrder = consumeAvatarOrder(nextState);
  const pendingGateEffects: PreTurnContext['pendingGateEffects'] = new Map();
  const danxiaRegrowth = maintainAlchemy(nextState);
  maintainSectEconomy(nextState);
  return { ...context, avatarOrder, pendingGateEffects, danxiaRegrowth };
}
