import { DIRECTOR_AUDIT_STYLES, renderDirectorHighlightsAudit, runDirectorHighlightsAudit } from './directorHighlightsAudit';

console.log(renderDirectorHighlightsAudit(DIRECTOR_AUDIT_STYLES.map(([style]) => runDirectorHighlightsAudit({ style }))));
