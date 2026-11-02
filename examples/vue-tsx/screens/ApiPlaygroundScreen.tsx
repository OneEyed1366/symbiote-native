/**
 * API Playground: live demos of the Composition API, reactivity, lifecycle and render-function
 * surface of Vue itself, running under the Symbiote engine instead of the DOM
 */

import { defineComponent } from 'vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import {
  AsyncComponentDemo,
  KeepAliveDemo,
  SuspenseDemo,
} from './api-playground/BuiltInDemos';
import {
  ProvideInjectDemo,
  RawRenderFunctionDemo,
} from './api-playground/CompositionDemos';
import {
  ConditionalRenderingDemo,
  CustomDirectiveDemo,
  EventModifiersDemo,
  NumberStepperVModelDemo,
  ScopedSlotDemo,
} from './api-playground/DirectiveDemos';
import {
  CommitTimingDemo,
  IdentitySafeHostRefDemo,
} from './api-playground/HostRefDemos';
import {
  ErrorCapturedDemo,
  LifecycleLoggerDemo,
} from './api-playground/LifecycleDemos';
import {
  CustomRefDemo,
  DeepVsShallowDemo,
  EffectScopeDemo,
  ReactivityUtilityInspector,
  RefComputedWatchDemo,
} from './api-playground/ReactivityDemos';

export const ApiPlaygroundScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="playground-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.introspection }}
            >
              <text class="hero-badge-text">AP</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">API Playground</text>
              <text class="hero-body">
                Vue's own Composition API, reactivity, lifecycle, and
                render-function surface — h(), withDirectives(), provide/inject,
                KeepAlive, Suspense — running live under Symbiote's engine
                instead of the DOM. Not @symbiote-native/navigation; this is Vue
                itself.
              </text>
            </view>
          </view>

          <text class="section-label">
            TEMPLATE DIRECTIVES → the vue-tsx way
          </text>
          <ConditionalRenderingDemo />
          <NumberStepperVModelDemo />
          <EventModifiersDemo />
          <CustomDirectiveDemo />
          <ScopedSlotDemo />
          <text class="note-text">
            v-bind / v-on / v-bind.camel are already the JSX norm here (plain
            props, used throughout this app) — nothing to demo. v-text ≈ a text
            interpolation, which JSX always does. v-pre has no real purpose
            outside an in-DOM template. v-show and {'<Teleport>'} are already
            demoed live in CanaryScreen — not rebuilt here, see that screen
            instead.
          </text>

          <text class="section-label">
            BUILT-IN COMPONENTS · KeepAlive &amp; Suspense (first real test)
          </text>
          <KeepAliveDemo />
          <SuspenseDemo />
          <AsyncComponentDemo />

          <text class="section-label">REACTIVITY API + TEMPLATE REFS</text>
          <RefComputedWatchDemo />
          <DeepVsShallowDemo />
          <IdentitySafeHostRefDemo />
          <CustomRefDemo />
          <EffectScopeDemo />
          <ReactivityUtilityInspector />

          <text class="section-label">LIFECYCLE HOOKS</text>
          <LifecycleLoggerDemo />
          <ErrorCapturedDemo />

          <text class="section-label">
            COMPOSITION API / DEPENDENCY INJECTION
          </text>
          <ProvideInjectDemo />
          <CommitTimingDemo />

          <text class="section-label">RENDER FUNCTION API</text>
          <RawRenderFunctionDemo />
          <text class="note-text">
            withKeys() is a real shim (adapters/vue/src/runtime-helpers) but has
            no live demo here — Pressable's onPress event carries no `.key`
            field to filter against, and this screen has no keyboard-driven
            input wired up to try it on. resolveComponent()/resolveDirective()
            need a name registered via app.component()/app.directive(), which
            this app never does (every component here is imported directly).
            defineSlots() is type-only and compiled away — nothing to run.
            defineProps()/defineEmits()/defineExpose()/defineModel()/useModel()
            are {'<script setup>'} SFC compiler macros with no TSX form —
            NumberStepper above is the actual vue-tsx equivalent (a plain
            props/emits option pair). createApp()/app.mount()/ app.* are this
            whole app's own bootstrap (adapters/vue/src/render.ts) — already
            exercised once per app run, not something a single screen re-demos.
          </text>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'ApiPlaygroundScreen' },
);
