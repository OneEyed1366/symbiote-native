<script lang="ts">
  // API Playground: live demos of Svelte 5's own API surface (runes, template syntax, bindings,
  // snippets, stores, context, lifecycle) running under Symbiote's custom renderer
  // Sections follow the `##` categories of `.docs/framework-api-surface/svelte.md` in order

  // Whitespace in this markup is free: the renderer drops a whitespace-only text node under a
  // parent that takes no raw text, and `collapseTextWhitespace()` folds a wrapped sentence
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import RunesDemo from '../components/api-playground/RunesDemo.svelte';
  import TemplateSyntaxDemo from '../components/api-playground/TemplateSyntaxDemo.svelte';
  import BindingsDemo from '../components/api-playground/BindingsDemo.svelte';
  import EventsActionsDemo from '../components/api-playground/EventsActionsDemo.svelte';
  import CompositionDemo from '../components/api-playground/CompositionDemo.svelte';
  import StoresDemo from '../components/api-playground/StoresDemo.svelte';
  import SpecialElementsDemo from '../components/api-playground/SpecialElementsDemo.svelte';
  import LifecycleDemo from '../components/api-playground/LifecycleDemo.svelte';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ApiPlayground];
  const accent = LINE_COLOR.primitives;
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="api-playground-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: accent }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">API Playground</text>
        <text class="hero-body">
          Svelte 5's own runes, template syntax, bindings, stores, context and
          lifecycle — running live under Symbiote's custom renderer.
        </text>
      </view>
    </view>
    <RunesDemo />
    <TemplateSyntaxDemo />
    <BindingsDemo />
    <EventsActionsDemo />
    <CompositionDemo>
      {#snippet header()}
        <text class="note-text">
          this section's `header` is a NAMED snippet prop, supplied by
          ApiPlaygroundScreen.svelte
        </text>
      {/snippet}
      <text class="list-row-text">
        this line is CompositionDemo's default `children` snippet — also
        supplied by ApiPlaygroundScreen.svelte
      </text>
    </CompositionDemo>
    <StoresDemo />
    <SpecialElementsDemo />
    <LifecycleDemo />
    <view class="section-nested">
      <text class="section-label">Legacy reactivity (Svelte 4 style)</text>
      <text class="note-text">
        No, across the board — top-level `let` reactivity, `$:` reactive
        statements and `export let` props are all disallowed in runes mode,
        which every component on this screen (and this whole adapter) uses
        exclusively; `$state`/`$derived`/`$effect`/`$props()` replace them.
      </text>
    </view>
  </scroll-view>
</safe-area-view>
