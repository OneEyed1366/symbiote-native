<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  import Card from './Card.svelte';
  import { slug, summarize } from './call-console';
  import type { ICall } from './call-console';

  // One button per API call, the shared output line shows the resolved value or the error
  // `isBare` renders the console inside a Scenario, without a card of its own
  let {
    prefix,
    title,
    calls,
    color,
    hint,
    isBare,
  }: {
    prefix: string;
    title: string;
    calls: readonly ICall[];
    color: string;
    hint?: string;
    isBare?: boolean;
  } = $props();

  let output = $state('no call yet');

  function invoke(call: ICall): void {
    output = `${call.label}…`;
    Promise.resolve()
      .then(call.run)
      .then(value => {
        output = `${call.label} ->\n${summarize(value)}`;
      })
      .catch((error: Error) => {
        output = `${call.label} failed: ${error.message}`;
      });
  }
</script>

{#snippet body()}
  {#if hint !== undefined}
    <text class="info-text">{hint}</text>
  {/if}
  <view class="button-row">
    {#each calls as call (call.label)}
      <ActionButton
        testID={`${prefix}-${slug(call.label)}`}
        title={call.label}
        onPress={() => invoke(call)}
        {color}
      />
    {/each}
  </view>
  <text testID={`${prefix}-output`} class="info-text">{output}</text>
{/snippet}

{#if isBare === true}
  <view testID={`${prefix}-card`} class="console-bare">
    {@render body()}
  </view>
{:else}
  <Card testID={`${prefix}-card`} {title}>
    {@render body()}
  </Card>
{/if}
