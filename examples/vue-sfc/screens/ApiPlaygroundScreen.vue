<!--
  API Playground: a live, interactive demo of Vue's OWN template/Composition API surface — v-show,
  v-model, KeepAlive, Suspense, provide/inject, slots, custom directives, watch/computed, and more —
  running under Symbiote's renderer, in SFC/`<template>` syntax specifically (the sibling `vue-tsx`
  app covers the render-function angle for the rows that have one). Scope is the FINAL, triaged
  checklist at .docs/framework-api-surface/vue.md: every `Yes`/`Partial` row with an SFC angle gets
  a live demo below, organized into sections matching that file's own `##` categories. Doesn't
  duplicate HooksDemoScreen.vue (that screen demos @symbiote-native/navigation's OWN composables,
  not Vue's core API) or CanaryScreen.vue (already demos v-show and Teleport — referenced here, not
  re-demoed).

  <KeepAlive>/<Suspense> + onActivated/onDeactivated are genuinely UNPROVEN against a real Fabric
  tree before this screen (2026-08-17 decision, recorded in the checklist) — this screen IS the
  first real test of them, not a port of an already-working demo.
-->
<script setup lang="ts">
import {
  ref,
  reactive,
  provide,
  inject,
  onErrorCaptured,
  getCurrentInstance,
  useTemplateRef,
} from 'vue';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
} from '@symbiote-native/vue';
import type { IHostInstance } from '@symbiote-native/vue';
import { setNativeProps, whenCommitted } from '@symbiote-native/engine';
import ActionButton from '../components/ActionButton.vue';
import { vHighlight } from '../components/playground/directives';
import {
  THEME_KEY,
  DIRECT_PROVIDE_KEY,
  type ITheme,
} from '../components/playground/provide-keys';
import KeepAliveDemo from '../components/playground/KeepAliveDemo.vue';
import SuspenseDemo from '../components/playground/SuspenseDemo.vue';
import CounterWatchDemo from '../components/playground/CounterWatchDemo.vue';
import ShallowRefDemo from '../components/playground/ShallowRefDemo.vue';
import CustomRefDebounceDemo from '../components/playground/CustomRefDebounceDemo.vue';
import ToRefsDemo from '../components/playground/ToRefsDemo.vue';
import EffectScopeDemo from '../components/playground/EffectScopeDemo.vue';
import ReactivityChecksDemo from '../components/playground/ReactivityChecksDemo.vue';
import LifecycleLogChild from '../components/playground/LifecycleLogChild.vue';
import ThemeConsumer from '../components/playground/ThemeConsumer.vue';
import NextTickProbe from '../components/playground/NextTickProbe.vue';
import SlotsDemoCard from '../components/playground/SlotsDemoCard.vue';
import CounterCapsule from '../components/playground/CounterCapsule.vue';
import UseModelProbe from '../components/playground/UseModelProbe.vue';
import OptionsApiChild from '../components/playground/OptionsApiChild.vue';
import GlobalApiDemo from '../components/playground/GlobalApiDemo.vue';
import OtherApiDemo from '../components/playground/OtherApiDemo.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
const ACCENT = LINE_COLOR.composition;
// .pressable-card carries border-width but no border-color, and RN defaults border-color to BLACK
// — invisible on this near-black screen. The OUTER cards of the .self/.stop demos already tint
// their ring with ACCENT; the nested inner targets were left on the default and drew a 1px ring of
// nothing, so "tap this border vs the button below" pointed at an edge nobody could see.
const NESTED_TARGET_BORDER = '#41506a';

// ── Template Directives ──────────────────────────────────────────────────────────────
const MODES: readonly ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
const mode = ref<'a' | 'b' | 'c'>('a');
const expanded = ref(false);
const showPulse = ref(true);
const vModelText = ref('');
const vTextValue =
  'rendered via v-text (equivalent to {{ }}, restricted to living inside <Text>)';
const vOnceCounter = ref(0);
const vMemoTrigger = ref(0);
const highlightOn = ref(false);
const selfPressLog = ref<string[]>([]);
const stopPressLog = ref<string[]>([]);

function logSelfPress(entry: string): void {
  selfPressLog.value = [...selfPressLog.value, entry].slice(-4);
}
function logStopPress(entry: string): void {
  stopPressLog.value = [...stopPressLog.value, entry].slice(-4);
}

// ── Lifecycle Hooks ───────────────────────────────────────────────────────────────────
const lifecycleMounted = ref(false);
const lifecycleSeed = ref(0);
const lifecycleLog = ref<string[]>([]);
const capturedErrors = ref<string[]>([]);

