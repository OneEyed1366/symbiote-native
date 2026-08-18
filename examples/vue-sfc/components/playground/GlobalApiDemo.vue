<!--
  Application API rows that need a LIVE `app` instance to call — `createApp()`/`app.mount()`/
  `app.unmount()` are genuinely root-level, called once from adapters/vue/src/render.ts before this
  screen (or any screen) exists, so they are referenced here, not re-demoed: mounting a second
  SymbioteSurface from inside a running screen would need a whole separate native root, out of
  scope for a screen-level demo. Everything below instead reaches the ALREADY-mounted app object
  via `getCurrentInstance().appContext.app` and calls real `app.*` methods on it at runtime — this
  genuinely works (Vue's app object is just a live object, calling `app.component()`/`app.use()`
  after mount is unusual but not disallowed) and is the only way to observe these APIs from inside
  a screen instead of the app's entry point.

  `app.config.globalProperties`, `app.mixin()`, and the direct `app.provide()` call are installed
  from ApiPlaygroundScreen.vue's OWN setup() instead of from here — they must land before ANY
  sibling child (OptionsApiChild in particular) mounts, and a component's own setup() is guaranteed
  to run before its children's, which a sibling component here can't guarantee relative to another
  sibling. `app.config.errorHandler` is installed there too, alongside `app.config.warnHandler`,
  but its trigger button lives on LifecycleLogChild (cross-referenced, not duplicated here) since
  that's the natural place a thrown error already exists.
-->
<script setup lang="ts">
import {
  ref,
  h,
  defineComponent,
  resolveComponent,
  getCurrentInstance,
  inject,
} from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';
import { vHighlight } from './directives';
import { PLUGIN_KEY } from './provide-keys';

const app = getCurrentInstance()?.appContext.app;

const componentRegistered = ref(false);
const directiveRegistered = ref(false);
const pluginInstalled = ref(false);
const warnTriggered = ref(false);
const runWithContextResult = ref<string | undefined>(undefined);

const RuntimeBadge = defineComponent({
  name: 'PlaygroundRuntimeBadgeImpl',
  setup() {
    return () =>
      h(View, { class: 'chip' }, [h(Text, { class: 'chip-text' }, () => 'RT')]);
  },
});

// A render-function wrapper, since resolveComponent() only means anything inside a render/setup
// function — a template can't call it directly by a runtime-only-known string name.
const ResolvedRuntimeBadge = defineComponent({
  setup() {
    return () => h(resolveComponent('PlaygroundRuntimeBadge'));
  },
});

function registerRuntimeComponent(): void {
  if (!app || componentRegistered.value) return;
  app.component('PlaygroundRuntimeBadge', RuntimeBadge);
  componentRegistered.value = true;
}

function registerRuntimeDirective(): void {
  if (!app || directiveRegistered.value) return;
  // Reuses the SAME vHighlight object directive as the template-directives demo, registered
  // under a different global name — proving app.directive() and resolveDirective()'s
  // compiler-injected fallback (this template's `v-runtime-glow` isn't a locally-imported
  // `vRuntimeGlow`, so the SFC compiler emits a runtime resolveDirective('runtime-glow') call).
  app.directive('runtime-glow', vHighlight);
  directiveRegistered.value = true;
}

function installPlugin(): void {
  if (!app || pluginInstalled.value) return;
  app.use({
    install(installedApp) {
      installedApp.provide(PLUGIN_KEY, 'installed-by-app.use()-plugin');
    },
  });
  pluginInstalled.value = true;
}

function triggerWarnOutsideSetup(): void {
  // inject() called outside setup() is itself a Vue dev-warning trigger ("must be called inside
  // setup() or a functional component") — routed through app.config.warnHandler, installed by
  // ApiPlaygroundScreen.vue before this component mounted.
  inject('definitely-missing-injection-key');
  warnTriggered.value = true;
}

function runInAppContext(): void {
  if (!app) return;
  // app.runWithContext() is exactly the fix for the warning above: inject() here is STILL
  // outside setup(), but wrapped in the app's own injection context it neither warns nor
  // falls back to the default — it reads the plugin-installed value directly.
  runWithContextResult.value = app.runWithContext(() =>
    inject(PLUGIN_KEY, 'still not installed'),
  );
}
</script>

<template>
  <View class="section-tight">
    <Text class="section-label"
      >Global / Application API — driving the live `app` instance</Text
    >
    <ActionButton
      testID="global-register-component"
      :title="
        componentRegistered
          ? 'app.component() ✓ registered'
          : 'app.component() + resolveComponent()'
      "
      :onPress="registerRuntimeComponent"
      color="#f5a623"
    />
    <ResolvedRuntimeBadge v-if="componentRegistered" />
    <ActionButton
      testID="global-register-directive"
      :title="
        directiveRegistered
          ? 'app.directive() ✓ registered'
          : 'app.directive() + resolveDirective()'
      "
      :onPress="registerRuntimeDirective"
      color="#f5a623"
    />
    <View v-if="directiveRegistered" v-runtime-glow="true" class="chip" />
    <ActionButton
      testID="global-install-plugin"
      :title="
        pluginInstalled
          ? 'app.use() ✓ plugin installed'
          : 'app.use() (plugin calls app.provide())'
      "
      :onPress="installPlugin"
      color="#f5a623"
    />
    <ActionButton
      testID="global-trigger-warn"
      title="app.config.warnHandler — trigger a Vue dev warning"
      :onPress="triggerWarnOutsideSetup"
      color="#f5a623"
    />
    <Text v-if="warnTriggered" class="note-text" testID="global-warn-triggered"
      >inject() outside setup() called — see the warn log below</Text
    >
    <ActionButton
      testID="global-run-with-context"
      title="app.runWithContext() → inject() outside setup, no warning"
      :onPress="runInAppContext"
      color="#f5a623"
    />
    <Text
      v-if="runWithContextResult !== undefined"
      class="list-row-text"
      testID="global-run-with-context-result"
      >{{ `runWithContext() result: "${runWithContextResult}"` }}</Text
    >
    <Text class="note-text"
      >createApp() / app.mount() / app.unmount() are root-level singletons — see
      adapters/vue/src/render.ts, not re-demoed on a screen.</Text
    >
  </View>
</template>
