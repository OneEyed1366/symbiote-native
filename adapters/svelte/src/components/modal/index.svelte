<script lang="ts" module>
  // Modal: the Svelte lifecycle half. RCTModalHostView is an ordinary Fabric host node
  // committing through the SAME childSet as the rest of the tree (no second JS surface). The
  // style math (backdrop override, container/host styles, presentationStyle default), the
  // visible gate, and the iOS keep-alive reducer all live framework-agnostic in
  // @symbiote-native/components and are shared verbatim with React/Vue (core/components/src/
  // state/modal.ts + view/render-modal.ts); Svelte supplies only the lifecycle:
  //   - $state over the keep-alive reducer (switchReducer's twin: modalReducer)
  //   - a $effect arming the keep-alive on show, and the native dismiss dropping it (iOS)
  //   - the descriptor bridge: renderModal() always paints the SAME fixed shape (one
  //     modal host wrapping one view container — only prop VALUES vary,
  //     never structure, per svelte-adapter-dom-shim skill §15), so rather than building a
  //     generic Descriptor->Svelte walker (there is none, and none is needed) this hand-authors
  //     the two literal host tags and reads renderModal()'s computed props off the fixed
  //     `root.props` / `root.children[0].props` positions, exactly like React's createElement
  //     chain and Vue's h() chain do.
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
  } from '@symbiote-native/components';
  import { dlog, Platform } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let rawProps: IModalProps = $props();

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
  let hostShim = $state.raw<ShimElement | null>(null);
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rawProps);
  });
</script>

{#if shouldRender}
  <modal p={root.hostBag} bind:this={hostShim}>
    <view p={root.containerBag}>
      {@render rawProps.children?.()}
    </view>
  </modal>
{/if}
