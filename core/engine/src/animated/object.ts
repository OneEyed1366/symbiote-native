// AnimatedObject из RN: узел для анимированных значений внутри произвольных объектов и массивов
// Нужен `AnimatedStyle` и `AnimatedProps`, например для `shadowOffset: {width: anim}`

import { AnimatedNode, AnimatedWithChildren } from './graph';
import type {
  INativeNodeConfig,
  IPlatformConfig,
} from './native/native-animated';

// Глубже этого значения анимированные узлы не ищем
const MAX_DEPTH = 5;

// Обходим обычные объекты, экземпляры классов и React-элементы пропускаем
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  const isPlainProto = proto === null || proto === Object.prototype;
  return isPlainProto && !('$$typeof' in value);
}

function flatAnimatedNodes(
  value: unknown,
  nodes: AnimatedNode[] = [],
  depth = 0,
): AnimatedNode[] {
  if (depth >= MAX_DEPTH) return nodes;
  if (value instanceof AnimatedNode) {
    nodes.push(value);
  } else if (Array.isArray(value)) {
    for (const element of value) flatAnimatedNodes(element, nodes, depth + 1);
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      flatAnimatedNodes(value[key], nodes, depth + 1);
    }
  }
  return nodes;
}

function mapAnimatedNodes(
  value: unknown,
  mapNode: (node: AnimatedNode) => unknown,
  depth = 0,
): unknown {
  if (depth >= MAX_DEPTH) return value;
  if (value instanceof AnimatedNode) return mapNode(value);
  if (Array.isArray(value)) {
    return value.map(element => mapAnimatedNodes(element, mapNode, depth + 1));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = mapAnimatedNodes(value[key], mapNode, depth + 1);
    }
    return result;
  }
  return value;
}

// Сам анимированный узел или узел для вложенного объекта, `undefined` если анимации нет
export function animatedNodeOrObject(value: unknown): AnimatedNode | undefined {
  return value instanceof AnimatedNode ? value : AnimatedObject.from(value);
}

export class AnimatedObject extends AnimatedWithChildren {
  private readonly nodes: readonly AnimatedNode[];
  private readonly value: unknown;

  // Узел создаётся, только если внутри `value` есть анимированные значения
  static from(value: unknown): AnimatedObject | undefined {
    const nodes = flatAnimatedNodes(value);
    return nodes.length === 0 ? undefined : new AnimatedObject(nodes, value);
  }

  constructor(nodes: readonly AnimatedNode[], value: unknown) {
    super();
    this.nodes = nodes;
    this.value = value;
  }

  override __getValue(): unknown {
    return mapAnimatedNodes(this.value, node => node.__getValue());
  }

  override __getAnimatedValue(): unknown {
    return mapAnimatedNodes(this.value, node => node.__getAnimatedValue());
  }

  override __attach(): void {
    for (const node of this.nodes) node.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    for (const node of this.nodes) node.__removeChild(this);
    super.__detach();
  }

  override __makeNative(platformConfig?: IPlatformConfig): void {
    for (const node of this.nodes) node.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }

  override __getNativeConfig(): INativeNodeConfig {
    return {
      type: 'object',
      value: mapAnimatedNodes(this.value, node => ({
        nodeTag: node.__getNativeTag(),
      })),
    };
  }
}
