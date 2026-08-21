// API Playground: Solid's OWN API surface — signals, memos, the three computation kinds, control
// flow, stores, resources/Suspense, ownership, context and the props helpers — running live on
// real native views, with no DOM anywhere in the path. The raw checklist this screen is triaged
// against is .docs/framework-api-surface/solid.md; each section component's header records what
// it covers and, where something does not work here, says so instead of working around it.
//
// It does not re-demo what other screens already own: CanaryScreen covers the primitive/component
// surface of @symbiote-native/solid, and this screen deliberately stays on solid-js itself.
//
// Two things worth reading before editing any of it:
//   - every control-flow name is imported EXPLICITLY. An un-imported <Show>/<For>/<Suspense>
//     resolves against the renderer module and reads back undefined — a clean build and a runtime
//     throw far from the JSX that caused it (.claude/rules/solid-descriptor-bridge.md §3).
//   - `Switch`/`Match` come from solid-js, not from @symbiote-native/solid: RN's toggle component
//     owns the `Switch` name in that barrel. ShowSwitchDemo carries the note on screen.

import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { SignalMemoDemo } from '../components/api-playground/SignalMemoDemo';
import { EffectTimingDemo } from '../components/api-playground/EffectTimingDemo';
import { OwnershipDemo } from '../components/api-playground/OwnershipDemo';
import { ShowSwitchDemo } from '../components/api-playground/ShowSwitchDemo';
import { ForVsIndexDemo } from '../components/api-playground/ForVsIndexDemo';
import { DynamicSwapDemo } from '../components/api-playground/DynamicSwapDemo';
import { StoreDemo } from '../components/api-playground/StoreDemo';
import { ResourceSuspenseDemo } from '../components/api-playground/ResourceSuspenseDemo';
import { LazyDemo } from '../components/api-playground/LazyDemo';
import { ErrorBoundaryDemo } from '../components/api-playground/ErrorBoundaryDemo';
import { LifecycleDemo } from '../components/api-playground/LifecycleDemo';
import { ContextDemo } from '../components/api-playground/ContextDemo';
import { PropsUtilsDemo } from '../components/api-playground/PropsUtilsDemo';
// One import for the whole folder: a plain .css registers its class names globally at module-eval
// time, and a class is only looked up when a node renders.
import '../components/api-playground/playground.css';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
const ACCENT = LINE_COLOR.primitives;

export function ApiPlaygroundScreen() {
  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="api-playground-scroll"
        class="screen"
        contentContainerStyle="ap-content"
      >
        <View class="ap-line-tag" style={{ borderColor: ACCENT }}>
          <Text class="ap-line-tag-text" style={{ color: ACCENT }}>
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>

        <View class="ap-hero">
          <Text class="ap-hero-title">API Playground</Text>
          <Text class="ap-hero-body">
            Solid's own reactivity, control flow, stores, async primitives and
            ownership model — driving real native views through
            @symbiote-native/solid's universal renderer.
          </Text>
        </View>

        <SignalMemoDemo />
        <EffectTimingDemo />
        <OwnershipDemo />
        <ShowSwitchDemo />
        <ForVsIndexDemo />
        <DynamicSwapDemo />
        <StoreDemo />
        <ResourceSuspenseDemo />
        <LazyDemo />
        <ErrorBoundaryDemo />
        <LifecycleDemo />
        <ContextDemo />
        <PropsUtilsDemo />
      </ScrollView>
    </SafeAreaView>
  );
}
