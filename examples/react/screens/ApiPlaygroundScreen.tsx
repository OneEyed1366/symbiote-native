import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
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
    <SafeAreaView className="screen">
      <ScrollView
        testID="api-playground-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.introspection }}
          >
            <Text className="hero-badge-text">AP</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">API Playground</Text>
            <Text className="hero-body">
              React's own API surface, live — hooks, built-in components, the
              component model, and the handful of top-level APIs that still
              apply with react-dom out of the picture.
            </Text>
          </View>
        </View>

        <Text className="category-header">Hooks</Text>
        <Text className="category-intro">
          State, context, refs, effects, performance, and the newer
          resource/action hooks.
        </Text>
        <HooksStateContextDemo />
        <HooksRefEffectDemo />
        <HooksPerformanceDemo />
        <HooksMiscDemo />
        <HooksActionsDemo />

        <Text className="category-header">Built-in Components</Text>
        <Text className="category-intro">
          Fragment, Profiler, StrictMode, memo/forwardRef/lazy, and the two
          Partial rows — Suspense and Activity — whose hide/unhide is currently
          a no-op.
        </Text>
        <FragmentProfilerStrictModeDemo />
        <MemoForwardRefDemo />
        <SuspenseActivityLazyDemo />

        <Text className="category-header">Component Model</Text>
        <Text className="category-intro">
          Context, refs, the Elements/Children APIs, class components end to
          end, PureComponent, Error Boundaries, and createPortal.
        </Text>
        <ContextProviderDemo />
        <RefsApiDemo />
        <ElementsApiDemo />
        <ChildrenApiDemo />
        <ClassLifecycleDemo />
        <PureComponentDemo />
        <ErrorBoundaryDemo />
        <PortalDemo />

        <Text className="category-header">Other</Text>
        <Text className="category-intro">
          The remaining top-level APIs that still apply with no react-dom in the
          picture.
        </Text>
        <OtherApisDemo />
      </ScrollView>
    </SafeAreaView>
  );
}
