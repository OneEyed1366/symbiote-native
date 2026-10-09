// Раскладка конфига анимации XY и Color по каналам, как `maybeVectorAnim` в RN

import { AnimatedColor } from '../color';
import { AnimatedNode } from '../graph';
import { isRecord } from '../../type-guards';
import type { AnimatedValue } from '../value';
import { AnimatedValueXY } from '../value-xy';

export type IVectorValue = AnimatedValueXY | AnimatedColor;

// Цель по числу или узлу на канал, подходят и `AnimatedValueXY`, и `AnimatedColor`
export type IVectorTarget =
  | { readonly x: number | AnimatedNode; readonly y: number | AnimatedNode }
  | {
      readonly r: number | AnimatedNode;
      readonly g: number | AnimatedNode;
      readonly b: number | AnimatedNode;
      readonly a: number | AnimatedNode;
    };

// Параметр по каналам, например `velocity`
export type IVectorNumbers = Readonly<Record<string, number>>;

export type IChannelPart<TConfig> = {
  readonly value: AnimatedValue;
  readonly config: TConfig;
};

function channelsOf(value: IVectorValue): Record<string, AnimatedValue> {
  if (value instanceof AnimatedValueXY) return { x: value.x, y: value.y };
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

// Ключ вида `{x, y}` отдаёт свой канал, остальные ключи общие для всех каналов
function configForChannel(
  config: Record<string, unknown>,
  channel: string,
  channelNames: readonly string[],
): Record<string, unknown> {
  const out = { ...config };
  for (const key of Object.keys(config)) {
    const entry = config[key];
    const isPerChannel =
      isRecord(entry) && channelNames.every(name => entry[name] !== undefined);
    if (isPerChannel) out[key] = entry[channel];
  }
  return out;
}

// Скалярному конфигу `toValue` не нужен или это число и узел, вектор здесь не бывает
export function hasScalarTarget(candidate: unknown): boolean {
  const target = isRecord(candidate) ? Reflect.get(candidate, 'toValue') : null;
  return target instanceof AnimatedNode || !isRecord(target);
}

// У скалярного распада `velocity` число
export function hasScalarVelocity(candidate: unknown): boolean {
  const velocity = isRecord(candidate)
    ? Reflect.get(candidate, 'velocity')
    : null;
  return typeof velocity === 'number';
}

export function splitChannels<TConfig>(
  value: IVectorValue,
  config: object,
  isScalarConfig: (candidate: unknown) => candidate is TConfig,
): IChannelPart<TConfig>[] {
  const channels = channelsOf(value);
  const channelNames = Object.keys(channels);
  const base: Record<string, unknown> = Object.fromEntries(
    Object.entries(config),
  );
  return Object.entries(channels).map(([channel, channelValue]) => {
    const scalar = configForChannel(base, channel, channelNames);
    if (!isScalarConfig(scalar))
      throw new Error(`Animated: invalid config for the ${channel} channel`);
    return { value: channelValue, config: scalar };
  });
}
