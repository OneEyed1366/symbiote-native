<script lang="ts" module>
  // Modal: the Svelte lifecycle half. RCTModalHostView is an ordinary Fabric host node
  // committing through the SAME childSet as the rest of the tree (no second JS surface). The
  // style math (backdrop override, container/host styles, presentationStyle default), the
  // visible gate, and the iOS keep-alive reducer all live framework-agnostic in
  // @symbiote-native/components and are shared verbatim with React/Vue (core/components/src/
  // state/modal.ts + view/render-modal.ts); Svelte supplies only the lifecycle:
  //   - $state over the keep-alive reducer (switchReducer's twin: modalReducer)
  //   - a POST-render $effect driving the visible->hidden transition (Svelte's $effect runs
  //     after the DOM update, the same "one keep-alive frame survives" timing as React's
  //     useEffect / Vue's flush:'post' watch)
  //   - the descriptor bridge: renderModal() always paints the SAME fixed shape (one
  //     symbiote-modal host wrapping one symbiote-view container — only prop VALUES vary,
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
    modalReducer,
    renderModal,
    resolveAccessibilityProps,
    shouldRenderModal,
  } from '@symbiote-native/components';
  import { dlog } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let rawProps: IModalProps = $props();

  let state = $state(createInitialModalState(rawProps.visible === true));

  const resolved = $derived(resolveAccessibilityProps(rawProps));
  const isVisible = $derived(resolved.visible === true);
  const shouldRender = $derived(shouldRenderModal(isVisible, state));

  // POST-render, mirroring state/modal.ts's contract: fires after the DOM update following the
  // render that used the OLD state, so a visible->hidden transition keeps the node mounted one
  // more frame (state.isRendered still true) before the NEXT render drops it. The reducer is
  // identity-stable, so a no-op transition — including this effect's own first run on mount —
  // triggers no extra render.
  //
  // Under this adapter's microtask-coalesced requestCommit() (element.ts's `p` setter), Svelte
  // settles the whole visible->hidden cascade within the SAME microtask flush that processes the
  // triggering prop change, so the keep-alive frame genuinely happens (a render sees
  // isVisible=false with isRendered still true before this effect flips it) but isn't observable
  // as its own committed Fabric frame the way React's per-render synchronous commit makes it.
  $effect(() => {
    state = modalReducer(
      state,
      isVisible ? { type: 'show' } : { type: 'hide' },
    );
  });

  $effect(() => {
    if (!shouldRender) dlog('Modal hidden -> no node committed');
  });

  // Owns its host element (symbiote-modal), so it folds aria/role via `resolved` above; the
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
      ...passthrough
    } = resolved;

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

    // root = symbiote-modal > [container]; the children snippet nests UNDER the container View,
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
  <symbiote-modal p={root.hostBag} bind:this={hostShim}>
    <symbiote-view p={root.containerBag}>
      {@render rawProps.children?.()}
    </symbiote-view>
  </symbiote-modal>
{/if}
