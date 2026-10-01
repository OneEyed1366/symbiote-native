<script lang="ts" generics="T">
  import type { ILocationSubscription } from '@symbiote-native/location/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';

  let {
    prefix,
    label,
    color,
    start,
    format,
  }: {
    prefix: string;
    label: string;
    color: string;
    start: (
      onValue: (value: T) => void,
      onError: (reason: string) => void,
    ) => Promise<ILocationSubscription>;
    format: (value: T) => string;
  } = $props();

  let isOn = $state(false);
  let output = $state('not watching');
  let subscription: ILocationSubscription | null = null;

  $effect(() => () => subscription?.remove());

  function toggle(next: boolean): void {
    if (!next) {
      subscription?.remove();
      subscription = null;
      isOn = false;
      return;
    }
    start(
      value => {
        output = format(value);
      },
      reason => {
        output = `error: ${reason}`;
      },
    )
      .then(sub => {
        subscription = sub;
        isOn = true;
      })
      .catch((error: Error) => {
        output = `failed: ${error.message}`;
      });
  }
</script>

<ToggleRow testID={`${prefix}-switch`} {label} value={isOn} onChange={toggle} {color} />
<ResultRow testID={`${prefix}-output`} label="latest" value={output} />
