import type { CouncilRecord } from '../types/world';

export const COUNCIL_STATUS_LABELS: Record<CouncilRecord['status'], string> = {
  passed: '已通过并执行', rejected: '未通过', stale: '失效，未执行',
};
