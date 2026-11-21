import type { AnnotationState } from '../types/world';

export const ANNOTATION_MAX_BOOKMARKS = 64;
export const ANNOTATION_MAX_NOTES = 64;
export const ANNOTATION_MAX_NOTE_CHARS = 140;
export const ANNOTATION_MAX_TITLE_CHARS = 100;

export const createAnnotationState = (): AnnotationState => ({ bookmarks: [], notes: [], nextId: 1 });
