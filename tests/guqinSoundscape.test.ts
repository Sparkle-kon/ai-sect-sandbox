import {describe, expect, it} from 'vitest';
import {GUQIN_PHRASES, renderGuqinNote} from '../src/engine/guqinSoundscape';

const rms = (data: Float32Array) =>
  Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
function toneEnergy(data: Float32Array, rate: number, frequency: number, start: number, stop: number) {
  const angular = 2 * Math.PI * frequency / rate;
  let real = 0, imaginary = 0;
  for (let i = start; i < stop; i++) {
    real += data[i] * Math.cos(i * angular);
    imaginary += data[i] * Math.sin(i * angular);
  }
  return Math.hypot(real, imaginary) / (stop - start);
}

describe('original quiet guqin score and dry plucks', () => {
  it('uses four varied, softly landed phrases and an audible break across the loop', () => {
    const durations = GUQIN_PHRASES.map(({delayMs}) => delayMs);
    const duration = durations.reduce((sum, delay) => sum + delay, 0);
    expect(duration).toBeGreaterThanOrEqual(40_000);
    expect(duration).toBeLessThanOrEqual(60_000);
    expect(new Set(durations).size).toBeGreaterThan(12);
    expect(GUQIN_PHRASES.filter(({delayMs, notes}) => delayMs > 2500 && notes.length)).toHaveLength(4);
    expect(GUQIN_PHRASES.at(-1)?.notes).toEqual([]);
    const duals = GUQIN_PHRASES.filter(({notes}) => notes.length === 2);
    expect(duals.length).toBeGreaterThan(0);
    expect(duals.length).toBeLessThan(4);
    for (const {delayMs, notes} of GUQIN_PHRASES) {
      expect(delayMs).toBeGreaterThan(600);
      expect(notes.length).toBeLessThanOrEqual(2);
      for (const {midi, velocity, offsetMs} of notes) {
        expect([2, 4, 6, 9, 11]).toContain(midi % 12);
        expect(midi).toBeGreaterThanOrEqual(45);
        expect(midi).toBeLessThanOrEqual(66);
        expect(velocity).toBeGreaterThan(0);
        expect(velocity).toBeLessThan(.8);
        expect(offsetMs ?? 0).toBeLessThan(70);
      }
    }
  });

  it('synthesizes finite, repeatable, clean endpoints and a held usable pitch at different output rates', () => {
    for (const rate of [8000, 24000, 44100]) {
      const data = renderGuqinNote(50, rate);
      expect(data).toEqual(renderGuqinNote(50, rate));
      expect(data.length / rate).toBeCloseTo(2.16, 3);
      expect(data[0]).toBe(0);
      expect(data.at(-1)).toBe(0);
      expect(data.every(value => Number.isFinite(value) && Math.abs(value) < .75)).toBe(true);
      expect(rms(data.subarray(0, Math.round(rate * .3)))).toBeGreaterThan(.15);
      expect(rms(data.subarray(data.length - Math.round(rate * .2)))).toBeLessThan(.006);
      const from = Math.round(rate * .3), to = Math.round(rate * .55);
      const pitch = 440 * 2 ** ((50 - 69) / 12);
      const fundamental = toneEnergy(data, rate, pitch, from, to);
      expect(fundamental).toBeGreaterThan(.05);
      expect(fundamental).toBeGreaterThan(7 * toneEnergy(data, rate, pitch * 7, from, to));
      expect(fundamental).toBeGreaterThan(6 * toneEnergy(data, rate, 415, from, to));
    }
    expect(renderGuqinNote(Number.NaN, 44100)).toHaveLength(0);
    expect(renderGuqinNote(50, 240000)).toHaveLength(0);
  });
});
