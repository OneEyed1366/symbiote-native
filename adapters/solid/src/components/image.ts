// Image — the Solid lifecycle half. Everything that turns props into a native prop bag (the
// source / src / srcSet resolution, the width+height fold into style, resizeMode and tintColor
// read back off the style, alt -> accessibilityLabel, the array shape native expects) lives
// framework-agnostic in @symbiote-native/components' renderImage, shared verbatim with React, Vue
// and Svelte. Solid supplies only the reactivity and the Descriptor bridge.
//
// PLAIN .ts, NOT .tsx, unlike ./view.tsx and ./text.tsx — and the difference is the children rule,
// not a style choice. View and Text take a live subtree of the user's components, which only the
// framework's own reconciler can reduce, so they emit real JSX. An image is a leaf built entirely
// from VALUES, so it goes through renderImage + descriptorToSolid exactly like Switch does
// (.claude/rules/component-render-fn-boundary.md).
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE;
// splitProps is the idiomatic split that keeps both halves reactive, and every read below happens
// inside the descriptor accessor descriptorToSolid re-runs.
//
// ASSET RESOLUTION IS LAZY BY CONSTRUCTION, and that is what lets an app drop the hand-rolled
// resolveImageSource() call it needed while this component did not exist. renderImage calls
// resolveImageSource at RENDER time, and the resolver behind it is installed by bootstrapHost,
// which createApp().mount() runs before AppRegistry ever renders a root. So a `require('./x.png')`
// asset id handed to `source` is resolved by RN's own resolveAssetSource on the way to Fabric,
// with no ordering hazard: a module-scope resolve would run one step too early, an accessor-time
// one cannot.

import { splitProps } from 'solid-js';
import type { JSX } from '../jsx-runtime';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IImageProps as IImageBaseProps,
  type IImageStatics,
} from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';
import { descriptorToSolid } from '../descriptor-to-solid';

export type { IImageStatics } from '@symbiote-native/components';

// The agnostic base carries every field of RN's Image surface (source/defaultSource/
// loadingIndicatorSource, the W3C src/srcSet/alt/width/height/crossOrigin/referrerPolicy aliases,
// resizeMode/resizeMethod/tintColor/blurRadius/capInsets/fadeDuration/progressiveRenderingEnabled,
// the six load events, accessibility + aria) and is reused rather than redeclared. Only the
// class-styling field is per-adapter, and Solid's idiom is `class` — the spelling an author already
// writes on a raw host intrinsic in examples/solid. React's is `className`, Vue's and Svelte's
// `class` (<prop_types_split_agnostic_vs_per_adapter>).
export type IImageProps = IImageBaseProps & { class?: IClassNameValue };

// renderImage's typed view fields — the props it CONSUMES rather than forwards. Split off here so
// they never also ride through `passthrough`: the W3C aliases in particular must not reach Fabric
// raw, since native sees only the resolved `source` array they fold into. Everything else (the
// load events, blurRadius, capInsets, resizeMethod, fadeDuration, testID, `class`, a caller's own
// `ref`, the accessibility props) stays in `rest` and lands on the host image untouched.
const VIEW_PROPS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'style',
  'resizeMode',
  'tintColor',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
] as const;

function ImageComponent(props: IImageProps): JSX.Element {
  const [view, rest] = splitProps(props, VIEW_PROPS);

  // The node is created once and kept by identity — descriptorToSolid wires every prop through a
  // render effect on that same node, so a later source/style/alt change re-commits the existing
  // image rather than replacing it (which would restart the download and drop the decoded bitmap).
  return descriptorToSolid(() =>
    renderImage({
      source: view.source,
      defaultSource: view.defaultSource,
      loadingIndicatorSource: view.loadingIndicatorSource,
      style: view.style,
      resizeMode: view.resizeMode,
      tintColor: view.tintColor,
      src: view.src,
      srcSet: view.srcSet,
      alt: view.alt,
      width: view.width,
      height: view.height,
      crossOrigin: view.crossOrigin,
      referrerPolicy: view.referrerPolicy,
      // Image owns its host element rather than rendering through a symbiote View, so folding
      // aria/role into the canonical accessibility* props is its own job, like Switch's.
      // renderImage's own `alt` fold then defers to an explicit accessibilityLabel found here.
      passthrough: { ...resolveAccessibilityProps(rest) },
    }),
  );
}

export type IImageWithStatics = ((props: IImageProps) => JSX.Element) &
  IImageStatics;

// Statics attached like RN's own `Image.getSize` / `prefetch` / `queryCache` / `abortPrefetch` /
// `getSizeWithHeaders` / `resolveAssetSource`, by identity off the same @symbiote-native/engine
// module React, Vue and Svelte attach — never a Solid-side reimplementation.
export const Image: IImageWithStatics = Object.assign(
  ImageComponent,
  imageStatics,
);
