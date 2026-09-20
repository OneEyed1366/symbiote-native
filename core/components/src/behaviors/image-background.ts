// ImageBackground's host behavior: the composition and the prop split the wrapper component did,
// moved below the framework so the primitive can be a bare tag.
//
// THE TWO-NODE SHAPE IS RN'S. `ImageBackground.js:74-103` opens a `<View>` carrying the app's
// `style`, puts an absolutely-filled `<Image>` inside it, and lays the app's `{children}` AFTER
// that image so they paint on top. The tag commits the same two nodes — `image-background` (an
// RCTView, the tag an app writes) with an RCTImageView built under it.
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
// `IMAGE_BACKGROUND_HOST_PROPS` is that complement, and `importantForAccessibility` is IN it despite
// never being part of the spread: RN reapplies it explicitly to both nodes (`:76,82`), so it stays on
// the owner here too and the image gets its own copy derived from `ownerProps` (FIXED 2026-09-20 —
// it used to redirect to the image alone and never reach the owner at all, which the module's own
// comment rationalized as "the divergence from RN predates all of it").
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
  registerHostBehavior,
  type IHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { IMAGE_TAG, registerImageBehavior } from './image';

export const IMAGE_BACKGROUND_TAG = 'image-background';

// The inner image's own tag. Distinct from `image` because the absolute fill must NOT reach a bare
// `<image>`, and a tag is the only thing a per-node rule can branch on.
export const IMAGE_BACKGROUND_IMAGE_TAG = 'image-background-image';

// The props RN keeps on the wrapper View (`ImageBackground.js:74-78`), plus the two spellings of a
// class name — `routeProp`'s slot redirect runs above its own class branch, so an unlisted `class`
// would style the image instead of the box. `importantForAccessibility` stays too: RN destructures
// it out of `...props` and reapplies it explicitly to BOTH the wrapper (:76) and the image (:82), so
// it is never part of the spread — the engine derives the image's own copy from this node
// (`foldImageBackgroundImageProps` in `SymbioteFabricProps.cpp`), the same seam the box proxy uses.
const IMAGE_BACKGROUND_HOST_PROPS = [
  'style',
  'class',
  'className',
  'importantForAccessibility',
];

// The owner props the image's payload is derived from. `importantForAccessibility` joins `style`
// for the reason above: a late write to either must re-fold the image, not just the box.
const IMAGE_BACKGROUND_SLOT_DERIVED = ['style', 'importantForAccessibility'];

// `imageStyle` is the wrapper's own name for the image's `style`. A bare class NAME is a legal
// value for it — every adapter's wrapper resolved one — and `routeProp` routes a string landing on
// `style` as `class` instead, so the registry resolves it on the image with nothing needed here.
const IMAGE_BACKGROUND_SLOT_PROPS = { imageStyle: 'style' };

// The owner's fold is GONE (2026-09-18), not moved into this file under another name: its whole
// content was `accessibilityIgnoresInvertColors: true`, a function of the tag and nothing else, and
// it is `foldImageBackgroundProps` in `SymbioteFabricProps.cpp` now. The owner therefore pays no
// trip into JS at all, and a committed ImageBackground is down from two crossings to one — the
// remaining one is the inner image's, below, which derives its style from THIS node and so cannot be
// a per-node rule. Contract: `core/engine/cpp/tests/js/image-background-payload.itest.ts`.

// THE IMAGE'S FOLD IS GONE TOO (2026-09-18) — `foldImageBackgroundImageProps` in
// `SymbioteFabricProps.cpp`, and with it this primitive costs ZERO trips into JS on both nodes.
//
// It outlived every other fold in this file because both of its inputs live on the node ABOVE: the
// app writes `style` on the `<image-background>` and `IMAGE_BACKGROUND_HOST_PROPS` keeps it there.
// "A per-node rule cannot reach another node" is what this file used to say, and it was a fact about
// the JS FOLD rather than the engine — the tree is in C++, so `fabricProps` takes `ownerProps` from
// `node.parent` and the proxy reads it there.
//
// The `id -> nativeID` half went earlier still and was DEAD before this port: `foldIdAlias` applies
// to every tagged node and runs ahead of any fold, so by the time this ran the key was already
// renamed. Worth naming, because a fold that still spells a rule someone else now applies reads as
// load-bearing and is not.
//
// Contract: `core/engine/cpp/tests/js/image-background-image-payload.itest.ts`.

