import { converter } from 'culori';
import { describe, expect, it } from 'vitest';
import { buildGradient, buildLightnesses, colorToHex, describeColor, linspace } from './color';
import type { GradientConfig, RgbaColor } from './types';

const PURPLE: RgbaColor = { r: 123 / 255, g: 94 / 255, b: 241 / 255, a: 1 };
const solidConfig: GradientConfig = {
  mode: 'solid',
  model: 'oklch',
  steps: 10,
  distribution: 'uniform',
};

describe('lightness distribution', () => {
  it('creates inclusive, descending uniform endpoints', () => {
    expect(linspace(0.98, 0.06, 10)).toHaveLength(10);
    const result = buildLightnesses(10, 'uniform', 0.5);
    expect(result.values[0]).toBeCloseTo(0.98);
    expect(result.values[result.values.length - 1]).toBeCloseTo(0.06);
    expect(result.values.every((value, index, list) => index === 0 || list[index - 1] > value)).toBe(true);
  });

  it('places the target at step 5 or 10 for centered scales', () => {
    const ten = buildLightnesses(10, 'centered', 0.62);
    const twenty = buildLightnesses(20, 'centered', 0.62);
    expect(ten.values).toHaveLength(10);
    expect(ten.values[4]).toBeCloseTo(0.62);
    expect(twenty.values).toHaveLength(20);
    expect(twenty.values[9]).toBeCloseTo(0.62);
  });

  it('clamps centered targets outside the fixed range', () => {
    const high = buildLightnesses(10, 'centered', 1);
    const low = buildLightnesses(20, 'centered', 0);
    expect(high.corrected).toBe(true);
    expect(high.values[4]).toBeCloseTo(0.98);
    expect(low.corrected).toBe(true);
    expect(low.values[9]).toBeCloseTo(0.06);
  });
});

describe('gradient generation', () => {
  it('generates OKLCH scales in sRGB with stable naming', () => {
    const result = buildGradient(PURPLE, solidConfig);
    expect(result.stops).toHaveLength(10);
    expect(result.stops.map((stop) => stop.suffix)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (const stop of result.stops) {
      expect(stop.r).toBeGreaterThanOrEqual(0);
      expect(stop.r).toBeLessThanOrEqual(1);
      expect(stop.g).toBeGreaterThanOrEqual(0);
      expect(stop.g).toBeLessThanOrEqual(1);
      expect(stop.b).toBeGreaterThanOrEqual(0);
      expect(stop.b).toBeLessThanOrEqual(1);
      expect(stop.a).toBe(1);
      expect(stop.modelLabel).toMatch(/^OKLCH /);
    }
  });

  it('reduces out-of-gamut chroma instead of clipping channels', () => {
    const vivid: RgbaColor = { r: 1, g: 0, b: 1, a: 1 };
    const result = buildGradient(vivid, solidConfig);
    expect(result.stops.every((stop) => [stop.r, stop.g, stop.b].every((channel) => channel >= 0 && channel <= 1))).toBe(true);
    expect(new Set(result.stops.map((stop) => stop.hex)).size).toBeGreaterThan(5);
  });

  it('keeps HSL hue and saturation through middle tones', () => {
    const result = buildGradient(PURPLE, { ...solidConfig, model: 'hsl' });
    const toHsl = converter('hsl');
    const source = toHsl({ mode: 'rgb', r: PURPLE.r, g: PURPLE.g, b: PURPLE.b });
    const middle = toHsl({ mode: 'rgb', r: result.stops[4].r, g: result.stops[4].g, b: result.stops[4].b });
    expect(middle?.h).toBeCloseTo(source?.h ?? 0, 5);
    expect(middle?.s).toBeCloseTo(source?.s ?? 0, 5);
  });

  it('handles achromatic black and white without NaN values', () => {
    for (const value of [0, 1]) {
      const result = buildGradient({ r: value, g: value, b: value, a: 1 }, solidConfig);
      expect(result.stops).toHaveLength(10);
      expect(result.stops.every((stop) => Number.isFinite(stop.r + stop.g + stop.b))).toBe(true);
    }
  });

  it('uses exact alpha sequences for 10 and 20 steps', () => {
    const ten = buildGradient(PURPLE, { ...solidConfig, mode: 'alpha' });
    const twenty = buildGradient(PURPLE, { ...solidConfig, mode: 'alpha', steps: 20 });
    expect(ten.stops.map((stop) => stop.alphaPercent)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(twenty.stops.map((stop) => stop.alphaPercent)).toEqual(Array.from({ length: 20 }, (_, index) => (index + 1) * 5));
    expect(twenty.stops.every((stop) => stop.hex === '#7B5EF1')).toBe(true);
  });
});

describe('formatting', () => {
  it('formats uppercase hex and readable source labels', () => {
    expect(colorToHex(PURPLE)).toBe('#7B5EF1');
    expect(describeColor(PURPLE, 'oklch')).toMatch(/^OKLCH /);
    expect(describeColor(PURPLE, 'hsl')).toMatch(/^HSL /);
  });
});
