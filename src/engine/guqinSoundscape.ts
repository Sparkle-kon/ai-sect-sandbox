export interface GuqinScoreNote {
  readonly midi: number;
  readonly velocity: number;
  readonly offsetMs?: number;
}
export interface GuqinScoreEvent {
  /** Spacing to the following entrance, including the silence after a phrase. */
  readonly delayMs: number;
  readonly notes: readonly GuqinScoreNote[];
}

const n = (midi: number, velocity: number, offsetMs?: number): GuqinScoreNote => (
  Object.freeze(offsetMs === undefined ? {midi, velocity} : {midi, velocity, offsetMs})
);
const event = (delayMs: number, ...notes: GuqinScoreNote[]): GuqinScoreEvent => (
  Object.freeze({delayMs, notes: Object.freeze(notes)})
);

/** An original four-line D pentatonic miniature. Each line has its own breath and register. */
export const GUQIN_PHRASES: readonly GuqinScoreEvent[] = Object.freeze([
  // Opening: leave space around the first bass note and answer in the middle register.
  event(1710, n(50, .76)),
  event(840,  n(57, .61)),
  event(1130, n(59, .54)),
  event(1620, n(54, .62)),
  event(690,  n(52, .40)),
  event(1320, n(54, .56)),
  event(2810, n(50, .64)),
  // Second line: the staggered low fifth supports but never doubles the upper melody.
  event(1480, n(45, .67), n(57, .38, 47)),
  event(740,  n(59, .56)),
  event(1770, n(62, .70)),
  event(950,  n(59, .48)),
  event(1290, n(57, .59)),
  event(1070, n(54, .51)),
  event(2850, n(52, .64)),
  // The lift: one higher color, then a quieter answer instead of another climb.
  event(1490, n(50, .63), n(62, .40, 54)),
  event(910,  n(64, .55)),
  event(2170, n(66, .61)),
  event(730,  n(62, .44)),
  event(1180, n(59, .53)),
  event(1680, n(57, .57)),
  event(2740, n(54, .62)),
  // Landing: irregular short gestures over the soft bass, then a full bar of air.
  event(1680, n(45, .54)),
  event(740,  n(52, .48)),
  event(1340, n(54, .58)),
  event(1280, n(57, .62)),
  event(860,  n(54, .44)),
  event(1070, n(52, .39)),
  event(2820, n(50, .70)),
  event(1850),
]);

const tau = Math.PI * 2;
const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Render one dry mono pluck, not a looped oscillator. The string's pluck and
 * pickup positions shape the modes; registered body resonances and faster
 * high-partial damping give the attack a wooden edge and the tail a dark tone.
 * Explicit Nyquist headroom and a zero-ended smooth gate keep small speakers quiet.
 */
export function renderGuqinNote(midi: number, sampleRate: number): Float32Array {
  if (!Number.isFinite(midi) || !Number.isFinite(sampleRate) || sampleRate < 4000 || sampleRate > 192000) {
    return new Float32Array(0);
  }
  const note = clamp(Math.round(midi), 40, 76);
  const rate = Math.round(sampleRate);
  const fundamental = 440 * 2 ** ((note - 69) / 12);
  const length = Math.ceil(rate * (2.34 - (note - 40) * .018));
  const samples = new Float32Array(length);
  const plectrum = .158 + ((note * 7) % 13) * .004;
  const pickup = .31;
  const fundamentalDecay = 2.47 + (note - 40) * .026;
  const maxModes = Math.min(19, Math.floor(rate * .38 / fundamental));

  for (let mode = 1; mode <= maxModes; mode++) {
    const frequency = fundamental * mode * Math.sqrt(1 + .000018 * mode * mode);
    if (frequency >= rate * .42) break;
    const woodenBody = .86 + .21 / (1 + ((frequency - 196) / 112) ** 2)
      + .22 / (1 + ((frequency - 437) / 141) ** 2);
    const pluckShape = Math.sin(Math.PI * mode * plectrum) * Math.sin(Math.PI * mode * pickup);
    const rolloff = 1 / (1 + (frequency / 1880) ** 2);
    let amplitude = .95 * woodenBody * pluckShape * rolloff / mode ** 1.17;
    const decay = Math.exp(-(fundamentalDecay + .91 * (mode - 1) ** 1.29) / rate);
    const angle = tau * frequency / rate;
    const s = Math.sin(angle), c = Math.cos(angle);
    // A small deterministic phase offset leaves soft wooden clicks off the main beat.
    const startPhase = .13 * Math.sin(note * .73 + mode * 1.11);
    let sin = Math.sin(startPhase), cos = Math.cos(startPhase);
    for (let i = 0; i < length; i++) {
      samples[i] += amplitude * sin;
      const nextSin = sin * c + cos * s;
      cos = cos * c - sin * s;
      sin = nextSin;
      amplitude *= decay;
    }
  }

  // Two very short body vibrations carry the pick through small phone speakers.
  for (const [bodyRatio, level, lifetime] of [[1.84, .038, .037], [3.14, .028, .016]] as const) {
    const frequency = fundamental * bodyRatio;
    if (frequency >= rate * .42) continue;
    const stop = Math.min(length, Math.ceil(rate * lifetime * 6));
    const angular = tau * frequency / rate;
    const s = Math.sin(angular), c = Math.cos(angular), attenuation = Math.exp(-1 / (rate * lifetime));
    let sin = 0, cos = 1, amplitude = level;
    for (let i = 0; i < stop; i++) {
      samples[i] += amplitude * sin;
      const nextSin = sin * c + cos * s;
      cos = cos * c - sin * s;
      sin = nextSin;
      amplitude *= attenuation;
    }
  }

  const fadeIn = rate * .008, fadeOut = rate * .116;
  for (let i = 0; i < length; i++) {
    const attack = smooth(Math.min(1, i / fadeIn));
    const release = smooth(Math.min(1, (length - 1 - i) / fadeOut));
    // Rounded analog-style saturation rather than hard clipping.
    const sample = samples[i] * attack * release;
    samples[i] = sample === 0 ? 0 : sample / (1 + .34 * Math.abs(sample));
  }
  return samples;
}
