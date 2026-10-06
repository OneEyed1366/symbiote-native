import type {
  IImageContentFit,
  IImageContentPosition,
  IImageContentPositionObject,
  IImageContentPositionString,
  IImageResizeMode,
  IImageTransition,
  IImageViewProps,
  ISfSymbolEffectObject,
} from './types';

const CENTER: IImageContentPositionObject = { top: '50%', left: '50%' };

const POSITION_BY_KEYWORD: Record<
  IImageContentPositionString,
  IImageContentPositionObject
> = {
  center: CENTER,
  top: { top: 0, left: '50%' },
  right: { top: '50%', right: 0 },
  bottom: { bottom: 0, left: '50%' },
  left: { top: '50%', left: 0 },
  'top center': { top: 0, left: '50%' },
  'top right': { top: 0, right: 0 },
  'top left': { top: 0, left: 0 },
  'right center': { top: '50%', right: 0 },
  'right top': { top: 0, right: 0 },
  'right bottom': { bottom: 0, right: 0 },
  'bottom center': { bottom: 0, left: '50%' },
  'bottom right': { bottom: 0, right: 0 },
  'bottom left': { bottom: 0, left: 0 },
  'left center': { top: '50%', left: 0 },
  'left top': { top: 0, left: 0 },
  'left bottom': { bottom: 0, left: 0 },
};

const warned = new Set<string>();

export function warnOnce(message: string): void {
  if (warned.has(message)) {
    return;
  }
  warned.add(message);
  console.warn(`[expo-image]: ${message}`);
}

export function resetDeprecationWarnings(): void {
  warned.clear();
}

function fitFromResizeMode(resizeMode: IImageResizeMode): IImageContentFit {
  warnOnce('Prop "resizeMode" is deprecated, use "contentFit" instead');
  switch (resizeMode) {
    case 'contain':
    case 'cover':
      return resizeMode;
    case 'stretch':
      return 'fill';
    case 'center':
      return 'scale-down';
    case 'repeat':
      warnOnce('Resize mode "repeat" is no longer supported');
      return 'cover';
  }
}

/** An SF Symbol defaults to `contain` to keep its aspect ratio */
export function resolveContentFit(
  contentFit?: IImageContentFit,
  resizeMode?: IImageResizeMode,
  isSfSymbol?: boolean,
): IImageContentFit {
  if (contentFit) {
    return contentFit;
  }
  if (resizeMode) {
    return fitFromResizeMode(resizeMode);
  }
  return isSfSymbol ? 'contain' : 'cover';
}

/** Native reads only the two-edge object form */
export function resolveContentPosition(
  contentPosition?: IImageContentPosition,
): IImageContentPositionObject {
  if (typeof contentPosition !== 'string') {
    return contentPosition ?? CENTER;
  }
  const resolved = POSITION_BY_KEYWORD[contentPosition];
  if (!resolved) {
    warnOnce(`Content position "${contentPosition}" is invalid`);
    return CENTER;
  }
  return resolved;
}

/** Every form of `sfEffect` becomes a list of effect objects */
export function resolveSfEffect(
  sfEffect: IImageViewProps['sfEffect'],
): ISfSymbolEffectObject[] | null {
  if (sfEffect == null) {
    return null;
  }
  const effects = Array.isArray(sfEffect) ? sfEffect : [sfEffect];
  return effects.map(item =>
    typeof item === 'string' ? { effect: item } : item,
  );
}

/** A number is the duration of a cross dissolve */
export function resolveTransition(
  transition?: IImageViewProps['transition'],
  fadeDuration?: IImageViewProps['fadeDuration'],
): IImageTransition | null {
  if (typeof transition === 'number') {
    return { duration: transition };
  }
  if (!transition && typeof fadeDuration === 'number') {
    warnOnce('Prop "fadeDuration" is deprecated, use "transition" instead');
    return { duration: fadeDuration };
  }
  return transition ?? null;
}