function pushLifecycleLog(entry: string): void {
  lifecycleLog.value = [...lifecycleLog.value, entry].slice(-10);
}

// Deliberately does NOT return `false` — the error still propagates on to
// app.config.errorHandler (installed below), proving both fire from one throw.
onErrorCaptured(error => {
  capturedErrors.value = [
    ...capturedErrors.value,
    `onErrorCaptured: ${error instanceof Error ? error.message : String(error)}`,
  ].slice(-4);
});

// ── Composition API / Dependency Injection ───────────────────────────────────────────
const theme = reactive<ITheme>({ tone: 'warm amber' });
provide(THEME_KEY, theme);

function toggleTheme(): void {
  theme.tone = theme.tone === 'warm amber' ? 'cool violet' : 'warm amber';
}

const nextTickLog = ref<string[]>([]);
const nextTickProbeMountCount = ref(0);
function mountFreshProbe(): void {
  nextTickProbeMountCount.value += 1;
}
function pushNextTickResult(entry: string): void {
  nextTickLog.value = [...nextTickLog.value, entry].slice(-6);
}

// ── Slots & Template Refs ────────────────────────────────────────────────────────────
// INTENTIONALLY the deep-ref form (vue-adapter-reactivity Gotcha 1) — kept for visual contrast
// only, never wired to an imperative call.
const deepRefTarget = ref<IHostInstance | null>(null);
const correctRefTarget = useTemplateRef<IHostInstance>('correctRefTarget');

function flashCorrectRef(): void {
  const node = correctRefTarget.value;
  if (!node) return;
  whenCommitted(node, () =>
    setNativeProps(node, { style: { backgroundColor: ACCENT } }),
  );
}

const REF_FOR_CHIPS = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
const chipRefs = useTemplateRef<IHostInstance[]>('chipRefs');
const chipRefCount = ref<number | undefined>(undefined);
function readChipRefCount(): void {
  chipRefCount.value = chipRefs.value?.length;
}

// ── Component Communication ──────────────────────────────────────────────────────────
const capsuleRef =
  useTemplateRef<InstanceType<typeof CounterCapsule>>('capsuleRef');
const capsuleCount = ref(0);
const capsuleThresholdHit = ref(false);
function resetCapsule(): void {
  capsuleRef.value?.reset();
  capsuleThresholdHit.value = false;
}
const useModelCount = ref(0);

const pingLog = ref<string[]>([]);
function onPing(value: number): void {
  pingLog.value = [...pingLog.value, `ping: ${value}`].slice(-4);
}

// ── Global / Application API ─────────────────────────────────────────────────────────
// Guarded module-level flag: app.mixin() ADDS a mixin every call, so re-running this on a screen
// remount (navigate away, then back) would stack duplicate mixins and fire "mounted" once per
// stacked copy — the guard makes this idempotent across remounts, same idea as CanaryScreen.vue's
// module-level `overlayTunnel` singleton.
let globalApiInstalled = false;
const appHandlerLog = ref<string[]>([]);
const mixinMountLog = ref<string[]>([]);

