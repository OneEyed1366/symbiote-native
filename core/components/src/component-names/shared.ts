// The intrinsic JSX types symbiote's host config maps to Fabric components, plus the
// machinery to turn a platform name table into the descriptors the host config reads.
// The Fabric NAME of a primitive is platform-specific (iOS 'Switch' vs
// Android 'AndroidSwitch'), so the name tables live in component-names.ios.ts /
// .android.ts and the filename selects, no Platform.OS read. The isText flag is
// platform-invariant, so it lives here once and both tables share it.

// Every intrinsic our components.ts emits. A name table must cover exactly these keys,
// so a missing/renamed primitive is a compile error, not a silent gap at runtime.
//
// PUBLIC AND INTERNAL TAGS SIT SIDE BY SIDE HERE WITH NOTHING MARKING WHICH, and a reader's
// default is that everything in this union is something an app writes. It is not:
// `scroll-content`, `horizontal-scroll-content`, `text-input-multiline` and
// `activity-indicator-spinner` are built by a wrapper's render fn or by a behavior's
// `buildStructure`, and no app names them. So a new entry's comment says which side it is on —
// asked in a real reading of this file on 2026-09-09, when the spinner rename read as a new
// tag the developer would have to type.
export type ISymbioteIntrinsic =
  | 'view'
  // Resolves to the SAME RCTView as a plain view: the tag exists so the host-behavior registry
  // (keyed by tag, never by resolved name) can find the press machine. Registering under RCTView
  // instead would put a press machine on every View in the app.
  | 'pressable'
  // RN's TouchableOpacity is ONE `Animated.View` carrying the responder handlers and
  // `style={[props.style, {opacity: anim}]}` (TouchableOpacity.js:302) — not a responder wrapping a
  // faded child, which is what our wrappers built. So this resolves to the same RCTView as
  // `pressable` and exists for the same reason: the behavior registry is keyed by tag, and the
  // opacity machine must not land on every Pressable in the app.
  | 'touchable-opacity'
  // The one intrinsic that resolves to NO Fabric view. RN's TouchableNativeFeedback renders
  // nothing: it clones its props onto `React.Children.only(children)` and returns that
  // (TouchableNativeFeedback.js:289,339). So the tag maps to the engine's ANCHOR component — a node
  // the commit walk skips and whose children flatten into its parent — and the behavior registered
  // for it configures the adopted child instead. Public: an app writes this one.
  | 'touchable-native-feedback'
  // Clones onto its single child exactly as TouchableNativeFeedback does
  // (TouchableWithoutFeedback.js:229,286 — `Children.only` then `cloneElement`), so it resolves to
  // the ANCHOR the same way and contributes no node of its own. INTERNAL only in the sense that an
  // app writes the tag; nothing else emits it.
  | 'touchable-without-feedback'
  // RN's TouchableHighlight is a real container View (the responder, the underlay color, the
  // whole accessibility fold) that also clones an extra opacity style onto its single child
  // (TouchableHighlight.js:281-320). This tag keeps every wrapper's own already-shipped
  // simplification of folding both styles onto the ONE node instead — resolves to the same RCTView
  // as `pressable`/`touchable-opacity`, for the same registry-keyed-by-tag reason.
  | 'touchable-highlight'
  // RN's Button is a TouchableOpacity wrapping a View wrapping a Text (Button.js:384-390), so the
  // host is an RCTView exactly like `touchable-opacity` — the behavior builds the other two. Same
  // registry reason as `pressable`: keyed by tag, so the button's folds cannot land on every View.
  | 'button'
  | 'text'
  | 'image'
  // RN's ImageBackground is a View holding an absolutely-filled Image plus the app's children
  // (ImageBackground.js:74-90), so the host is that View and the behavior builds the image under it.
  // App-facing.
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
  // carrying zIndex and an animated translateY. Resolves to the SAME RCTView as a plain view for
  // the `pressable` reason — the behavior registry is keyed by tag, and registering the
  // sticky machine under RCTView would put it on every View in the app.
  | 'sticky-header'
  // iOS: a real `RCTInputAccessoryView`. Android: `InputAccessoryView.js` renders `null` — the
  // whole component, children included — so the Android table resolves this to the engine's VOID
  // component instead of a Fabric view, matching vendor exactly.
  | 'input-accessory-view';