// Returns the image, so `slotProps` / `slotPropsExcept` / `slotDerived` all point at it — and the
// app's children stay on the owner because of `slotTakesNoChildren`, not because of what this
// returns. The image is appended FIRST and nothing else is ever placed in front of it, which is
// what makes the children paint over it.
//
// Built WITH `IMAGE_TAG` since 2026-09-18, which is the reverse of what it used to do and for a
// reason that reversed with it. It used to withhold the tag so the node would not get Image's
// `payloadFold` — a single slot this primitive needed for its own derived style — and call the
// shared mapping by hand at the end. The mapping is the ENGINE's now, reached off the tag, so the
// tag is how this node gets the platform half at all; the JS slot is free for the composition.
//
// ONE ORDERING DIFFERENCE FALLS OUT, and it is deliberate rather than overlooked. The image rule
// folds the image's own `width`/`height` PROPS under its style, and the background rule then layers
// the box's dimensions over that — where RN nests it the other way (`ImageBackground.js:83-98` puts
// the props under the proxied box size). So when an app sets BOTH a `width` prop on the
// ImageBackground and a conflicting width in its `style`, RN gives the style's and we give the
// prop's.
//
// It is left this way rather than reproduced: RN's own comment calls that nesting a "Temporary
// Workaround" for an Image that overwrites its own dimensions, and an explicit prop winning over an
// inherited box is the less surprising of the two. Pinned in
// `core/components/src/behaviors/image-background.test.ts` so it stays a decision.
//
// THE TAG IS ITS OWN, and that is what the C++ port needed. The node used to carry plain `image`,
// which is right for everything the ordinary image rule does and wrong for the fill — a bare
// `<image>` must NOT be absolutely positioned. `image-background-image` is served by BOTH rules, the
// ordinary one first, the same shape `usesPressableRule` gives `button` and the touchables. The
// COMPONENT still resolves through `IMAGE_TAG`, because the native view is an ordinary RCTImageView.
function buildBackgroundImage(node: ISymbioteNode): ISymbioteNode {
  const descriptor = descriptorFor(IMAGE_TAG);
  const image = createElement(
    descriptor.component,
    descriptor.isText,
    IMAGE_BACKGROUND_IMAGE_TAG,
  );
  appendChild(node, image);
  return image;
}

const imageBackgroundBehavior: IHostBehavior = {
  slotProps: IMAGE_BACKGROUND_SLOT_PROPS,
  slotPropsExcept: IMAGE_BACKGROUND_HOST_PROPS,
  slotDerived: IMAGE_BACKGROUND_SLOT_DERIVED,
  slotTakesNoChildren: true,
  buildStructure: buildBackgroundImage,
  // Required by the interface and deliberately empty: this primitive owns no timer, no listener
  // and no native handshake. Written out rather than shared with a `noop` so the emptiness reads
  // as a decision.
  attach() {},
  detach() {},
};

// The inner image's registration, and it is NOT a formality twice over.
//
// A tag reaches C++ only through `recordSetTag`, which `attachHostBehavior` emits — so a tag nobody
// registered carries an EMPTY `tagName` in the host and no rule fires for it, however the rule is
// written. Same reason the ActivityIndicator spinner and the scroll content nodes carry one.
//
// And `resolvesImageSources` has to be repeated here rather than inherited from `image`: the lookup
// is by TAG, this node's tag is its own, and the flag is what makes `routeProp` run
// `require('./photo.png')` through Metro's asset registry on the way in. Without it an
// ImageBackground would commit the raw asset NUMBER and paint nothing — headless included, since
// the resolution is JS-side by necessity.
const backgroundImageBehavior: IHostBehavior = {
  resolvesImageSources: true,
  attach() {},
  detach() {},
};

export function registerImageBackgroundBehavior(): void {
  // A REAL DEPENDENCY, declared rather than assumed. The inner node is a TAG now, so it gets its
  // platform half — the engine's two rules, and the write-time source resolution — only through
  // these registrations. It used to need nothing, because the fold was a function this file called
  // directly.
  //
  // `register.ts` registers everything anyway, so nothing in an app depended on this; what depended
  // on it was every test that registers one behavior and not the whole set, and a silent inner
  // image with no rule is precisely the failure that would reach a device before it reached a
  // suite. Idempotent, like every `register*` here.
  registerImageBehavior();
  registerHostBehavior(IMAGE_BACKGROUND_IMAGE_TAG, backgroundImageBehavior);
  registerHostBehavior(IMAGE_BACKGROUND_TAG, imageBackgroundBehavior);
}
