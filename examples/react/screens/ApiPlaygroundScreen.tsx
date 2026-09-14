import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { HooksStateContextDemo } from '../components/HooksStateContextDemo';
import { HooksRefEffectDemo } from '../components/HooksRefEffectDemo';
import { HooksPerformanceDemo } from '../components/HooksPerformanceDemo';
import { HooksMiscDemo } from '../components/HooksMiscDemo';
import { HooksActionsDemo } from '../components/HooksActionsDemo';
import { FragmentProfilerStrictModeDemo } from '../components/FragmentProfilerStrictModeDemo';
import { MemoForwardRefDemo } from '../components/MemoForwardRefDemo';
import { SuspenseActivityLazyDemo } from '../components/SuspenseActivityLazyDemo';
import { ContextProviderDemo } from '../components/ContextProviderDemo';
import { RefsApiDemo } from '../components/RefsApiDemo';
import { ElementsApiDemo } from '../components/ElementsApiDemo';
import { ChildrenApiDemo } from '../components/ChildrenApiDemo';
import { ClassLifecycleDemo } from '../components/ClassLifecycleDemo';
import { PureComponentDemo } from '../components/PureComponentDemo';
import { ErrorBoundaryDemo } from '../components/ErrorBoundaryDemo';
import { PortalDemo } from '../components/PortalDemo';
import { OtherApisDemo } from '../components/OtherApisDemo';

/**
 * API Playground: live-demos React's OWN idiomatic API surface (hooks, Suspense, Context, refs,
 * error boundaries, portals…) running under Symbiote's custom react-reconciler host config —
 * not RN-shaped equivalents. Every section below tracks one `##` category from
 * .docs/framework-api-surface/react.md; a Partial row's caveat renders inline via CaveatNote
 * instead of pretending the gap doesn't exist. Distinct from HooksDemoScreen, which exercises
 * @symbiote-native/navigation's OWN hooks (useFocusEffect/useIsFocused/useNavigationState) — the
 * only overlap is useState/useCallback appearing incidentally in both, which is not this
 * screen's concern.
 */
export function ApiPlaygroundScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="api-playground-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.introspection }}
          >
            <text className="hero-badge-text">AP</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">API Playground</text>
            <text className="hero-body">
              React's own API surface, live — hooks, built-in components, the
              component model, and the handful of top-level APIs that still
              apply with react-dom out of the picture.
            </text>
          </view>
        </view>

        <text className="category-header">Hooks</text>
        <text className="category-intro">
          State, context, refs, effects, performance, and the newer
          resource/action hooks.
        </text>
        <HooksStateContextDemo />
        <HooksRefEffectDemo />
        <HooksPerformanceDemo />
        <HooksMiscDemo />
        <HooksActionsDemo />

        <text className="category-header">Built-in Components</text>
        <text className="category-intro">
          Fragment, Profiler, StrictMode, memo/forwardRef/lazy, and the two
          Partial rows — Suspense and Activity — whose hide/unhide is currently
          a no-op.
        </text>
        <FragmentProfilerStrictModeDemo />
        <MemoForwardRefDemo />
        <SuspenseActivityLazyDemo />

        <text className="category-header">Component Model</text>
        <text className="category-intro">
          Context, refs, the Elements/Children APIs, class components end to
          end, PureComponent, Error Boundaries, and createPortal.
        </text>
        <ContextProviderDemo />
        <RefsApiDemo />
        <ElementsApiDemo />
        <ChildrenApiDemo />
        <ClassLifecycleDemo />
        <PureComponentDemo />
        <ErrorBoundaryDemo />
        <PortalDemo />

        <text className="category-header">Other</text>
        <text className="category-intro">
          The remaining top-level APIs that still apply with no react-dom in the
          picture.
        </text>
        <OtherApisDemo />
      </scroll-view>
    </safe-area-view>
  );
}