// The one shared shape behind every adapter's intrinsic-element type table (React's and Solid's
// JSX namespace, Vue's JSX namespace AND its separate GlobalComponents/Volar table for `.vue`
// SFCs): every tag gets a LOOSE attribute bag by default, except the ones the adapter has a REAL
// per-tag prop type for, which get that type instead. The MECHANICS (`Omit` the crossed keys out
// of the loose record, merge the real ones back in) are identical everywhere; only the prop TYPES
// differ per adapter, and they have to — `<prop_types_split_agnostic_vs_per_adapter>` in root
// CLAUDE.md: `children`/`ref` are framework values, so `IViewProps` etc. cannot be one shared type.
// This generic is what lets each adapter's own table stay a one-line instantiation instead of
// re-deriving the `Omit<Record<...>, keyof Crossed> & Crossed` shape by hand.
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

// Resolve an intrinsic type to its descriptor, against the platform-selected map. The
// logic is identical for every adapter (and was duplicated in React's host-config and
// Vue's component-names), so it lives here once; each platform file binds it to its own
// COMPONENT_DESCRIPTORS. A `symbiote-*` miss is a typo in our own code; any other string
// is a raw Fabric view name from a library's codegen component and flows through untouched
// (the engine derives its events/processors from the view's ViewConfig, no per-library glue).
export function makeDescriptorFor(
  descriptors: Readonly<Record<string, IComponentDescriptor>>,
): (type: string) => IComponentDescriptor {
  const unrewritten = publicNamesThatAreNotViewNames(descriptors);
  return type => {
    const descriptor = descriptors[type];
    if (descriptor !== undefined) return descriptor;
    // NO "unknown tag of ours" throw any more, and the reason is the whole cost of dropping the
    // prefix: `symbiote-*` was a MARKER, so a miss carrying it could only be our own typo. Without
    // it this namespace holds three populations that a string cannot tell apart —
    //
    //   view · scroll-view          ours
    //   counter-child · app-root    an Angular app's OWN component selectors, kebab by convention
    //   RCTView · RNCSlider         a Fabric view name, resolving through the fallthrough below
    //
    // — and the first attempt at a replacement ("lowercase is ours") threw on the second row, which
    // is most of an Angular app. Measured: 222 tests, the primary failure being `counter-child`.
    //
    // What replaces it is stronger and is not runtime at all: `ISymbioteIntrinsic` is a closed
    // union, so a misspelled tag in our own source is a compile error at every call site that names
    // one. The guard was only ever a backstop for a name built dynamically.
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

// A primitive's public name reaching here means an adapter's rewrite missed a call site. Without
// this the name falls through as a raw Fabric view name and commits a view literally called `View`
// — no error at any layer, wrong only on a device.
//
// Both halves are DERIVED, because a hand-written list of either would be wrong within a release.
// The names come from the intrinsic union (kebab -> Pascal); the exclusions come from the platform's
// own table, and deriving them is not tidiness — two public names ARE real Fabric view names, so a
// hand-written block list would break an adapter's thin wrapper over a third-party native view,
// which resolves by view name through this same function.
//
// AND THE EXCLUSION IS PER PLATFORM, which is why it must be computed from the table rather than
// stated. `Switch` and `SafeAreaView` are iOS view names; Android spells them `AndroidSwitch` and
// `RCTSafeAreaView`, so the same public name is EXCLUDED on iOS and BLOCKED on Android. That
// asymmetry is correct — nothing legitimate resolves by the bare name on Android — but a reader who
// takes "these two are real view names" as platform-invariant will conclude the guard is broken on
// one side or the other.
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
