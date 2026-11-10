// Interpolation из `AnimatedInterpolation.js` RN: числовой диапазон, строки с единицами и цвета
// Строки разбираются на числовые токены, интерполируются по одному и собираются обратно

import { processColor, type IOpaqueColorValue } from '../platform-color';
import { normalizeColor, type IRgbaValue } from './rgba';
import { Easing, type IEasingFunction } from './easing';

export type IExtrapolateType = 'extend' | 'identity' | 'clamp';

export type IInterpolationConfig = {
  inputRange: readonly number[];
  outputRange:
    readonly number[] | readonly string[] | readonly IOpaqueColorValue[];
  easing?: IEasingFunction;
  extrapolate?: IExtrapolateType;
  extrapolateLeft?: IExtrapolateType;
  extrapolateRight?: IExtrapolateType;
};

// Числовой вариант, его же строят для каждого токена строки
type INumericInterpolationConfig = Omit<IInterpolationConfig, 'outputRange'> & {
  outputRange: readonly number[];
};

type ISegment = {
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
};

type ICurve = {
  easing: IEasingFunction;
  extrapolateLeft: IExtrapolateType;
  extrapolateRight: IExtrapolateType;
};

const ALPHA_PRECISION = 1_000;

// За пределом диапазона `identity` отдаёт сам вход
function isIdentity(input: number, segment: ISegment, curve: ICurve): boolean {
  const isBelow = input < segment.inputMin;
  const isAbove = input > segment.inputMax;
  return (
    (isBelow && curve.extrapolateLeft === 'identity') ||
    (isAbove && curve.extrapolateRight === 'identity')
  );
}

function clampToSegment(
  input: number,
  segment: ISegment,
  curve: ICurve,
): number {
  if (input < segment.inputMin && curve.extrapolateLeft === 'clamp') {
    return segment.inputMin;
  }
  if (input > segment.inputMax && curve.extrapolateRight === 'clamp') {
    return segment.inputMax;
  }
  return input;
}

// Бесконечные границы сегмента нормализуются без деления
function normalize(value: number, { inputMin, inputMax }: ISegment): number {
  if (inputMin === -Infinity) return -value;
  if (inputMax === Infinity) return value - inputMin;
  return (value - inputMin) / (inputMax - inputMin);
}

function project(eased: number, { outputMin, outputMax }: ISegment): number {
  if (outputMin === -Infinity) return -eased;
  if (outputMax === Infinity) return eased + outputMin;
  return eased * (outputMax - outputMin) + outputMin;
}

function interpolateSegment(
  input: number,
  segment: ISegment,
  curve: ICurve,
): number {
  if (isIdentity(input, segment, curve)) return input;
  const clamped = clampToSegment(input, segment, curve);
  if (segment.outputMin === segment.outputMax) return segment.outputMin;
  if (segment.inputMin === segment.inputMax) {
    return input <= segment.inputMin ? segment.outputMin : segment.outputMax;
  }
  return project(curve.easing(normalize(clamped, segment)), segment);
}

function findRange(input: number, inputRange: readonly number[]): number {
  let i = 1;
  for (; i < inputRange.length - 1; ++i) {
    if (inputRange[i] >= input) break;
  }
  return i - 1;
}

function checkValidInputRange(arr: readonly number[]): void {
  if (arr.length < 2)
    throw new Error('inputRange must have at least 2 elements');
  for (let i = 1; i < arr.length; ++i) {
    if (!(arr[i] >= arr[i - 1])) {
      throw new Error(
        `inputRange must be monotonically non-decreasing ${String(arr)}`,
      );
    }
  }
}

function checkInfiniteRange(name: string, arr: readonly unknown[]): void {
  if (arr.length < 2) throw new Error(`${name} must have at least 2 elements`);
  if (arr.length === 2 && arr[0] === -Infinity && arr[1] === Infinity) {
    throw new Error(`${name} cannot be ]-infinity;+infinity[ ${String(arr)}`);
  }
}

