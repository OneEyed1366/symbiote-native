// AnimatedStyle / AnimatedTransform: graph nodes that flatten a `style` /
// `transform` whose entries may themselves be AnimatedNodes. Ported from RN's
// AnimatedStyle.js + AnimatedTransform.js, NUMERIC path only: the native-driver
// config (__makeNative / __getNativeConfig / allowlist) and the web/string/color
// branches are stripped. On __getValue() each node re-pulls its
// animated entries into a plain flat object the props leaf hoists onto the view.

import { AnimatedNode, AnimatedWithChildren } from './graph';
import { animatedNodeOrObject } from './object';
import { flattenStyle } from '../style';
import type { INativeNodeConfig } from './native/native-animated';
import { validateStyles, validateTransform } from './native/validation';

// A transform entry is a single-key object: `{ translateX: <number|node> }`.
// We only walk the first level (the value of the one key), matching RN.
type ITransformEntry = Record<string, unknown>;

function isAnimatedNode(value: unknown): value is AnimatedNode {
  return value instanceof AnimatedNode;
}

// Normalize an angle string to radians so native gets a plain number (RN's
// transformDataType). Anything else passes through untouched.
function transformDataType(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.endsWith('deg')) return ((parseFloat(value) || 0) * Math.PI) / 180;
  if (value.endsWith('rad')) return parseFloat(value) || 0;
  return value;
}

// Значение вида `translate: [x, y]` держит узлы внутри массива, оборачиваем его в `AnimatedObject`
function withObjectNodes(entry: ITransformEntry): ITransformEntry {
  const out: ITransformEntry = {};
  for (const key of Object.keys(entry)) {
    out[key] = animatedNodeOrObject(entry[key]) ?? entry[key];
  }
  return out;
}

// Collect the AnimatedNodes nested directly under a list of transform entries,
// so __attach can subscribe to each and a value change reaches this node.
function animatedNodesInTransforms(
  transforms: readonly ITransformEntry[],
): AnimatedNode[] {
  const nodes: AnimatedNode[] = [];
  for (const entry of transforms) {
    for (const key of Object.keys(entry)) {
      const value = entry[key];
      if (isAnimatedNode(value)) nodes.push(value);
    }
  }
  return nodes;
}

export class AnimatedTransform extends AnimatedWithChildren {
  private readonly nodes: readonly AnimatedNode[];
  private readonly transforms: readonly ITransformEntry[];

  // Returns an AnimatedTransform only if at least one entry is animated;
  // otherwise the transform is fully static and needs no graph node.
  static from(transforms: unknown): AnimatedTransform | undefined {
    if (!Array.isArray(transforms)) return undefined;
    const entries: ITransformEntry[] = [];
    for (const entry of transforms) {
      if (typeof entry === 'object' && entry !== null)
        entries.push(withObjectNodes(entry));
    }
    const nodes = animatedNodesInTransforms(entries);
    if (nodes.length === 0) return undefined;
    return new AnimatedTransform(nodes, entries);
  }

  constructor(
    nodes: readonly AnimatedNode[],
    transforms: readonly ITransformEntry[],
  ) {
    super();
    this.nodes = nodes;
    this.transforms = transforms;
  }

  // Rasterize every entry: animated values pulled to their current number, static
  // values passed through. Each result is a single-key object, order preserved.
  override __getValue(): ITransformEntry[] {
    return this.transforms.map(entry => {
      const result: ITransformEntry = {};
      for (const key of Object.keys(entry)) {
        const value = entry[key];
        result[key] = isAnimatedNode(value) ? value.__getValue() : value;
      }
      return result;
    });
  }

  override __getAnimatedValue(): ITransformEntry[] {
    return this.transforms.map(entry => {
      const result: ITransformEntry = {};
      for (const key of Object.keys(entry)) {
        const value = entry[key];
        result[key] = isAnimatedNode(value)
          ? value.__getAnimatedValue()
          : value;
      }
      return result;
    });
  }

