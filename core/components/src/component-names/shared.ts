// The intrinsic JSX types symbiote's host config maps to Fabric components, plus the
// machinery to turn a platform name table into the descriptors the host config reads.
// The Fabric NAME of a primitive is platform-specific (iOS 'Switch' vs
// Android 'AndroidSwitch'), so the name tables live in component-names.ios.ts /
// .android.ts and the filename selects, no Platform.OS read. The isText flag is
// platform-invariant, so it lives here once and both tables share it.

// Every intrinsic our components.ts emits. A name table must cover exactly these keys,
// so a missing/renamed primitive is a compile error, not a silent gap at runtime.
export type ISymbioteIntrinsic =
  | 'symbiote-view'
  // Resolves to the SAME RCTView as a plain view: the tag exists so the host-behavior registry
  // (keyed by tag, never by resolved name) can find the press machine. Registering under RCTView
  // instead would put a press machine on every View in the app.
  | 'symbiote-pressable'
  | 'symbiote-text'
  | 'symbiote-image'
  | 'symbiote-scroll-view'
  | 'symbiote-scroll-content'
  // Horizontal scroll is a SEPARATE native ViewManager on Android (AndroidHorizontalScrollView),
  // not RCTScrollView with a flag, so it needs its own intrinsic. On iOS both map back to
  // RCTScrollView (one view; the `horizontal` prop flips its axis).
  | 'symbiote-horizontal-scroll-view'
  | 'symbiote-horizontal-scroll-content'
  | 'symbiote-text-input'
  | 'symbiote-text-input-multiline'
  // The COMPONENT path's spelling of the pair above, resolving to the SAME native views. Same
  // trick as `symbiote-pressable`, used the other way round: there the LOWERED tag is the new one
  // because the wrapper always emitted `symbiote-view`; here the wrapper got the plain name first,
  // so the lowered path keeps it and the wrapper is the one that qualifies.
  //
  // WHY THE SPLIT EXISTS AT ALL. `registerTextInputBehavior()` puts the whole TextInput machine on
  // the engine node. The adapter wrappers run that same machine in their own lifecycle — the
  // focus/blur mirror, the event count, the controlled write, autoFocus. Since the registry is
  // keyed by TAG, one shared tag would attach the machine to wrapper-built nodes too, and the two
  // copies would both run: `setInputFocused` twice per focus, `mostRecentEventCount` written from
  // two places. Separate tags keep exactly one owner per node.
  //
  // DELETE THIS PAIR when the wrappers stop owning that state and render the plain tag instead —
  // one machine, one implementation, which is what `<adapters_reach_full_feature_parity>` asks for
  // and what makes lowered and un-lowered call sites structurally identical.
  | 'symbiote-text-input-managed'
  | 'symbiote-text-input-multiline-managed'
  | 'symbiote-switch'
  // The component path's spelling, resolving to the SAME native Switch/AndroidSwitch. Same trick
  // as `symbiote-text-input-managed`: the plain tag belongs to the behavior registry
  // (`registerSwitchBehavior`), so the wrapper — which still runs its own lastNativeReport mirror
  // and snap-back effect — renders this one instead, or the registry would attach a second,
  // redundant machine to a node whose lifecycle already owns it.
  | 'symbiote-switch-managed'
  | 'symbiote-activity-indicator'
  | 'symbiote-safe-area-view'
  | 'symbiote-modal'
  | 'symbiote-refresh-control'
  | 'symbiote-input-accessory-view';

export interface IComponentDescriptor {
  component: string;
  isText: boolean;
}

// The only text-laying intrinsic; drives the RCTText / RCTVirtualText nesting choice
// (a <Text> inside another <Text> becomes a virtual span). Platform-invariant, so it is
// not part of the per-platform name table.
const TEXT_INTRINSICS: ReadonlySet<string> = new Set(['symbiote-text']);

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
    if (type.startsWith('symbiote-')) {
      throw new Error(`Unknown symbiote component type: ${type}`);
    }
    if (unrewritten.has(type)) {
      throw new Error(
        `"${type}" is a primitive's PUBLIC name, not a Fabric view name — a rewrite was missed. ` +
          `Expected the intrinsic tag (e.g. "symbiote-view"). Falling through would have committed ` +
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
      .slice('symbiote-'.length)
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    if (!viewNames.has(publicName)) names.add(publicName);
  }
  return names;
}
