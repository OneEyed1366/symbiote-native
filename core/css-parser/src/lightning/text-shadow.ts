import { warnOnce } from '../values.ts';
import { colorToCss } from './colors.ts';
import type { IDeclarationContext, IStyleObject } from './declaration-types.ts';
import { warnDrop, warnedKeysFor } from './drop-warnings.ts';
import { readLength } from './lengths.ts';
import { isRecord, roundFloat } from './value-readers.ts';

// `text-shadow` has no engine-side processor to defer to, since RN only has the three decomposed
// legacy props, so this is the one place that decomposes it
const TEXT_SHADOW_DEFAULT_COLOR = '#000000';

function shadowLengthPx(
  value: unknown,
  context: IDeclarationContext,
): number | null {
  const length = readLength(value, context);
  return length === null || length.kind !== 'px'
    ? null
    : roundFloat(length.value);
}

export function textShadowToStyle(
  value: unknown,
  context: IDeclarationContext,
): IStyleObject {
  if (!Array.isArray(value)) return {};

  if (value.length > 1) {
    // The same key and wording as ../values.ts, so both pipelines report the limit alike
    warnOnce(
      warnedKeysFor(context.filename),
      'text-shadow:multiple',
      '[@symbiote-native/css-parser] multiple text-shadow layers are not supported, only the first is applied',
    );
  }

  const layer = value[0];
  if (!isRecord(layer)) return {};

  const width = shadowLengthPx(layer.xOffset, context);
  const height = shadowLengthPx(layer.yOffset, context);
  if (width === null || height === null) {
    warnDrop(
      context,
      'text-shadow',
      '"text-shadow" has offsets React Native cannot express',
    );
    return {};
  }

  // An omitted color is `currentColor`, which RN lacks, so both pipelines land on black
  const color = colorToCss(layer.color);
  const isUsableColor = color !== null && color !== 'currentColor';

  return {
    textShadowColor: isUsableColor ? color : TEXT_SHADOW_DEFAULT_COLOR,
    textShadowOffset: { width, height },
    textShadowRadius: shadowLengthPx(layer.blur, context) ?? 0,
  };
}
