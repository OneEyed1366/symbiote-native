<script lang="ts">
  type IHeaderTapViewProps = {
    testID: string;
    label: string;
    onPress: () => void;
  };

  // A small tappable pill for the custom views of a native header
  let { testID, label, onPress }: IHeaderTapViewProps = $props();
</script>

<pressable {testID} class="header-view" p={{ onPress }}>
  <text class="header-view-text">{label}</text>
</pressable>
