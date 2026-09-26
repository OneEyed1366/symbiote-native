// The intrinsic JSX types symbiote's host config maps to Fabric components. A Fabric name is
// platform-specific, so name tables live in component-names.ios/.android.ts, selected by
// filename; `isText` is platform-invariant and lives here once.

// Every intrinsic our components.ts emits — a missing/renamed key is a compile error, not a
// silent runtime gap. Public and internal tags sit side by side: `scroll-content`,
// `text-input-multiline`, `activity-indicator-spinner` are built by a behavior, never named.
export type ISymbioteIntrinsic =
  | 'view'
  // Resolves to the SAME RCTView as a plain view: the tag exists so the host-behavior registry
  // (keyed by tag, never by resolved name) can find the press machine. Registering under RCTView
  // instead would put a press machine on every View in the app.
  | 'pressable'
  // RN's TouchableOpacity is one `Animated.View` carrying the responder + opacity style
  // (TouchableOpacity.js:302), not a wrapper around a faded child. Resolves to the same RCTView
  // as `pressable`, for the same tag-keyed-registry reason.
  | 'touchable-opacity'
  // RN's TouchableNativeFeedback clones its props onto its one child and renders no view of its
  // own (TouchableNativeFeedback.js:289,339) — so this maps to the engine's ANCHOR (skipped by
  // the commit walk, children flatten into the parent); the behavior configures the child instead.
  | 'touchable-native-feedback'
  // Clones onto its single child exactly as TouchableNativeFeedback does
  // (TouchableWithoutFeedback.js:229,286), so it resolves to the ANCHOR the same way.
  | 'touchable-without-feedback'
  // RN's TouchableHighlight is a container View that also clones an opacity style onto its child
  // (TouchableHighlight.js:281-320); this folds both styles onto ONE node instead. Resolves to
  // the same RCTView as `pressable`, for the same tag-keyed-registry reason.
  | 'touchable-highlight'
  // RN's Button is a TouchableOpacity wrapping a View wrapping a Text (Button.js:384-390), so the
  // host is an RCTView exactly like `touchable-opacity` — the behavior builds the other two. Same
  // registry reason as `pressable`: keyed by tag, so the button's folds cannot land on every View.
  | 'button'
  | 'text'
  | 'image'
  // RN's ImageBackground is a View holding an absolutely-filled Image plus the app's children
  // (ImageBackground.js:74-90); the host is that View, the behavior builds the image under it.
  | 'image-background'
  | 'scroll-view'
  | 'scroll-content'
  // Horizontal scroll is a SEPARATE native ViewManager on Android (AndroidHorizontalScrollView),
  // not RCTScrollView with a flag, so it needs its own intrinsic. On iOS both map back to
  // RCTScrollView (one view; the `horizontal` prop flips its axis).
  | 'horizontal-scroll-view'
  | 'horizontal-scroll-content'
  | 'text-input'
  | 'text-input-multiline'
  | 'switch'
  // The HOST — RN's centering wrapper View (ActivityIndicator.js:112), not the spinner. The plain
  // name goes to the app-facing tag and the NATIVE view qualifies, the same direction `pressable`
  // took.
  | 'activity-indicator'
  // The native spinner itself, built by the host's `buildStructure`.
  | 'activity-indicator-spinner'
  | 'safe-area-view'
  | 'modal'
  | 'refresh-control'
  // The sticky-header wrapper RN builds in JS (ScrollViewStickyHeader.js): an ordinary view
  // carrying zIndex and an animated translateY. Resolves to the same RCTView as `pressable`,
  // for the same tag-keyed-registry reason.
  | 'sticky-header'
  // iOS: a real `RCTInputAccessoryView`. Android: `InputAccessoryView.js` renders `null` — the
  // whole component, children included — so the Android table resolves this to the engine's VOID
  // component instead of a Fabric view, matching vendor exactly.
  | 'input-accessory-view';

// The shared shape behind every adapter's intrinsic-element type table: a loose attribute bag
// by default, crossed with the tags that have a real per-tag prop type. Prop types differ per
// adapter (`<prop_types_split_agnostic_vs_per_adapter>`, CLAUDE.md); only the mechanics are shared.
export type ICrossTypedIntrinsics<
  LooseProps,
  Crossed extends Partial<Record<ISymbioteIntrinsic, unknown>>,
> = Omit<Record<ISymbioteIntrinsic, LooseProps>, keyof Crossed> & Crossed;

export interface IComponentDescriptor {
  component: string;
  isText: boolean;
}

// The only text-laying intrinsic; drives the RCTText / RCTVirtualText nesting choice
// (a <Text> inside another <Text> becomes a virtual span). Platform-invariant, so it is
// not part of the per-platform name table.
const TEXT_INTRINSICS: ReadonlySet<string> = new Set(['text']);

// Assemble the descriptor map a platform file exports: each intrinsic's Fabric name from
// the platform table, paired with its invariant isText flag.
export function buildDescriptors(
  names: Readonly<Record<ISymbioteIntrinsic, string>>,
): Readonly<Record<string, IComponentDescriptor>> {
  const descriptors: Record<string, IComponentDescriptor> = {};
  for (const [intrinsic, component] of Object.entries(names)) {
    descriptors[intrinsic] = {
      component,
      isText: TEXT_INTRINSICS.has(intrinsic),
    };
  }
  return descriptors;
}

// Resolve an intrinsic type to its descriptor against the platform-selected map, so each
// platform file binds it to its own COMPONENT_DESCRIPTORS. Any string with no descriptor is a
// raw Fabric view name from a library's codegen component and flows through untouched.
export function makeDescriptorFor(
  descriptors: Readonly<Record<string, IComponentDescriptor>>,
): (type: string) => IComponentDescriptor {
  const unrewritten = publicNamesThatAreNotViewNames(descriptors);
  return type => {
    const descriptor = descriptors[type];
    if (descriptor !== undefined) return descriptor;
    // No "unknown tag" throw here: this namespace holds three populations no string alone can
    // tell apart — our own tags, an Angular app's own kebab-case selectors, and a Fabric view
    // name. `ISymbioteIntrinsic` being a closed union makes a misspelled tag a compile error.
    if (unrewritten.has(type)) {
      throw new Error(
        `"${type}" is a primitive's PUBLIC name, not a Fabric view name — a rewrite was missed. ` +
          `Expected the intrinsic tag (e.g. "view"). Falling through would have committed ` +
          `a Fabric view literally named "${type}", which fails on device only.`,
      );
    }
    return { component: type, isText: false };
  };
}

// A primitive's public name reaching here means an adapter's rewrite missed a call site —
// otherwise it commits a view literally called `View`. Both halves are DERIVED, not hand-written:
// some public names (`Switch` on iOS) ARE real view names, and which is per-platform.
function publicNamesThatAreNotViewNames(
  descriptors: Readonly<Record<string, IComponentDescriptor>>,
): ReadonlySet<string> {
  const viewNames = new Set(
    Object.values(descriptors).map(descriptor => descriptor.component),
  );
  const names = new Set<string>();
  for (const intrinsic of Object.keys(descriptors)) {
    const publicName = intrinsic
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    if (!viewNames.has(publicName)) names.add(publicName);
  }
  return names;
}
