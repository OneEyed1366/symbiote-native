<script lang="ts">
  import { Modal } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT } from './canary-shared';

  let modalVisible = $state(false);
</script>

<ActionButton
  testID="modal-open"
  title="Open modal"
  onPress={() => (modalVisible = true)}
  color={ACCENT}
/>
<Modal
  visible={modalVisible}
  transparent
  animationType="fade"
  onRequestClose={() => (modalVisible = false)}
>
  <!-- A transparent modal paints its own dim layer -->
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
