import { converter, displayable } from 'culori';
import type {
  ColorModel,
  GradientConfig,
  GradientResult,
  GradientStop,
  RgbaColor,
  StepCount,
} from './types';
import { buildSuffixes } from './naming';

const toRgb = converter('rgb');
const toOklch = converter('oklch');
const toHsl = converter('hsl');
const MIN_LIGHTNESS = 0.06;
const MAX_LIGHTNESS = 0.98;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function clean(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '');
}

export function colorToHex(color: Pick<RgbaColor, 'r' | 'g' | 'b'>): string {
  const channel = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
}

export function linspace(start: number, end: number, count: number): number[] {
  if (count <= 1) return [start];
  return Array.from({ length: count }, (_, index) => start + (end - start) * (index / (count - 1)));
}

export function buildLightnesses(
  steps: StepCount,
  distribution: 'uniform' | 'centered',
  targetLightness: number,
): { values: number[]; corrected: boolean } {
  if (distribution === 'uniform') {
    const values = linspace(MAX_LIGHTNESS, MIN_LIGHTNESS, steps);
    const targetIndex = values.reduce(
      (closestIndex, value, index) =>
        Math.abs(value - targetLightness) < Math.abs(values[closestIndex] - targetLightness)
          ? index
          : closestIndex,
      0,
    );
    values[targetIndex] = targetLightness;
    return { values, corrected: false };
  }

  const target = clamp(targetLightness, MIN_LIGHTNESS, MAX_LIGHTNESS);
  const lightCount = steps === 10 ? 5 : 10;
  const darkCount = steps === 10 ? 6 : 11;
  return {
    values: [
      ...linspace(MAX_LIGHTNESS, target, lightCount),
      ...linspace(target, MIN_LIGHTNESS, darkCount).slice(1),
    ],
    corrected: Math.abs(target - targetLightness) > 1e-7,
  };
}

function rgbColor(value: ReturnType<typeof toRgb>, alpha = 1): RgbaColor {
  if (!value || value.mode !== 'rgb') throw new Error('颜色转换失败');
  return {
    r: clamp(value.r ?? 0),
    g: clamp(value.g ?? 0),
    b: clamp(value.b ?? 0),
    a: clamp(alpha),
  };
}

function oklchInSrgb(l: number, c: number, h: number): RgbaColor {
  const normalizedHue = Number.isFinite(h) ? h : 0;
  const candidate = { mode: 'oklch' as const, l, c: Math.max(0, c), h: normalizedHue };
  if (displayable(candidate)) return rgbColor(toRgb(candidate));

  let low = 0;
  let high = Math.max(0, c);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (displayable({ ...candidate, c: middle })) low = middle;
    else high = middle;
  }
  return rgbColor(toRgb({ ...candidate, c: low }));
}

function solidStop(
  base: RgbaColor,
  model: ColorModel,
  lightness: number,
  index: number,
  suffix: number,
): GradientStop {
  if (model === 'oklch') {
    const source = toOklch({ mode: 'rgb', r: base.r, g: base.g, b: base.b });
    if (!source || source.mode !== 'oklch') throw new Error('无法读取 OKLCH 色值');
    const c = Number.isFinite(source.c) ? source.c : 0;
    const h = Number.isFinite(source.h ?? Number.NaN) ? source.h ?? 0 : 0;
    const rgb = oklchInSrgb(lightness, c, h);
    return {
      ...rgb,
      index,
      suffix,
      hex: colorToHex(rgb),
      modelLabel: `OKLCH ${clean(lightness * 100, 1)} ${clean(c, 3)} ${clean(h, 1)}`,
      alphaPercent: 100,
    };
  }

  const source = toHsl({ mode: 'rgb', r: base.r, g: base.g, b: base.b });
  if (!source || source.mode !== 'hsl') throw new Error('无法读取 HSL 色值');
  const h = Number.isFinite(source.h ?? Number.NaN) ? source.h ?? 0 : 0;
  const s = Number.isFinite(source.s) ? source.s : 0;
  const rgb = rgbColor(toRgb({ mode: 'hsl', h, s, l: lightness }));
  return {
    ...rgb,
    index,
    suffix,
    hex: colorToHex(rgb),
    modelLabel: `HSL ${clean(h, 1)} ${clean(s * 100, 1)}% ${clean(lightness * 100, 1)}%`,
    alphaPercent: 100,
  };
}

function sourceLightness(base: RgbaColor, model: ColorModel): number {
  const color = { mode: 'rgb' as const, r: base.r, g: base.g, b: base.b };
  const converted = model === 'oklch' ? toOklch(color) : toHsl(color);
  if (!converted || !('l' in converted) || typeof converted.l !== 'number') {
    throw new Error('无法读取基准色明度');
  }
  return converted.l;
}

function originalStop(
  base: RgbaColor,
  model: ColorModel,
  index: number,
  suffix: number,
): GradientStop {
  const rgb = { r: clamp(base.r), g: clamp(base.g), b: clamp(base.b), a: 1 };
  return {
    ...rgb,
    index,
    suffix,
    hex: colorToHex(rgb),
    modelLabel: describeColor(rgb, model),
    alphaPercent: 100,
  };
}

export function buildGradient(base: RgbaColor, config: GradientConfig): GradientResult {
  const suffixes = buildSuffixes(config.steps);
  if (config.mode === 'alpha') {
    const increment = config.steps === 10 ? 0.1 : 0.05;
    return {
      targetLightnessCorrected: false,
      stops: suffixes.map((suffix, index) => {
        const alpha = increment * (index + 1);
        const rgb = { r: clamp(base.r), g: clamp(base.g), b: clamp(base.b), a: alpha };
        return {
          ...rgb,
          index,
          suffix,
          hex: colorToHex(rgb),
          modelLabel: colorToHex(rgb),
          alphaPercent: Math.round(alpha * 100),
        };
      }),
    };
  }

  const baseLightness = sourceLightness(base, config.model);
  const lightness = buildLightnesses(
    config.steps,
    config.distribution,
    baseLightness,
  );
  return {
    targetLightnessCorrected: lightness.corrected,
    stops: lightness.values.map((value, index) => {
      if (config.distribution === 'uniform' && value === baseLightness) {
        return originalStop(base, config.model, index, suffixes[index]);
      }
      return solidStop(base, config.model, value, index, suffixes[index]);
    }),
  };
}

export function describeColor(base: RgbaColor, model: ColorModel): string {
  const color = { mode: 'rgb' as const, r: base.r, g: base.g, b: base.b };
  if (model === 'oklch') {
    const value = toOklch(color);
    if (!value || value.mode !== 'oklch') return colorToHex(base);
    const h = Number.isFinite(value.h ?? Number.NaN) ? value.h ?? 0 : 0;
    return `OKLCH ${clean(value.l * 100, 1)} ${clean(value.c, 3)} ${clean(h, 1)}`;
  }
  const value = toHsl(color);
  if (!value || value.mode !== 'hsl') return colorToHex(base);
  const h = Number.isFinite(value.h ?? Number.NaN) ? value.h ?? 0 : 0;
  return `HSL ${clean(h, 1)} ${clean(value.s * 100, 1)}% ${clean(value.l * 100, 1)}%`;
}
