import type {Sect} from '../types/world';

/** An inactive identity remains valid for historical references, never for new authority. */
export const isSectActive=(sect:Sect|undefined):sect is Sect=>Boolean(sect&&sect.inactiveSinceTick===undefined);
