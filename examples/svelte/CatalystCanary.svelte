<script lang="ts">
  import { Settings } from '@symbiote-native/svelte';
  import type { ITextInputChangeEvent } from '@symbiote-native/svelte';
  import { hide } from '@symbiote-native/splash-screen/svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    void hide({ fade: false });
  });

  const saved = Settings.get('symbioteCatalystCount');
  let count = $state(typeof saved === 'number' ? saved : 0);
  let value = $state('');
  let showInput = $state(true);

  function setCount(next: number): void {
    count = next;
    Settings.set({ symbioteCatalystCount: next });
  }
</script>

<view style={{ flex: 1, padding: 24, gap: 12, backgroundColor: '#ffffff' }}>
  <text style={{ fontSize: 24, color: '#111111' }}>
    Symbiote Svelte on Mac Catalyst
  </text>
  <text testID="catalyst-count" style={{ color: '#111111' }}>
    {`Count: ${count}`}
  </text>
  <view style={{ flexDirection: 'row', gap: 12 }}>
    <button
      testID="catalyst-increment"
      p={{ title: 'Increment', onPress: () => setCount(count + 1) }}
    />
    <button
      testID="catalyst-reset"
      p={{ title: 'Reset', onPress: () => setCount(0) }}
    />
    <button
      testID="catalyst-toggle"
      p={{ title: 'Toggle input', onPress: () => (showInput = !showInput) }}
    />
  </view>
  {#if showInput}
    <text-input
      testID="catalyst-input"
      {value}
      onValueChange={(event: ITextInputChangeEvent) => (value = event.text)}
      placeholder="Type here"
      style={{ height: 44, borderWidth: 1, padding: 8, color: '#111111' }}
    />
  {/if}
  <text testID="catalyst-output" style={{ color: '#111111' }}>
    {`Input: ${value}`}
  </text>
  <scroll-view testID="catalyst-scroll" style={{ flex: 1 }}>
    {#each Array.from({ length: 40 }, (_, index) => index) as row (row)}
      <text
        testID={`catalyst-row-${row}`}
        style={{ height: 36, color: '#111111' }}
      >
        {`Row ${row}`}
      </text>
    {/each}
  </scroll-view>
</view>
