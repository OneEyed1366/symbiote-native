<script lang="ts">
  // API Playground: live demos of Svelte 5's own idiomatic API surface (runes, template syntax,
  // bindings, snippets, stores, context, lifecycle) running under Symbiote's custom renderer — the
  // exact, already-triaged checklist is .docs/framework-api-surface/svelte.md. Sections below
  // mirror that document's `##` categories in order; each section component's own header comment
  // records exactly which rows it covers and why any row is skipped.
  //
  // Whitespace in this markup is free, unlike when the screen was written. The shim maps a
  // whitespace-only text node under a parent that takes no raw text to an anchor, so a gap
  // between siblings never reaches Fabric as an RCTRawText (svelte-adapter-dom-shim §16b), and
  // svelte.config.js's collapseTextWhitespace() folds a sentence wrapped across source lines.
  import {
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import RunesDemo from '../components/api-playground/RunesDemo.svelte';
  import TemplateSyntaxDemo from '../components/api-playground/TemplateSyntaxDemo.svelte';
  import BindingsDemo from '../components/api-playground/BindingsDemo.svelte';
  import EventsActionsDemo from '../components/api-playground/EventsActionsDemo.svelte';
  import EasingDemo from '../components/api-playground/EasingDemo.svelte';
  import CompositionDemo from '../components/api-playground/CompositionDemo.svelte';
  import StoresDemo from '../components/api-playground/StoresDemo.svelte';
  import SpecialElementsDemo from '../components/api-playground/SpecialElementsDemo.svelte';
  import LifecycleDemo from '../components/api-playground/LifecycleDemo.svelte';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
  const accent = LINE_COLOR.primitives;
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="api-playground-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: accent }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">API Playground</Text>
        <Text class="hero-body">
          Svelte 5's own runes, template syntax, bindings, stores, context and
          lifecycle — running live under Symbiote's custom renderer.
        </Text>
      </View>
    </View>
    <RunesDemo />
    <TemplateSyntaxDemo />
    <BindingsDemo />
    <EventsActionsDemo />
    <EasingDemo />
    <CompositionDemo>
      {#snippet header()}
        <Text class="note-text">
          this section's `header` is a NAMED snippet prop, supplied by
          ApiPlaygroundScreen.svelte
        </Text>
      {/snippet}
      <Text class="list-row-text">
        this line is CompositionDemo's default `children` snippet — also
        supplied by ApiPlaygroundScreen.svelte
      </Text>
    </CompositionDemo>
    <StoresDemo />
    <SpecialElementsDemo />
    <LifecycleDemo />
    <View class="section-nested">
      <Text class="section-label">Legacy reactivity (Svelte 4 style)</Text>
      <Text class="note-text">
        No, across the board — top-level `let` reactivity, `$:` reactive
        statements and `export let` props are all disallowed in runes mode,
        which every component on this screen (and this whole adapter) uses
        exclusively; `$state`/`$derived`/`$effect`/`$props()` replace them.
      </Text>
    </View>
  </ScrollView>
</SafeAreaView>
