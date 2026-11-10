<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from '../../components/ActionButton.vue';
import { vHighlight } from '../../components/playground/directives';
import { ACCENT, NESTED_TARGET_BORDER } from './accent';
import { appendLimited } from './log';

const MODES: readonly ('a' | 'b' | 'c')[] = ['a', 'b', 'c'];
const PRESS_LOG_LIMIT = 4;
const V_TEXT_VALUE =
  'rendered via v-text (equivalent to {{ }}, restricted to living inside <text>)';

const mode = ref<'a' | 'b' | 'c'>('a');
const expanded = ref(false);
const showPulse = ref(true);
const vModelText = ref('');
const vOnceCounter = ref(0);
const vMemoTrigger = ref(0);
const highlightOn = ref(false);
const selfPressLog = ref<string[]>([]);
const stopPressLog = ref<string[]>([]);

function logSelfPress(entry: string): void {
  appendLimited(selfPressLog, entry, PRESS_LOG_LIMIT);
}
function logStopPress(entry: string): void {
  appendLimited(stopPressLog, entry, PRESS_LOG_LIMIT);
}
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Template Directives </text>

    <text class="section-label">
      v-if / v-else-if / v-else + &lt;template v-if&gt;
    </text>
    <view class="row-tight">
      <ActionButton
        v-for="opt in MODES"
        :key="opt"
        :testID="`mode-${opt}`"
        :title="opt.toUpperCase()"
        :onPress="() => (mode = opt)"
        :color="ACCENT"
      />
    </view>
    <text v-if="mode === 'a'" class="list-row-text" testID="mode-branch">
      Branch A
    </text>
    <text v-else-if="mode === 'b'" class="list-row-text" testID="mode-branch">
      Branch B
    </text>
    <text v-else class="list-row-text" testID="mode-branch">
      Branch C (v-else fallback)
    </text>
    <ActionButton
      testID="template-expand-toggle"
      :title="expanded ? 'Collapse <template v-if>' : 'Expand <template v-if>'"
      :onPress="() => (expanded = !expanded)"
      :color="ACCENT"
    />
    <template v-if="expanded">
      <text class="note-text">
        Grouped sibling 1 — no wrapper element, via &lt;template v-if&gt;
      </text>
      <text class="note-text">
        Grouped sibling 2 — same &lt;template&gt; block
      </text>
    </template>

    <text class="section-label"> v-show </text>
    <ActionButton
      testID="v-show-toggle"
      :title="showPulse ? 'Hide (v-show)' : 'Show (v-show)'"
      :onPress="() => (showPulse = !showPulse)"
      :color="ACCENT"
    />
    <view v-show="showPulse" testID="v-show-target" class="chip">
      <text class="chip-text"> 👁 </text>
    </view>
    <text class="note-text">
      v-show sets style.display via setNativeProps (whenCommitted-guarded), NOT
      CSS display — the element stays mounted the whole time
      (vue-adapter-directives).
    </text>

    <text class="section-label">
      v-model (Partial — Symbiote components only)
    </text>
    <text-input
      v-model="vModelText"
      class="focus-input"
      placeholder="type…"
      testID="v-model-input"
    />
    <text class="note-text">
      `text-input` is an intrinsic TAG, so the compiler expands v-model to a
      runtime directive rather than a modelValue prop pair. The adapter ships
      that directive (runtime-helpers/vModelText) — Vue's own lives in
      @vue/runtime-dom, which never enters this bundle.
    </text>

    <text class="section-label"> v-bind (:prop) + v-bind.camel </text>
    <text class="note-text">
      Every dynamic prop on this screen already goes through v-bind's `:`
      shorthand → routeProp → the engine. `.camel` folds a kebab-case attribute
      to camelCase at compile time — largely redundant here since
      normalizeVueAttrs already folds kebab-case generally.
    </text>

    <text class="section-label"> v-on (@press) + .self + .stop </text>
    <pressable
      testID="press-outer-self"
      class="pressable-card"
      :style="{ padding: 24, borderColor: ACCENT }"
      @press.self="
        () =>
          logSelfPress('outer fired (.self — pressed directly on the border)')
      "
    >
      <text class="note-text"> tap this border vs the button below </text>
      <pressable
        testID="press-inner-plain"
        class="pressable-card"
        :style="{ borderColor: NESTED_TARGET_BORDER }"
        @press="
          () => logSelfPress('inner fired (its own listener — always fires)')
        "
      >
        <text class="pressable-label"> inner (@press, no modifier) </text>
      </pressable>
    </pressable>
    <text
      v-for="(entry, index) in selfPressLog"
      :key="index"
      class="list-row-text"
    >
      {{ entry }}
    </text>
    <pressable
      testID="press-outer-plain"
      class="pressable-card"
      :style="{ padding: 16, borderColor: ACCENT }"
      @press="() => logStopPress('outer fired (bubbled)')"
    >
      <pressable
        testID="press-inner-stop"
        class="pressable-card"
        :style="{ borderColor: NESTED_TARGET_BORDER }"
        @press.stop="
          () => logStopPress('inner-stop fired (.stop — never bubbles)')
        "
      >
        <text class="pressable-label"> inner (@press.stop) </text>
      </pressable>
      <pressable
        testID="press-inner-plain2"
        class="pressable-card"
        :style="{ borderColor: NESTED_TARGET_BORDER }"
        @press="() => logStopPress('inner-plain2 fired')"
      >
        <text class="pressable-label"> inner (@press, no modifier) </text>
      </pressable>
    </pressable>
    <text
      v-for="(entry, index) in stopPressLog"
      :key="index"
      class="list-row-text"
    >
      {{ entry }}
    </text>

    <text class="section-label">
      v-text (Partial) + v-pre (not supported)
    </text>
    <text class="note-text" testID="v-text-demo" v-text="V_TEXT_VALUE" />
    <text class="note-text">
      v-pre is NOT demoed live: it makes the compiler skip codegen for its
      subtree and emit a DOM-oriented static-content node
      (hostInsertStaticContent), which our renderer has no host op for —
      mounting one throws "text must be rendered inside a &lt;Text&gt;" and
      takes the whole screen's commit down with it (createElement calls fire,
      the subtree never links into the tree, and the app.config.errorHandler
      installed by this screen swallows the error silently). Not a partial gap
      like v-text — genuinely unsupported.
    </text>

    <text class="section-label"> v-once vs v-memo </text>
    <ActionButton
      testID="vonce-bump"
      title="bump counter"
      :onPress="() => (vOnceCounter += 1)"
      :color="ACCENT"
    />
    <text v-once class="list-row-text" testID="vonce-frozen">
      {{ `v-once (frozen at first render): ${vOnceCounter}` }}
    </text>
    <text class="list-row-text" testID="vonce-live">
      {{ `live (no v-once): ${vOnceCounter}` }}
    </text>
    <ActionButton
      testID="vmemo-bump"
      title="bump v-memo dep"
      :onPress="() => (vMemoTrigger += 1)"
      :color="ACCENT"
    />
    <text
      v-memo="[vMemoTrigger]"
      class="list-row-text"
      testID="vmemo-timestamp"
    >
      {{ `v-memo'd (deps: [vMemoTrigger]) timestamp: ${Date.now()}` }}
    </text>
    <text class="list-row-text" testID="live-timestamp">
      {{ `not memoized, timestamp: ${Date.now()}` }}
    </text>
    <text class="note-text">
      Trigger ANY other button above and re-check: the non-memoized timestamp
      always moves, the v-memo'd one only moves when its own "bump v-memo dep"
      button was pressed.
    </text>

    <text class="section-label"> Custom directive (v-highlight) </text>
    <ActionButton
      testID="directive-toggle"
      :title="highlightOn ? 'highlight: on' : 'highlight: off'"
      :onPress="() => (highlightOn = !highlightOn)"
      :color="ACCENT"
    />
    <view
      v-highlight="highlightOn"
      testID="custom-directive-chip"
      class="chip"
    />
    <text class="note-text">
      Local `vHighlight` object directive (mounted/updated/unmounted hooks),
      reused programmatically via withDirectives() in the Other section below.
    </text>

    <text class="note-text">
      v-slot (#name) — the full slot demo lives in Slots &amp; Template Refs
      below, not duplicated here.
    </text>
  </view>
</template>
