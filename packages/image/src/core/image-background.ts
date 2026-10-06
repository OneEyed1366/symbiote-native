import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type { IStyleProp } from '@symbiote-native/engine';
import { createImageView } from './image-view';
import type { IImageStyle, IImageViewProps } from './types';

export type IImageBackgroundProps = IImageViewProps & {
  /** Style of the image itself, `style` goes to the wrapping view */
  imageStyle?: IStyleProp<IImageStyle>;
  /** Goes to the wrapping view, as `style` does */
  className?: string;
};

type IClassKey = 'className' | 'class';
const CLASS_KEYS: ReadonlySet<string> = new Set<IClassKey>([
  'className',
  'class',
]);

function isClassEntry([key]: [string, unknown]): boolean {
  return CLASS_KEYS.has(key);
}

const ABSOLUTE_FILL = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
} as const satisfies IImageStyle;

// The background image has no handle, so nobody asks it for a host node
const backgroundImage = createImageView(() => null);

/** A view with an image filling it, the children of the app go after this descriptor */
export function renderImageBackground(
  props: IImageBackgroundProps,
): IDescriptor {
  const { style, imageStyle, ...rest } = props;
  const entries = Object.entries(rest);
  const image = backgroundImage.render({
    ...Object.fromEntries(entries.filter(entry => !isClassEntry(entry))),
    style: [ABSOLUTE_FILL, imageStyle],
  });
  const viewClass = Object.fromEntries(entries.filter(isClassEntry));
  return el('view', { style, ...viewClass }, image ? [image] : []);
}