const app = getCurrentInstance()?.appContext.app;
if (app && !globalApiInstalled) {
  globalApiInstalled = true;
  app.config.globalProperties.$playgroundGreeting =
    'hi from app.config.globalProperties';
  app.mixin({
    mounted() {
      mixinMountLog.value = [
        ...mixinMountLog.value,
        `app.mixin: "${this.$options.name ?? 'anonymous'}" mounted`,
      ].slice(-6);
    },
  });
  app.provide(DIRECT_PROVIDE_KEY, 'value-from-direct-app.provide()');
  app.config.errorHandler = error => {
    appHandlerLog.value = [
      ...appHandlerLog.value,
      `app.config.errorHandler: ${error instanceof Error ? error.message : String(error)}`,
    ].slice(-6);
  };
  app.config.warnHandler = message => {
    appHandlerLog.value = [
      ...appHandlerLog.value,
      `app.config.warnHandler: ${message}`,
    ].slice(-6);
  };
}
const directProvideValue = inject(DIRECT_PROVIDE_KEY, 'not provided');
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="api-playground-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: ACCENT }">
          <Text class="hero-badge-text">AP</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">API Playground</Text>
          <Text class="hero-body"
            >Vue's own template/Composition API surface, running live under
            Symbiote's renderer — not @symbiote-native/navigation this
            time.</Text
          >
        </View>
      </View>

      <!-- ══════════════════════ Template Directives ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Template Directives</Text>

        <Text class="section-label"
          >v-if / v-else-if / v-else + &lt;template v-if&gt;</Text
        >
        <View class="row-tight">
          <ActionButton
            v-for="opt in MODES"
            :key="opt"
            :testID="`mode-${opt}`"
            :title="opt.toUpperCase()"
            :onPress="() => (mode = opt)"
            :color="ACCENT"
          />
        </View>
        <Text v-if="mode === 'a'" class="list-row-text" testID="mode-branch"
          >Branch A</Text
        >
        <Text
          v-else-if="mode === 'b'"
          class="list-row-text"
          testID="mode-branch"
          >Branch B</Text
        >
        <Text v-else class="list-row-text" testID="mode-branch"
          >Branch C (v-else fallback)</Text
        >
        <ActionButton
          testID="template-expand-toggle"
          :title="
            expanded ? 'Collapse <template v-if>' : 'Expand <template v-if>'
          "
          :onPress="() => (expanded = !expanded)"
          :color="ACCENT"
        />
        <template v-if="expanded">
          <Text class="note-text"
            >Grouped sibling 1 — no wrapper element, via &lt;template
            v-if&gt;</Text
          >
          <Text class="note-text"
            >Grouped sibling 2 — same &lt;template&gt; block</Text
          >
        </template>

        <Text class="section-label">v-show</Text>
        <ActionButton
          :testID="'v-show-toggle'"
          :title="showPulse ? 'Hide (v-show)' : 'Show (v-show)'"
          :onPress="() => (showPulse = !showPulse)"
          :color="ACCENT"
        />
        <View v-show="showPulse" testID="v-show-target" class="chip">
          <Text class="chip-text">👁</Text>
        </View>
        <Text class="note-text"
          >v-show sets style.display via setNativeProps (whenCommitted-guarded),
          NOT CSS display — the element stays mounted the whole time
          (vue-adapter-directives).</Text
        >

        <Text class="section-label"
          >v-model (Partial — Symbiote components only)</Text
        >
        <TextInput
          v-model="vModelText"
          class="focus-input"
          placeholder="type…"
          testID="v-model-input"
        />
        <Text class="note-text"
          >Works because TextInput is a Symbiote COMPONENT
          (resolveModelValue/emitModelUpdate) — there's no bare native
          &lt;input&gt; for the DOM-element half of v-model to target.</Text
        >

        <Text class="section-label">v-bind (:prop) + v-bind.camel</Text>
        <Text class="note-text"
          >Every dynamic prop on this screen already goes through v-bind's `:`
          shorthand → routeProp → the engine. `.camel` folds a kebab-case
          attribute to camelCase at compile time — largely redundant here since
          normalizeVueAttrs already folds kebab-case generally.</Text
        >

        <Text class="section-label">v-on (@press) + .self + .stop</Text>
        <Pressable
          testID="press-outer-self"
          class="pressable-card"
          :style="{ padding: 24, borderColor: ACCENT }"
          @press.self="
            () =>
              logSelfPress(
                'outer fired (.self — pressed directly on the border)',
              )
          "
        >
          <Text class="note-text">tap this border vs the button below</Text>
          <Pressable
            testID="press-inner-plain"
            class="pressable-card"
            :style="{ borderColor: NESTED_TARGET_BORDER }"
            @press="
              () =>
                logSelfPress('inner fired (its own listener — always fires)')
            "
          >
            <Text class="pressable-label">inner (@press, no modifier)</Text>
          </Pressable>
        </Pressable>
        <Text
          v-for="(entry, index) in selfPressLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
        <Pressable
          testID="press-outer-plain"
          class="pressable-card"
          :style="{ padding: 16, borderColor: ACCENT }"
          @press="() => logStopPress('outer fired (bubbled)')"
        >
          <Pressable
            testID="press-inner-stop"
            class="pressable-card"
            :style="{ borderColor: NESTED_TARGET_BORDER }"
            @press.stop="
              () => logStopPress('inner-stop fired (.stop — never bubbles)')
            "
          >
            <Text class="pressable-label">inner (@press.stop)</Text>
          </Pressable>
          <Pressable
            testID="press-inner-plain2"
            class="pressable-card"
            :style="{ borderColor: NESTED_TARGET_BORDER }"
            @press="() => logStopPress('inner-plain2 fired')"
          >
            <Text class="pressable-label">inner (@press, no modifier)</Text>
          </Pressable>
        </Pressable>
        <Text
          v-for="(entry, index) in stopPressLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >

        <Text class="section-label">v-text (Partial) + v-pre (not supported)</Text>
        <Text v-text="vTextValue" class="note-text" testID="v-text-demo" />
        <Text class="note-text"
          >v-pre is NOT demoed live: it makes the compiler skip codegen for its subtree and emit a
          DOM-oriented static-content node (hostInsertStaticContent), which our renderer has no
          host op for — mounting one throws "text must be rendered inside a &lt;Text&gt;" and takes
          the whole screen's commit down with it (createElement calls fire, the subtree never links
          into the tree, and the app.config.errorHandler installed below swallows the error
          silently). Not a partial gap like v-text — genuinely unsupported.</Text
        >

        <Text class="section-label">v-once vs v-memo</Text>
        <ActionButton
          testID="vonce-bump"
          title="bump counter"
          :onPress="() => (vOnceCounter += 1)"
          :color="ACCENT"
        />
        <Text v-once class="list-row-text" testID="vonce-frozen">{{
          `v-once (frozen at first render): ${vOnceCounter}`
        }}</Text>
        <Text class="list-row-text" testID="vonce-live">{{
          `live (no v-once): ${vOnceCounter}`
        }}</Text>
        <ActionButton
          testID="vmemo-bump"
          title="bump v-memo dep"
          :onPress="() => (vMemoTrigger += 1)"
          :color="ACCENT"
        />
        <Text
          v-memo="[vMemoTrigger]"
          class="list-row-text"
          testID="vmemo-timestamp"
          >{{
            `v-memo'd (deps: [vMemoTrigger]) timestamp: ${Date.now()}`
          }}</Text
        >
        <Text class="list-row-text" testID="live-timestamp">{{
          `not memoized, timestamp: ${Date.now()}`
        }}</Text>
        <Text class="note-text"
          >Trigger ANY other button above and re-check: the non-memoized
          timestamp always moves, the v-memo'd one only moves when its own "bump
          v-memo dep" button was pressed.</Text
        >

        <Text class="section-label">Custom directive (v-highlight)</Text>
        <ActionButton
          testID="directive-toggle"
          :title="highlightOn ? 'highlight: on' : 'highlight: off'"
          :onPress="() => (highlightOn = !highlightOn)"
          :color="ACCENT"
        />
        <View
          v-highlight="highlightOn"
          testID="custom-directive-chip"
          class="chip"
        />
        <Text class="note-text"
          >Local `vHighlight` object directive (mounted/updated/unmounted
          hooks), reused programmatically via withDirectives() in the Other
          section below.</Text
        >

        <Text class="note-text"
          >v-slot (#name) — the full slot demo lives in Slots &amp; Template
          Refs below, not duplicated here.</Text
        >
      </View>

      <!-- ══════════════════════ Built-in Components ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Built-in Components</Text>
        <KeepAliveDemo />
        <SuspenseDemo />
        <Text class="note-text"
          >&lt;component :is&gt; is exercised above, inside &lt;KeepAlive&gt;.
          &lt;slot&gt; + &lt;template&gt; are exercised throughout this screen
          (every `#name` slot below, every grouped &lt;template v-if&gt; above).
          &lt;Teleport&gt; already has a live demo on CanaryScreen.vue ("Show
          toast (Teleport)") — not re-demoed here.</Text
        >
      </View>

      <!-- ══════════════════════ Reactivity API ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Reactivity API</Text>
        <CounterWatchDemo />
        <ShallowRefDemo />
        <CustomRefDebounceDemo />
        <ToRefsDemo />
        <EffectScopeDemo />
        <ReactivityChecksDemo />
      </View>

      <!-- ══════════════════════ Lifecycle Hooks ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Lifecycle Hooks</Text>
        <View class="row-tight">
          <ActionButton
            testID="lifecycle-mount-toggle"
            :title="lifecycleMounted ? 'Unmount child' : 'Mount child'"
            :onPress="() => (lifecycleMounted = !lifecycleMounted)"
            :color="ACCENT"
          />
          <ActionButton
            testID="lifecycle-bump-seed"
            title="bump seed (onBeforeUpdate/onUpdated)"
            :onPress="() => (lifecycleSeed += 1)"
            :color="ACCENT"
          />
        </View>
        <LifecycleLogChild
          v-if="lifecycleMounted"
          :seed="lifecycleSeed"
          @log="pushLifecycleLog"
        />
        <Text class="section-label">hook log</Text>
        <Text
          v-for="(entry, index) in lifecycleLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
        <Text class="section-label"
          >onErrorCaptured (this screen's own hook, does not stop
          propagation)</Text
        >
        <Text
          v-for="(entry, index) in capturedErrors"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
      </View>

      <!-- ══════════════════════ Composition API / Dependency Injection ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header"
          >Composition API / Dependency Injection</Text
        >
        <Text class="section-label"
          >provide() + inject() (3 levels deep) + hasInjectionContext() +
          getCurrentInstance()</Text
        >
        <ActionButton
          testID="theme-toggle"
          :title="`toggle theme (currently: ${theme.tone})`"
          :onPress="toggleTheme"
          :color="ACCENT"
        />
        <ThemeConsumer :depth="0" />
        <Text class="section-label"
          >nextTick() (Partial) vs whenCommitted() — same async-commit gotcha as
          onMounted</Text
        >
        <ActionButton
          testID="nexttick-mount-probe"
          title="mount fresh probe node"
          :onPress="mountFreshProbe"
          :color="ACCENT"
        />
        <NextTickProbe
          v-if="nextTickProbeMountCount > 0"
          :key="nextTickProbeMountCount"
          @result="pushNextTickResult"
        />
        <Text
          v-for="(entry, index) in nextTickLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
        <Text class="note-text"
          >direct app.provide() (installed in this screen's own setup):
          {{ directProvideValue }}</Text
        >
      </View>

      <!-- ══════════════════════ Slots & Template Refs ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Slots &amp; Template Refs</Text>
        <SlotsDemoCard>
          <Text class="note-text">default slot content</Text>
          <template #body="{ tone }">
            <Text class="note-text">{{ `scoped slot: tone="${tone}"` }}</Text>
          </template>
          <template #footer>
            <Text class="note-text">named #footer slot content</Text>
          </template>
        </SlotsDemoCard>

        <Text class="section-label"
          >Template ref (Partial — deep ref()) vs useTemplateRef() (3.5+)</Text
        >
        <View :style="{ flexDirection: 'row', gap: 12 }">
          <View ref="deepRefTarget" testID="deep-ref-target" class="chip" />
          <View
            ref="correctRefTarget"
            testID="correct-ref-target"
            class="chip"
          />
        </View>
        <Text class="note-text"
          >Left chip's ref is deliberately the deep `ref()` form (Gotcha 1) —
          never wired to any imperative call, kept for contrast only. Right chip
          uses `useTemplateRef()`, shallow by construction, safely wired to a
          real setNativeProps flash below.</Text
        >
        <ActionButton
          testID="flash-correct-ref"
          title="flash the right chip"
          :onPress="flashCorrectRef"
          :color="ACCENT"
        />

        <Text class="section-label">ref_for — an array of refs from v-for</Text>
        <View :style="{ flexDirection: 'row', gap: 12 }">
          <View
            v-for="chip in REF_FOR_CHIPS"
            :key="chip.id"
            ref_for
            ref="chipRefs"
            class="chip"
          >
            <Text class="chip-text">{{ chip.id }}</Text>
          </View>
        </View>
        <ActionButton
          testID="ref-for-read"
          title="read chipRefs.length"
          :onPress="readChipRefCount"
          :color="ACCENT"
        />
        <Text
          v-if="chipRefCount !== undefined"
          class="list-row-text"
          testID="ref-for-count"
          >{{ `chipRefs.value.length = ${chipRefCount}` }}</Text
        >
        <Text class="note-text"
          >`key` and `is` are exercised throughout this screen (every v-for
          above, KeepAlive's &lt;component :is&gt;).</Text
        >
      </View>

      <!-- ══════════════════════ Component Communication ══════════════════════ -->
      <View class="section-nested">
        <Text class="section-header">Component Communication</Text>
        <CounterCapsule
          ref="capsuleRef"
          v-model:count="capsuleCount"
          data-note="fallthrough-demo"
          @threshold="capsuleThresholdHit = true"
        />
        <Text
          v-if="capsuleThresholdHit"
          class="note-text"
          testID="capsule-threshold"
          >threshold event fired — count reached 10</Text
        >
        <ActionButton
          testID="capsule-reset"
          title="reset() via defineExpose + template ref"
          :onPress="resetCapsule"
          :color="ACCENT"
        />

        <UseModelProbe v-model:count="useModelCount" />

        <OptionsApiChild
          :seed="42"
          data-note="options-fallthrough"
          @ping="onPing"
        >
          <Text class="note-text">passed via default slot</Text>
        </OptionsApiChild>
        <Text
          v-for="(entry, index) in pingLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
      </View>

      <GlobalApiDemo />
      <View class="section-tight">
        <Text class="section-label">app.mixin() mount log</Text>
        <Text
          v-for="(entry, index) in mixinMountLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
        <Text class="section-label"
          >app.config.errorHandler / warnHandler log</Text
        >
        <Text
          v-for="(entry, index) in appHandlerLog"
          :key="index"
          class="list-row-text"
          >{{ entry }}</Text
        >
      </View>

      <OtherApiDemo />
    </ScrollView>
  </SafeAreaView>
</template>
