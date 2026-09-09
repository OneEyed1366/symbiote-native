// RN's own processBoxShadow, imported rather than ported.
//
// Why it is needed at all: RN registers `boxShadow` with `nativeCSSParsing ? true : {process:
// processBoxShadow}`, and enableNativeCSSParsing() defaults to false - so the stock path parses
// the CSS string / structured array in JS and sends native only the processed array. Symbiote
// forwarded the raw value, which native silently ignores with CSS parsing off: the shadow simply
// did not paint.
//
// Why no try/catch, unlike processTransform's wrapper: upstream has zero `invariant` and zero
// `throw` sites here. It answers `[]` for anything it cannot parse - web semantics, where an
// invalid box-shadow paints nothing rather than a partial shadow. A guard that can never fire is
// worse than none: it reads as verified and has never run.
//
// What changed by importing: colour now goes through RN's own `processColor` (upstream imports it
// directly at processBoxShadow.js:14) instead of our injected `setColorProcessor` seam. On a real
// host those are the same function - bootstrapHost injects exactly `processColor` and nothing in
// the repo passes a custom one. The seam still governs every OTHER colour prop; it simply no
// longer governs the colours inside a box-shadow.
//
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBoxShadowUpstream from 'react-native/Libraries/StyleSheet/processBoxShadow';

// Mirrors upstream's ParsedBoxShadow (processBoxShadow.js:21). `color` is whatever processColor
// returns - a platform int on a real host - so it stays `unknown` rather than claiming a number.
export interface IParsedBoxShadow {
  offsetX: number;
  offsetY: number;
  color?: unknown;
  blurRadius?: number;
  spreadDistance?: number;
  inset?: boolean;
}

// The structured input shape. Read loosely on purpose: callers pass plain records, and upstream
// narrows each field itself.
type IRawBoxShadow = Record<string, unknown>;

export function processBoxShadow(
  rawBoxShadows: ReadonlyArray<IRawBoxShadow> | string | undefined,
): IParsedBoxShadow[] {
  const parsed: unknown = processBoxShadowUpstream(rawBoxShadows);
  return Array.isArray(parsed) ? parsed : [];
}

export type { IRawBoxShadow };
