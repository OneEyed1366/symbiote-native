// Teach JSX about the host primitives. This is a non-DOM renderer, so we declare our own
// intrinsic elements.
//
// A `.ts`, NOT a `.d.ts`, and that is load-bearing. A hand-written `.d.ts` is not emitted into
// `build/`, is not listed in `files`, and is imported by nobody — so it applied INSIDE this package
// and reached no consumer at all. That was invisible while `View` was a component (its props came
// from `FC<IViewProps>`), and became blocking the moment `View` became the intrinsic TAG: an app's
// `<View/>` resolves its props through `JSX.IntrinsicElements`, so the table has to ship. As a `.ts`
// re-exported from the barrel it compiles to `build/jsx.d.ts` and augments any consumer that
// imports this package.
//
// The tags stay namespaced (`symbiote-*`) even though the public spelling is `View`: `view`, `text`,
// `image` and `switch` are real SVG elements, and a hyphenless tag lands in the SVG namespace in
// both the Solid and Svelte compilers (measured — `.claude/rules/capitalized-intrinsic-tag-feasibility.md`).
import type { ISymbioteIntrinsic } from '@symbiote-native/components';
import type { IViewProps, ITextProps } from './components';

// Host boundary for primitives whose strict public prop types still live with their COMPONENTS
// (Image, ScrollView, TextInput…). A component spreads its already-typed props onto these
// intrinsics, so the host shape stays loose there and the user-facing strictness is on the
// component.
//
// THAT STOPS BEING TRUE THE DAY A PRIMITIVE BECOMES A TAG, and it stops being true silently: the
// entry already exists and already accepts anything, so `<Image nope={1}/>` would simply not be a
// TS2322 any more and nothing would go red. `strict-intrinsic-props.test.ts` pins the ones that
// have already crossed, so the next crossing cannot skip its own prop type.
interface HostProps {
  style?: unknown;
  children?: import('react').ReactNode;
  [key: string]: unknown;
}

// DERIVED from `ISymbioteIntrinsic`, not retyped. This list was hand-written and had fallen four
// names behind the union — `symbiote-pressable` among them, the next primitive due to become a tag.
// While `View`/`Text` were components the table was decoration (props came from `FC<IViewProps>`)
// and the drift cost nothing; now the table IS the app's public type surface, so a missing name
// becomes reachable exactly when a primitive crosses. Same lesson as `adapterNames()` in
// `.claude/rules/adapter-parity-audit.md`: a hand-written list cannot report a name that is absent
// from it. Solid derives its list the same way (`src/jsx-runtime.ts`).
//
// `Omit` rather than a plain extend: an interface may not narrow a member it inherits, and
// `IViewProps` is not assignable to `HostProps` (no index signature). Omitting the strict ones and
// re-declaring them keeps both properties — every tag present, the crossed ones strict.
type ILooseIntrinsics = Omit<
  Record<ISymbioteIntrinsic, HostProps>,
  'symbiote-view' | 'symbiote-text'
>;

// React 19 publishes its JSX types as a NAMESPACE inside the `react` module, so augmenting
// `IntrinsicElements` has no ES2015-module spelling — the rule's advice does not apply to a
// declaration merging into somebody else's shape.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements extends ILooseIntrinsics {
      'symbiote-view': IViewProps;
      'symbiote-text': ITextProps;
    }
  }
}

// The augmentation above is ambient; this export is what makes the module reachable from the
// barrel, so a consumer's program includes the file and picks the augmentation up.
export type ISymbioteIntrinsicTag = keyof import('react').JSX.IntrinsicElements;
