// Dev-проверка формы события против маппинга `Animated.event`, как `validateMapping` в RN

import { isRecord } from '../type-guards';
import { AnimatedNode } from './graph';

function isValueNode(mapping: unknown): boolean {
  return (
    mapping instanceof AnimatedNode &&
    typeof Reflect.get(mapping, 'setValue') === 'function'
  );
}

function isVectorMapping(mapping: unknown): boolean {
  return (
    isRecord(mapping) &&
    !(mapping instanceof AnimatedNode) &&
    Reflect.get(mapping, 'x') instanceof AnimatedNode &&
    Reflect.get(mapping, 'y') instanceof AnimatedNode
  );
}

function hasNumericXY(evt: unknown): boolean {
  return (
    isRecord(evt) &&
    typeof Reflect.get(evt, 'x') === 'number' &&
    typeof Reflect.get(evt, 'y') === 'number'
  );
}

function validate(mapping: unknown, evt: unknown, key: string): void {
  if (isValueNode(mapping)) {
    if (typeof evt !== 'number') {
      throw new Error(
        `Bad mapping of event key ${key}, should be number but got ${typeof evt}`,
      );
    }
    return;
  }
  if (isVectorMapping(mapping)) {
    if (!hasNumericXY(evt)) {
      throw new Error(
        `Bad mapping of event key ${key}, should be XY but got ${String(evt)}`,
      );
    }
    return;
  }
  if (typeof evt === 'number') {
    throw new Error(
      `Bad mapping of type ${typeof mapping} for key ${key}, event value must map to AnimatedValue`,
    );
  }
  if (typeof mapping !== 'object') {
    throw new Error(`Bad mapping of type ${typeof mapping} for key ${key}`);
  }
  if (typeof evt !== 'object') {
    throw new Error(`Bad event of type ${typeof evt} for key ${key}`);
  }
  if (!isRecord(mapping)) return;
  for (const mappingKey of Object.keys(mapping)) {
    validate(
      Reflect.get(mapping, mappingKey),
      isRecord(evt) ? Reflect.get(evt, mappingKey) : undefined,
      mappingKey,
    );
  }
}

export function validateMapping(
  argMapping: readonly unknown[],
  args: readonly unknown[],
): void {
  if (args.length < argMapping.length) {
    throw new Error('Event has less arguments than mapping');
  }
  argMapping.forEach((mapping, idx) => {
    validate(mapping, args[idx], `arg${idx}`);
  });
}
