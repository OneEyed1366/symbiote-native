// ImageBackground's host behavior: the composition and the prop split the wrapper component did,
// moved below the framework so the primitive can be a bare tag.
//
// THE TWO-NODE SHAPE IS RN'S. `ImageBackground.js:74-103` opens a `<View>` carrying the app's
// `style`, puts an absolutely-filled `<Image>` inside it, and lays the app's `{children}` AFTER
// that image so they paint on top. The lowered form is the same two nodes — `image-background`
// (an RCTView, the tag an app writes) with an RCTImageView built under it.
//
// WHY THE SLOT TAKES NO CHILDREN, which is the one thing this primitive needed that ScrollView,
// ActivityIndicator and Button did not. `childHost` answers two questions at once — which node an
// owner prop redirects onto, and which node the app's children go under — and those had the same
// answer for every primitive until this one. Here they differ: the image takes `imageStyle` and the
// whole `...props` spread, while the children belong beside it. `slotTakesNoChildren` is what
// splits them (`IHostBehavior`, and it is not a JSX nicety upstream could have collapsed — an
// Android `<Image>` is an `ImageView`, not a `ViewGroup`).
//
// WHERE THE APP'S PROPS GO. RN destructures `children, style, imageStyle, imageRef,
// importantForAccessibility, ...props` and spreads `...props` onto the Image
// (`ImageBackground.js:62-81`), so the set that moves is OPEN — every event, every accessibility
// prop, `testID`, `id`, whatever an app writes next — and only a complement can express it.
// `IMAGE_BACKGROUND_HOST_PROPS` is the short list that stays behind, and it is shorter than RN's:
// `importantForAccessibility` rides to the image alone, which is what all five wrappers did, so
// the tag and the component it replaces commit the same payload. The divergence from RN predates
// lowering and is unchanged by it.
//
// WHAT THE IMAGE'S FOLD OWES. Everything on the image arrives as a real prop write, so its payload
// is built by the shared `foldImagePayload` like any other `image`. Two things cannot arrive that
// way and are folded here: the style, which is DERIVED from the owner's own `style` (RN proxies the
// wrapper's width/height onto the image so it fills the box rather than collapsing to the source's
// intrinsic size), and `id`, whose rename to `nativeID` is applied per adapter on the tag THEY
// create and so never reaches a node a behavior built.
import {
  appendChild,
  createElement,
  flattenStyle,
  registerHostBehavior,
  type IDimensionValue,
  type IHostBehavior,
  type IPayloadFold,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { foldImagePayload, IMAGE_TAG } from './image';

export const IMAGE_BACKGROUND_TAG = 'image-background';

// The inner Image's positioning: absolute-fill behind the box's children.
const ABSOLUTE_FILL: IViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

// The props RN keeps on the wrapper View (`ImageBackground.js:74-78`), plus the two spellings of a
// class name — `routeProp`'s slot redirect runs above its own class branch, so an unlisted `class`
// would style the image instead of the box.
const IMAGE_BACKGROUND_HOST_PROPS = ['style', 'class', 'className'];

// The owner props the image's payload is derived from. Only `style`, because a class name is
// published INTO `node.props.style` by `pushClassStyle` — so a `class` write arrives here spelled
// `style` and the proxied width/height follow a class-declared box as well as an inline one.
const IMAGE_BACKGROUND_SLOT_DERIVED = ['style'];

// `imageStyle` is the wrapper's own name for the image's `style`. A bare class NAME is a legal
// value for it — every adapter's wrapper resolved one — and `routeProp` routes a string landing on
// `style` as `class` instead, so the registry resolves it on the image with nothing needed here.
const IMAGE_BACKGROUND_SLOT_PROPS = { imageStyle: 'style' };

// A StyleProp is an object, an array of them, or a registered class array — all of which
// `flattenStyle` already handles one layer down. The only thing to exclude is a scalar.
function styleOf(value: unknown): IStyleProp<IViewStyle> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (Array.isArray(value)) return value;
  return { ...value };
}

// RN opts the wrapper out of iOS's Smart Invert for its whole subtree (`ImageBackground.js:75`) —
// a photograph inverted by accessibility settings is the case that prop exists for. None of the
// five wrappers ever wrote it, so this closes a standing gap rather than reproducing one.
const hostFold: IPayloadFold = props => ({
  ...props,
  accessibilityIgnoresInvertColors: true,
});

// Read one explicit dimension off the (already-flattened) box style. A dp number or a percentage
// string is a valid IDimensionValue; anything else (auto / undefined) yields undefined.
function readDimension(
  style: Record<string, unknown>,
  key: 'width' | 'height',
): IDimensionValue | undefined {
  const value = Object.hasOwn(style, key) ? Reflect.get(style, key) : undefined;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

function imageFold(owner: ISymbioteNode): IPayloadFold {
  return props => {
    // RN's own workaround, and its comment is worth reading before "simplifying" this
    // (`ImageBackground.js:86-96`): an RN Image overwrites its own width/height from the source's
    // intrinsic size, which fights the box's explicit dimensions, so they are proxied back on.
    // Reads the OWNER's live style — a class name lands there too, published by `pushClassStyle`.
    const box = flattenStyle(styleOf(owner.props.style));
    const next: Record<string, unknown> = {
      ...props,
      // `imageStyle` last, so a caller still wins over the fill and the proxy.
      style: [
        ABSOLUTE_FILL,
        {
          width: readDimension(box, 'width'),
          height: readDimension(box, 'height'),
        },
        styleOf(props.style),
      ],
    };
    // Unconditional priority when both are set, matching RN (`View.js:77-79`) and `foldHostBag`.
    // A raw `id` is a key no ViewConfig declares, so Fabric drops it and the nativeID is lost.
    if (Object.hasOwn(next, 'id')) {
      next.nativeID = next.id;
      delete next.id;
    }
    return foldImagePayload(next);
  };
}

// Returns the image, so `slotProps` / `slotPropsExcept` / `slotDerived` all point at it — and the
// app's children stay on the owner because of `slotTakesNoChildren`, not because of what this
// returns. The image is appended FIRST and nothing else is ever placed in front of it, which is
// what makes the children paint over it.
//
// Built WITHOUT handing `IMAGE_TAG` to `createElement`, deliberately: that would attach Image's own
// behavior and set `payloadFold` to `foldImagePayload` alone, and this node's style has to be
// derived from the owner. `payloadFold` is a single slot, so the composition is spelled here — and
// it still calls the one shared mapping rather than restating it.
function buildBackgroundImage(node: ISymbioteNode): ISymbioteNode {
  const descriptor = descriptorFor(IMAGE_TAG);
  const image = createElement(descriptor.component, descriptor.isText);
  image.payloadFold = imageFold(node);
  appendChild(node, image);
  return image;
}

const imageBackgroundBehavior: IHostBehavior = {
  slotProps: IMAGE_BACKGROUND_SLOT_PROPS,
  slotPropsExcept: IMAGE_BACKGROUND_HOST_PROPS,
  slotDerived: IMAGE_BACKGROUND_SLOT_DERIVED,
  slotTakesNoChildren: true,
  buildStructure: buildBackgroundImage,
  foldPayload: hostFold,
  // Required by the interface and deliberately empty: this primitive owns no timer, no listener
  // and no native handshake. Written out rather than shared with a `noop` so the emptiness reads
  // as a decision.
  attach() {},
  detach() {},
};

export function registerImageBackgroundBehavior(): void {
  registerHostBehavior(IMAGE_BACKGROUND_TAG, imageBackgroundBehavior);
}
