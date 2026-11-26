<script lang="ts" module>
  // Svelte lifecycle half of Modal: `$state` over `modalReducer`, a `$effect` arms the keep-alive
  // Style math, the visible gate and the reducer are shared in `@symbiote-native/components`

  // `renderModal()` paints one fixed shape, so both host tags are hand-authored from its props
  import type { IModalProps } from './modal-props';

  export type { IModalProps };
</script>

<script lang="ts">
  import {
    createInitialModalState,
    isModalVisible,
    modalReducer,
    modalVisibilityAction,
    renderModal,
    resolveAccessibilityProps,
    shouldRenderModal,
    warnAboutModalProps,
  } from '@symbiote-native/components';
  import { dlog, Platform } from '@symbiote-native/engine';
  import { forwardAttachments } from '../../runes/attachments';
  import { setVirtualizedListScope } from '../virtualized-list/nested-scope';

  let rawProps: IModalProps = $props();

  // The content sits outside the list's scroll, so a list in it is not nested in that list
  setVirtualizedListScope(null);

  // Not a $derived candidate despite the $state+$effect shape below: modalReducer folds over the
  // PREVIOUS `state` (self-referential — $derived can't read the value it's replacing) and must
  // run POST-render (see the effect's own comment) so the keep-alive frame survives a commit.
  let localState = $state(createInitialModalState(rawProps.visible === true));

  const resolved = $derived(resolveAccessibilityProps(rawProps));
  const isVisible = $derived(isModalVisible(resolved.visible));
  const shouldRender = $derived(shouldRenderModal(isVisible, localState));

  // Arms the iOS keep-alive on show; a hide is left to the native dismiss (state/modal.ts). The
  // reducer is identity-stable, so the mount run triggers no extra render.
  $effect(() => {
    const action = modalVisibilityAction(isVisible);
    if (action !== undefined) localState = modalReducer(localState, action);
  });

  // Modal.js: onDismiss is iOS-only — it drops the keep-alive, then tells the app.
  function handleDismiss(): void {
    if (Platform.OS !== 'ios') return;
    localState = modalReducer(localState, { type: 'hide' });
    rawProps.onDismiss?.();
  }

  $effect(() => {
    if (!shouldRender) dlog('Modal hidden -> no node committed');
  });

  // RN checks on mount and on every update, a dev build only
  $effect(() => {
    warnAboutModalProps({
      presentationStyle: rawProps.presentationStyle,
      transparent: rawProps.transparent,
      navigationBarTranslucent: rawProps.navigationBarTranslucent,
      statusBarTranslucent: rawProps.statusBarTranslucent,
      allowSwipeDismissal: rawProps.allowSwipeDismissal,
      onRequestClose: rawProps.onRequestClose,
    });
  });

  // Owns its host element (modal), so it folds aria/role via `resolved` above; the
  // resolved fields ride the host node via `...passthrough` — includes onShow/onDismiss/
  // onRequestClose/onOrientationChange (real ViewConfig DirectEvents) and every accessibility*
  // field, untouched, exactly like React's `...passthrough`.
  const root = $derived.by(() => {
    const {
      visible,
      transparent,
      backdropColor,
      animationType,
      presentationStyle,
      supportedOrientations,
      hardwareAccelerated,
      statusBarTranslucent,
      navigationBarTranslucent,
      allowSwipeDismissal,
      style,
      class: className,
      children: _children,
      onDismiss: _onDismiss,
      ...rest
    } = resolved;
    const passthrough = { ...rest, onDismiss: handleDismiss };

    const descriptor = renderModal({
      visible,
      transparent,
      backdropColor,
      animationType,
      presentationStyle,
      supportedOrientations,
      hardwareAccelerated,
      statusBarTranslucent,
      navigationBarTranslucent,
      allowSwipeDismissal,
      style,
      passthrough,
    });

    // root = modal > [container]; the children snippet nests UNDER the container View,
    // never as a direct sibling of the host (RN's modal content layout) — see render-modal.ts.
    const [container] = descriptor.children;
    const containerProps = typeof container === 'string' ? {} : container.props;

    return {
      hostBag: descriptor.props,
      containerBag: { ...containerProps, class: className },
    };
  });

  // See View.svelte's note on `{@attach}` — bound to the modal host itself, the node this
  // component owns (the inner container view is Modal's own structural child).
  const forwardToHost = forwardAttachments(() => rawProps);
</script>

{#if shouldRender}
  <modal p={root.hostBag} {@attach forwardToHost}>
    <view p={root.containerBag}>
      {@render rawProps.children?.()}
    </view>
  </modal>
{/if}