export function checkValidRanges(
  inputRange: readonly number[],
  outputRange: readonly unknown[],
): void {
  checkInfiniteRange('outputRange', outputRange);
  checkInfiniteRange('inputRange', inputRange);
  checkValidInputRange(inputRange);
  if (inputRange.length !== outputRange.length) {
    throw new Error(
      `inputRange (${inputRange.length}) and outputRange (${outputRange.length}) must have the same length`,
    );
  }
}

export function createNumericInterpolation(
  config: INumericInterpolationConfig,
): (input: number) => number {
  const { inputRange, outputRange } = config;
  const curve: ICurve = {
    easing: config.easing ?? Easing.linear,
    extrapolateLeft: config.extrapolateLeft ?? config.extrapolate ?? 'extend',
    extrapolateRight: config.extrapolateRight ?? config.extrapolate ?? 'extend',
  };

  return input => {
    const range = findRange(input, inputRange);
    const segment: ISegment = {
      inputMin: inputRange[range],
      inputMax: inputRange[range + 1],
      outputMin: outputRange[range],
      outputMax: outputRange[range + 1],
    };
    return interpolateSegment(input, segment, curve);
  };
}

// Платформенные цвета нельзя смешать в JS, берём ближайший и предупреждаем
function createPlatformColorInterpolation(
  config: IInterpolationConfig,
  outputRange: readonly IOpaqueColorValue[],
): (input: number) => IOpaqueColorValue {
  const interpolateIndex = createNumericInterpolation({
    ...config,
    outputRange: outputRange.map((_, index) => index),
  });
  return input => {
    const index = interpolateIndex(input);
    if (!Number.isInteger(index)) {
      console.warn(
        'PlatformColor interpolation should happen natively, here we fallback to the closest color',
      );
    }
    return outputRange[Math.floor(index)];
  };
}

// Одно число: знак, дробь и экспонента, остальной текст остаётся шаблоном
const numericComponentRegex = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

type IColorComponents = {
  isColor: true;
  components: [number, number, number, number];
};
// Числа вперемешку с литералами между ними
type ITemplateComponents = {
  isColor: false;
  components: ReadonlyArray<number | string>;
};

// Цвет схлопывается в четыре канала через общий декодер `rgba.ts`, остальное в числа и шаблон
function mapStringToNumericComponents(
  input: string,
): IColorComponents | ITemplateComponents {
  const color: IRgbaValue | undefined = normalizeColor(input);
  if (color !== undefined) {
    return { isColor: true, components: [color.r, color.g, color.b, color.a] };
  }

  const components: Array<number | string> = [];
  let lastMatchEnd = 0;
  let match: RegExpExecArray | null;
  numericComponentRegex.lastIndex = 0;
  while ((match = numericComponentRegex.exec(input)) !== null) {
    if (match.index > lastMatchEnd) {
      components.push(input.substring(lastMatchEnd, match.index));
    }
    components.push(Number.parseFloat(match[0]));
    lastMatchEnd = match.index + match[0].length;
  }
  if (components.length === 0) {
    throw new Error(
      'outputRange must contain color or value with numeric component',
    );
  }
  if (lastMatchEnd < input.length) {
    components.push(input.substring(lastMatchEnd));
  }
  return { isColor: false, components };
}

// RN проверяет в dev, что элементы диапазона одного вида и одной формы
function validateDecomposed(
  decomposed: ReadonlyArray<IColorComponents | ITemplateComponents>,
): void {
  const first = decomposed[0];
  if (!decomposed.every(output => output.isColor === first.isColor)) {
    throw new Error(
      'All elements of output range should either be a color or a string with numeric components',
    );
  }
  if (
    !decomposed.every(
      output => output.components.length === first.components.length,
    )
  ) {
    throw new Error(
      'All elements of output range should have the same number of components',
    );
  }
  const hasSameLiterals = decomposed.every(output =>
    output.components.every(
      (component, i) =>
        typeof component === 'number' || component === first.components[i],
    ),
  );
  if (!hasSameLiterals) {
    throw new Error(
      'All elements of output range should have the same non-numeric components',
    );
  }
}