  override __attach(): void {
    for (const node of this.nodes) node.__addChild(this);
  }

  override __detach(): void {
    for (const node of this.nodes) node.__removeChild(this);
    super.__detach();
  }

  // Native: one entry per transform, animated entries pointing at their value's
  // native tag, static ones carrying the (angle-normalized) literal.
  override __getNativeConfig(): INativeNodeConfig {
    const transforms: {
      type: string;
      property: string;
      [key: string]: unknown;
    }[] = [];
    for (const entry of this.transforms) {
      for (const key of Object.keys(entry)) {
        const value = entry[key];
        if (isAnimatedNode(value)) {
          // __getNativeTag only: creation is edge-free; the connect is a later phase.
          transforms.push({
            type: 'animated',
            property: key,
            nodeTag: value.__getNativeTag(),
          });
        } else {
          transforms.push({
            type: 'static',
            property: key,
            value: transformDataType(value),
          });
        }
      }
    }
    validateTransform(transforms);
    return { type: 'transform', transforms };
  }
}

// Узел для значения стиля: transform, сам анимированный узел или вложенный объект
// вроде `shadowOffset: {width: anim}`
function animatedNodeFor(
  key: string,
  value: unknown,
): AnimatedNode | undefined {
  if (key === 'transform') return AnimatedTransform.from(value);
  return animatedNodeOrObject(value);
}

export class AnimatedStyle extends AnimatedWithChildren {
  // The flat style with animated keys still pointing at their AnimatedNode (so a
  // re-pull on __getValue reads the live value); static keys hold plain values.
  private readonly style: Record<string, unknown>;
  private readonly nodes: readonly AnimatedNode[];

  // Returns an AnimatedStyle only if the flattened style contains AnimatedNodes
  // (directly, or a `transform` array with animated entries). Otherwise undefined.
  static from(styleProp: unknown): AnimatedStyle | undefined {
    const flat = flattenStyle(styleProp);
    const style: Record<string, unknown> = {};
    const nodes: AnimatedNode[] = [];
    for (const key of Object.keys(flat)) {
      const value = Reflect.get(flat, key);
      const node = animatedNodeFor(key, value);
      style[key] = node ?? value;
      if (node !== undefined) nodes.push(node);
    }
    if (nodes.length === 0) return undefined;
    return new AnimatedStyle(style, nodes);
  }

  constructor(style: Record<string, unknown>, nodes: readonly AnimatedNode[]) {
    super();
    this.style = style;
    this.nodes = nodes;
  }

  override __getValue(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.style)) {
      const value = this.style[key];
      out[key] = isAnimatedNode(value) ? value.__getValue() : value;
    }
    return out;
  }

  // Узлы остаются, статические ключи берутся из нового стиля: лист, который не пересобрали,
  // не должен писать во вью прошлые значения
  refreshStatics(styleProp: unknown): void {
    const flat = flattenStyle(styleProp);
    for (const key of Object.keys(this.style)) {
      if (!isAnimatedNode(this.style[key])) delete this.style[key];
    }
    for (const key of Object.keys(flat)) {
      if (!isAnimatedNode(this.style[key])) this.style[key] = flat[key];
    }
  }

  override __getAnimatedValue(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.style)) {
      const value = this.style[key];
      out[key] = isAnimatedNode(value) ? value.__getAnimatedValue() : value;
    }
    return out;
  }

  override __attach(): void {
    for (const node of this.nodes) node.__addChild(this);
  }

  override __detach(): void {
    for (const node of this.nodes) node.__removeChild(this);
    super.__detach();
  }

  // В native уходят только анимированные ключи, статические уже есть во вью
  override __getNativeConfig(): INativeNodeConfig {
    const style: Record<string, number> = {};
    for (const key of Object.keys(this.style)) {
      const value = this.style[key];
      if (isAnimatedNode(value)) {
        // __getNativeTag only: creation is edge-free; the connect is a later phase.
        style[key] = value.__getNativeTag();
      }
    }
    validateStyles(style);
    return { type: 'style', style };
  }
}
