// Ядро `LinearGradient`, порт `LinearGradient.tsx` из expo-linear-gradient
import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDescriptor,
  IResponderProps,
} from '@symbiote-native/components';
import {
  expoViewManagerName,
  flattenStyle,
  processColor,
  styleOfProps,
  tryRegisterNativeView,
} from '@symbiote-native/engine';
import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export const LINEAR_GRADIENT_MODULE_NAME = 'ExpoLinearGradient';

export type INativeLinearGradientPoint = [x: number, y: number];

/** Доли размера градиента от 0 до 1, объект `{ x, y }` или пара `[x, y]` */
export type ILinearGradientPoint =
  { x: number; y: number } | INativeLinearGradientPoint;

export type ILinearGradientProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** Минимум два цвета, для одного используйте `style.backgroundColor` у View */
    colors: readonly [IColorValue, IColorValue, ...IColorValue[]];
    /** Позиции остановок от 0 до 1 по возрастанию, той же длины, что и `colors` */
    locations?: readonly [number, number, ...number[]] | null;
    /** @default { x: 0.5, y: 0.0 } */
    start?: ILinearGradientPoint | null;
    /** @default { x: 0.5, y: 1.0 } */
    end?: ILinearGradientPoint | null;
    /**
     * Дизеринг убирает полосы в градиенте, false может ускорить отрисовку
     * @default true
     * @platform android
     */
    dither?: boolean;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

// Эти ключи разбираются здесь, остальное уходит на хост как есть
const GRADIENT_KEYS: ReadonlySet<string> = new Set<keyof ILinearGradientProps>([
  'colors',
  'locations',
  'start',
  'end',
  'dither',
]);

const ABSOLUTE_FILL = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

export function linearGradientViewName(): string {
  return expoViewManagerName(LINEAR_GRADIENT_MODULE_NAME);
}

// Регистрирует view config в реестре RN, из него движок берёт события и процессоры пропсов
// Зовётся при рендере, а не при импорте: регистрация в побочном эффекте барреля теряется в release
export function ensureLinearGradientRegistered(): boolean {
  return tryRegisterNativeView(() =>
    requireNativeViewManager(LINEAR_GRADIENT_MODULE_NAME),
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function normalizePoint(
  point: unknown,
): INativeLinearGradientPoint | undefined {
  if (!point) return undefined;
  if (Array.isArray(point)) {
    const [x, y] = point;
    if (point.length === 2 && isNumber(x) && isNumber(y)) return [x, y];
    console.warn(
      'start and end props for LinearGradient must be of the format [x,y] or {x, y}',
    );
    return undefined;
  }
  const x: unknown = Reflect.get(Object(point), 'x');
  const y: unknown = Reflect.get(Object(point), 'y');
  return isNumber(x) && isNumber(y) ? [x, y] : undefined;
}

function resolveLocations(
  colors: readonly unknown[],
  locations: unknown,
): readonly number[] | undefined {
  if (!Array.isArray(locations)) return undefined;
  if (locations.length === colors.length) return locations;
  console.warn(
    'LinearGradient colors and locations props should be arrays of the same length',
  );
  return locations.slice(0, colors.length);
}

function radiusOr(value: unknown, fallback: number): number {
  return isNumber(value) ? value : fallback;
}

// Формат из `Path.addRoundRect`: по два значения на угол, начиная с верхнего левого
function borderRadiiOf(style: unknown): number[] {
  const flat = flattenStyle(style) ?? {};
  const base = radiusOr(flat.borderRadius, 0);
  const topLeft = radiusOr(flat.borderTopLeftRadius, base);
  const topRight = radiusOr(flat.borderTopRightRadius, base);
  const bottomRight = radiusOr(flat.borderBottomRightRadius, base);
  const bottomLeft = radiusOr(flat.borderBottomLeftRadius, base);
  return [
    topLeft,
    topLeft,
    topRight,
    topRight,
    bottomRight,
    bottomRight,
    bottomLeft,
    bottomLeft,
  ];
}

function withoutUndefined(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  );
}

// `object`, а не тип пропсов: Vue и Angular отдают нетипизированный набор атрибутов
export function renderLinearGradient(props: object): IDescriptor {
  const hostProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !GRADIENT_KEYS.has(key)),
  );
  if (!ensureLinearGradientRegistered()) {
    console.warn('LinearGradient is not available on this platform');
    return el('view', hostProps);
  }

  const colors: unknown = Reflect.get(props, 'colors');
  const colorList = Array.isArray(colors) ? colors : [];
  const nativeProps = withoutUndefined({
    colors: colorList.map(color => processColor(color)),
    locations: resolveLocations(colorList, Reflect.get(props, 'locations')),
    startPoint: normalizePoint(Reflect.get(props, 'start')),
    endPoint: normalizePoint(Reflect.get(props, 'end')),
  });

  if (!Platform.select({ android: true, default: false })) {
    return el(linearGradientViewName(), { ...hostProps, ...nativeProps });
  }

  // Нативный градиент заполняет View и сам скругляет углы, т.к. RN не обрезает по радиусу
  const native = el(
    linearGradientViewName(),
    withoutUndefined({
      ...nativeProps,
      style: ABSOLUTE_FILL,
      borderRadii: borderRadiiOf(styleOfProps(props)),
      dither: Reflect.get(props, 'dither'),
    }),
  );
  return el('view', hostProps, [native]);
}