// Интерполяция для каждой позиции числа во всех строках диапазона
function tokenInterpolations(
  config: IInterpolationConfig,
  decomposed: ReadonlyArray<IColorComponents | ITemplateComponents>,
): Array<(input: number) => number> {
  const numericComponents: ReadonlyArray<ReadonlyArray<number>> =
    decomposed.map(output =>
      output.isColor
        ? output.components
        : output.components.filter((c): c is number => typeof c === 'number'),
    );
  return numericComponents[0].map((_, tokenIndex) =>
    createNumericInterpolation({
      inputRange: config.inputRange,
      outputRange: numericComponents.map(components => components[tokenIndex]),
      easing: config.easing,
      extrapolate: config.extrapolate,
      extrapolateLeft: config.extrapolateLeft,
      extrapolateRight: config.extrapolateRight,
    }),
  );
}

// '0deg' -> '360deg' даёт '180deg', '#000000' -> '#ffffff' даёт 'rgba(128, 128, 128, 1)'
function createStringInterpolation(
  config: IInterpolationConfig,
  outputRange: readonly string[],
): (input: number) => string {
  if (outputRange.length < 2) throw new Error('Bad output range');
  const decomposed = outputRange.map(mapStringToNumericComponents);
  validateDecomposed(decomposed);
  const interpolations = tokenInterpolations(config, decomposed);

  const template = decomposed[0];
  if (!template.isColor) {
    return input => {
      const values = interpolations.map(interpolation => interpolation(input));
      let i = 0;
      return template.components
        .map(c => (typeof c === 'number' ? values[i++] : c))
        .join('');
    };
  }

  // r, g, b целые, альфа округляется до тысячных, как в RN
  return input => {
    const channels = interpolations.map((interpolation, i) => {
      const value = interpolation(input);
      return i < 3
        ? Math.round(value)
        : Math.round(value * ALPHA_PRECISION) / ALPHA_PRECISION;
    });
    return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${channels[3]})`;
  };
}

function isStringOutputRange(
  outputRange: IInterpolationConfig['outputRange'],
): outputRange is readonly string[] {
  return typeof outputRange[0] === 'string';
}

function isOpaqueOutputRange(
  outputRange: IInterpolationConfig['outputRange'],
): outputRange is readonly IOpaqueColorValue[] {
  return typeof outputRange[0] === 'object';
}

// Вид интерполяции выбирается по первому элементу выходного диапазона, как в RN
export function createInterpolation(
  config: IInterpolationConfig,
): (input: number) => number | string | IOpaqueColorValue {
  const { outputRange } = config;
  if (isStringOutputRange(outputRange)) {
    return createStringInterpolation(config, outputRange);
  }
  if (isOpaqueOutputRange(outputRange)) {
    return createPlatformColorInterpolation(config, outputRange);
  }
  return createNumericInterpolation({ ...config, outputRange });
}

// Нативный драйвер ждёт градусы и радианы числом в радианах
export function transformDataType(value: number | string): number | string {
  if (typeof value !== 'string') return value;
  if (value.endsWith('deg')) {
    return ((Number.parseFloat(value) || 0) * Math.PI) / 180;
  }
  if (value.endsWith('rad')) return Number.parseFloat(value) || 0;
  return value;
}

type INativeOutput = {
  outputRange: readonly unknown[];
  outputType: 'color' | 'platform_color' | null;
};

// Что уходит в native: цвета числами с `outputType`, углы в радианах, платформенные цвета как есть
export function nativeOutput(
  outputRange: IInterpolationConfig['outputRange'],
): INativeOutput {
  if (isStringOutputRange(outputRange)) {
    const processed = outputRange.map(value => processColor(value));
    return {
      outputRange: outputRange.map((value, i) => {
        const color = processed[i];
        return typeof color === 'number' ? color : transformDataType(value);
      }),
      outputType: processed.some(color => typeof color === 'number')
        ? 'color'
        : null,
    };
  }
  const isPlatform = isOpaqueOutputRange(outputRange);
  return { outputRange, outputType: isPlatform ? 'platform_color' : null };
}
