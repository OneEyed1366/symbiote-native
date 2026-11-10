<script lang="ts">
  import type { INavLine } from '../navigation-lines';

  type IMenuRowProps = {
    testID: string;
    line: INavLine;
    code: string;
    label: string;
    hint: string;
    onPress: () => void;
  };

  let { testID, line, code, label, hint, onPress }: IMenuRowProps = $props();
</script>

<pressable {testID} class={`menu-row menu-row-${line}`} p={{ onPress }}>
  <view class={`menu-badge menu-badge-${line}`}>
    <text class="menu-badge-text">{code}</text>
  </view>
  <view class="menu-row-copy">
    <text class="menu-row-label">{label}</text>
    <text class={`menu-row-hint menu-row-hint-${line}`}>{hint}</text>
  </view>
</pressable>
