<script lang="ts">
  // Template Syntax section of the API Playground. {#if}/{#each}/{#await}/{#key}/{#snippet}/
  // {@render}/{@const}/{@debug}/{@attach} — every row is Yes. {@html} is the one No row in this
  // category (dead: no innerHTML equivalent, forbidden at build time by
  // preprocessor/forbid-web-only-constructs.ts), so it is not demoed.
  import { dlog } from '@symbiote-native/engine';
  import { hostInstance } from '@symbiote-native/svelte';
  import { isShimElement } from './shim-node-guard';
  import ActionButton from '../ActionButton.svelte';
  import NumberStepper from './NumberStepper.svelte';

  const ACCENT = '#5ec8f2';

  // {#if}/{:else if}/{:else}
  let score = $state(0);

  // {#each} with index + key, and its {:else} empty-list branch
  let items = $state<string[]>(['alpha', 'beta']);
  let nextItemIndex = $state(2);
  function addItem(): void {
    items = [...items, `item-${nextItemIndex}`];
    nextItemIndex += 1;
  }
  function clearItems(): void {
    items = [];
  }

  // {#await}/{:then}/{:catch} — guarded by `!== undefined` so no promise is ever created (and
  // left unhandled) before the {#await} block exists to attach its own then/catch.
  let awaitDemo = $state<Promise<string> | undefined>(undefined);
  function runAwaitOk(): void {
    awaitDemo = new Promise(resolve => {
      setTimeout(() => resolve('resolved after 700ms'), 700);
    });
  }
  function runAwaitFail(): void {
    awaitDemo = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('rejected after 700ms')), 700);
    });
  }

  // {#await expr then name} / {#await expr catch name} shorthands
  let thenOnly = $state<Promise<number> | undefined>(undefined);
  function runThenOnly(): void {
    thenOnly = new Promise(resolve =>
      setTimeout(() => resolve(Math.floor(Math.random() * 100)), 400),
    );
  }
  let catchOnly = $state<Promise<never> | undefined>(undefined);
  function runCatchOnly(): void {
    catchOnly = new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('always fails')), 400),
    );
  }

  // {#key} — force-remount: NumberStepper is a whole new instance each time the key changes, so
  // its own internal state resets, unlike merely changing one of its props.
  let remountToken = $state(0);
  function forceRemount(): void {
    remountToken += 1;
  }

  // {@debug}
  function bumpScore(delta: number): void {
    score += delta;
  }

  // {@attach} — measures the box the moment it becomes the live, committed host node.
  let measuredWidth = $state<number | undefined>(undefined);
  function measureAttach(node: unknown): void {
    if (!isShimElement(node)) return;
    dlog(
      'api-playground: {@attach} received the committed host node, measuring',
    );
    hostInstance(node)?.measure((_x, _y, width) => {
      measuredWidth = width;
    });
  }
</script>

<!-- Declared at file top level, not inside <view>: Svelte reads a {#snippet} nested in a
     component's children as an implicit named-snippet PROP for that component, and
     `IViewProps` (rightly) has no field for it. -->
{#snippet rowLabel(text: string)}
  <text class="list-row-text">
    {text}
  </text>
{/snippet}
<view class="section-nested">
  <text class="section-label">Template Syntax · if / each / await / key</text>
  <view class="row-align-center">
    <ActionButton
      testID="template-score-down"
      title="score −10"
      color={ACCENT}
      onPress={() => bumpScore(-10)}
    />
    <ActionButton
      testID="template-score-up"
      title="score +10"
      color={ACCENT}
      onPress={() => bumpScore(10)}
    />
  </view>
  <text class="info-text" testID="template-if-readout">
    {#if score < 40}low ({score}){:else if score < 70}medium ({score}){:else}high
      ({score}){/if}
  </text>
  {@debug score}
  <text class="note-text">
    {'{@debug score} runs alongside the branch above — check the Metro console / an attached debugger.'}
  </text>
  <text class="section-label">
    {'{#each} / {:else} / {@const}'}
  </text>
  <view class="row-align-center">
    <ActionButton
      testID="template-add-item"
      title="add item"
      color={ACCENT}
      onPress={addItem}
    />
    <ActionButton
      testID="template-clear-items"
      title="clear"
      color={ACCENT}
      onPress={clearItems}
    />
  </view>
  {#if items.length === 0}
    <text class="note-text" testID="template-each-empty">
      {'{:else} branch — no items'}
    </text>
  {:else}
    {#each items as item, index (item)}{@const upper = item.toUpperCase()}
      <text class="list-row-text">
        {`${index}. ${item} -> ${upper}`}
      </text>
    {/each}
  {/if}
  <text class="section-label">
    {'{#await} / {:then} / {:catch}'}
  </text>
  <view class="row-align-center">
    <ActionButton
      testID="template-await-ok"
      title="fetch (resolves)"
      color={ACCENT}
      onPress={runAwaitOk}
    />
    <ActionButton
      testID="template-await-fail"
      title="fetch (rejects)"
      color={ACCENT}
      onPress={runAwaitFail}
    />
  </view>
  {#if awaitDemo === undefined}
    <text class="note-text" testID="template-await-readout">
      idle — tap a button above
    </text>
  {:else}
    {#await awaitDemo}
      <text class="note-text" testID="template-await-readout">pending…</text>
    {:then value}
      <text class="note-text" testID="template-await-readout">
        {`resolved: ${value}`}
      </text>
    {:catch error}
      <text class="note-text" testID="template-await-readout">
        {`caught: ${error instanceof Error ? error.message : String(error)}`}
      </text>
    {/await}
  {/if}
  <view class="row-align-center">
    <ActionButton
      testID="template-then-only"
      title={'{#await p then v}'}
      color={ACCENT}
      onPress={runThenOnly}
    />
    <ActionButton
      testID="template-catch-only"
      title={'{#await p catch e}'}
      color={ACCENT}
      onPress={runCatchOnly}
    />
  </view>
  <text class="note-text" testID="template-then-only-readout">
    {#if thenOnly !== undefined}
      {#await thenOnly then value}{`then-shorthand resolved: ${value}`}
      {/await}
    {:else}idle{/if}
  </text>
  <text class="note-text" testID="template-catch-only-readout">
    {#if catchOnly !== undefined}
      {#await catchOnly catch error}{`catch-shorthand caught: ${error instanceof Error ? error.message : String(error)}`}
      {/await}
    {:else}idle{/if}
  </text>
  <text class="section-label">
    {'{#key} — force remount'}
  </text>
  <ActionButton
    testID="template-force-remount"
    title="Force remount"
    color={ACCENT}
    onPress={forceRemount}
  />
  {#key remountToken}
    <NumberStepper
      value={5}
      label="remounts to 5 every time"
      testID="template-key-stepper"
    />
  {/key}
  <text class="section-label">
    {'{#snippet} / {@render}'}
  </text>
  {@render rowLabel('first row via {@render}')}{@render rowLabel(
    'second row, same snippet',
  )}
  <text class="section-label">
    {'{@attach} — measuring the real committed host node'}
  </text>
  <view
    testID="template-attach-target"
    class="box-list160"
    {@attach measureAttach}
  >
    <pressable class="pressable-card" style={{ borderColor: ACCENT }}>
      <text class="pressable-label">
        measured on mount via {'{@attach}'}
      </text>
    </pressable>
  </view>
  <text class="info-text" testID="template-attach-readout">
    {measuredWidth === undefined
      ? 'measuring…'
      : `measured width: ${measuredWidth}px`}
  </text>
</view>
