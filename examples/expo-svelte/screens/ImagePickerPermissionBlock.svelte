<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { describePermission } from './image-picker-permission';
  import type { IPermissionLike } from './image-picker-permission';

  let {
    prefix,
    title,
    color,
    hookResponse,
    hookRequest,
    directGet,
    directRequest,
  }: {
    prefix: string;
    title: string;
    color: string;
    hookResponse: IPermissionLike | null;
    hookRequest: () => Promise<unknown>;
    directGet: () => Promise<IPermissionLike>;
    directRequest: () => Promise<IPermissionLike>;
  } = $props();

  let direct = $state('not called');

  function run(call: () => Promise<IPermissionLike>): void {
    call()
      .then(response => {
        direct = describePermission(response);
      })
      .catch((error: Error) => {
        direct = `failed: ${error.message}`;
      });
  }
</script>

<view>
  <text class="feature-card-title">{title}</text>
  <ResultRow testID={`${prefix}-hook`} label="hook state" value={describePermission(hookResponse)} />
  <ActionButton testID={`${prefix}-hook-request`} title="hook request()" onPress={() => hookRequest()} {color} />
  <ActionButton testID={`${prefix}-get`} title="get…PermissionsAsync" onPress={() => run(directGet)} {color} />
  <ActionButton testID={`${prefix}-request`} title="request…PermissionsAsync" onPress={() => run(directRequest)} {color} />
  <ResultRow testID={`${prefix}-direct`} label="direct call" value={direct} />
</view>
