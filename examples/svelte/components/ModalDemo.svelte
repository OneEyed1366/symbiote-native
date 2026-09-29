<script lang="ts">
  // Split off CanaryScreen.svelte to keep it under 400 lines.
  import { Modal } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const ACCENT = '#ff3e00';

  let modalVisible = $state(false);
</script>

<!-- Opens a Modal -->
<ActionButton
  testID="modal-open"
  title="Open modal"
  onPress={() => (modalVisible = true)}
  color={ACCENT}
/>
<!-- Modal overlays its own window -->
<Modal
  visible={modalVisible}
  transparent
  animationType="fade"
  onRequestClose={() => (modalVisible = false)}
>
  <!-- transparent modal, so we paint our own dim layer (the RN pattern) -->
  <view class="modal-overlay">
    <view testID="modal-card" class="modal-card">
      <text class="modal-title">It's a Modal</text>
      <text class="modal-body">
        Rendered through ModalHostView, its own native window, same Fabric tree.
      </text>
      <ActionButton
        testID="modal-close"
        title="Close"
        onPress={() => (modalVisible = false)}
        color={ACCENT}
      />
    </view>
  </view>
</Modal>
