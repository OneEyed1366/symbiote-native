// Shadows are the style keys that only mean something together: offset, blur, color and opacity
// become one declaration, so they are read off the whole bag

import { isRecord } from '@symbiote-native/engine';
import { toLength, type ICssDeclarations } from './css-values';

const DEFAULT_COLOR = 'black';
const PERCENT = 100;

function offsetOf(value: unknown): [number, number] {
  if (!isRecord(value)) return [0, 0];
  const { width, height } = value;
  return [Number(width ?? 0), Number(height ?? 0)];
}

function shadowParts(offset: unknown, radius: unknown, color: unknown): string {
  const [x, y] = offsetOf(offset);
  return [x, y, radius ?? 0].map(toLength).join(' ') + ` ${String(color)}`;
}

// The opacity rides in the color, as CSS has no separate shadow opacity
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  return `color-mix(in srgb, ${color} ${Math.round(opacity * PERCENT)}%, transparent)`;
}

// iOS paints a view shadow only above zero opacity, and the iOS surface is the reference
function viewShadowOf(
  bag: Readonly<Record<string, unknown>>,
): ICssDeclarations {
  const opacity = bag.shadowOpacity;
  if (typeof opacity !== 'number' || opacity <= 0) return {};
  const color = withOpacity(String(bag.shadowColor ?? DEFAULT_COLOR), opacity);
  return {
    'box-shadow': shadowParts(bag.shadowOffset, bag.shadowRadius, color),
  };
}

function textShadowOf(
  bag: Readonly<Record<string, unknown>>,
): ICssDeclarations {
  const { textShadowOffset, textShadowRadius, textShadowColor } = bag;
  if (textShadowOffset === undefined && textShadowRadius === undefined) {
    return {};
  }
  return {
    'text-shadow': shadowParts(
      textShadowOffset,
      textShadowRadius,
      textShadowColor ?? DEFAULT_COLOR,
    ),
  };
}

export function groupDeclarations(
  bag: Readonly<Record<string, unknown>>,
): ICssDeclarations {
  return { ...viewShadowOf(bag), ...textShadowOf(bag) };
}
