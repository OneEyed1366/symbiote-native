<script lang="ts" module>
  // `RNSScreenStackHeaderConfig` requires every child to be a header subview, and `type` names
  // the slot this one fills
  import { resolveHeaderSubviewProps } from '../../core';

  const HEADER_SUBVIEW_PROPS = resolveHeaderSubviewProps('searchBar');
</script>

<script lang="ts">
  // One route's native chrome, so each route owns its plan and attachments until it is popped
  // The views go through `<svelte:element>` as their capitalized names parse as components, and
  // their props ride `hostProps` as a dynamic tag never takes the property path (../attachments.ts)
  import {
    RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
    RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME,
    RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
    RNS_SCREEN_STACK_VIEW_NAME,
    RNS_SCREEN_VIEW_NAME,
    RNS_SEARCH_BAR_VIEW_NAME,
    createTransitionProgress,
    resolveCustomHeaderSubviews,
    resolveCustomHeaderViews,
    resolveSheetFooterHost,
    resolveStackRoutePlan,
  } from '../../core';
  import type { IScreenRenderPlan } from '../../core';
  import { hostProps, searchBarRef } from '../attachments';
  import NavigationScope from '../navigation-scope.svelte';
  import type { INavigationScopeValue } from '../navigation-context';
  import type { IStackScreenProps } from './stack-props';

  let {
    route,
    index,
    routeCount,
    options,
    navigation,
    emitter,
    parentScope,
    // Destructured under a capitalized name because a Svelte template resolves a component tag
    // only from a capitalized identifier
    component: ScreenComponent,
    onPopRequested,
  }: IStackScreenProps = $props();

  const searchBarOptions = $derived(options.headerSearchBarOptions);

  // The app's header views, filed by the leaf that hosts each, core lists which leaves exist
  const headerViews = $derived(resolveCustomHeaderViews(options));
  const subviewHosts = $derived(
    resolveCustomHeaderSubviews(headerViews, options),
  );

  // Core says whether this screen has a footer, the snippet fills the host it names
  const sheetFooterHost = $derived(
    resolveSheetFooterHost({
      stackPresentation: options.stackPresentation,
      hasFooter: options.sheetFooter !== undefined,
    }),
  );

  // `assignSearchBarHandle` is left out: the handle rides its own attachment on the leaf below, so
  // no `ref` key can leak into the props bag
  const loggedKeys = new Set<string>();
  // One set per route screen, as the keyed `{#each}` mounts this component once per route
  const transitionProgress = createTransitionProgress();
  const plan = $derived.by<IScreenRenderPlan>(() =>
    resolveStackRoutePlan({
      route,
      index,
      routeCount,
      options,
      emitter,
      onPop: onPopRequested,
      loggedKeys,
      parentScope,
      transitionProgress,
    }),
  );

  // A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
  // header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
  const innerStackProps = $derived<Record<string, unknown>>({
    style: plan.innerStackStyle,
  });

  const scopeValue = $derived<INavigationScopeValue>({
    route,
    navigation,
    emitter,
    transitionProgress,
    edgeInsets: plan.edgeInsets,
    parent: parentScope,
  });
</script>

{#snippet content()}
  <NavigationScope value={scopeValue}>
    <ScreenComponent />
  </NavigationScope>
{/snippet}

{#snippet chrome()}
  <svelte:element
    this={RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME}
    {@attach hostProps(plan.headerConfig.props)}
  >
    {#if plan.searchBarProps !== undefined}
      <svelte:element
        this={RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME}
        {@attach hostProps(HEADER_SUBVIEW_PROPS)}
      >
        <svelte:element
          this={RNS_SEARCH_BAR_VIEW_NAME}
          {@attach hostProps(plan.searchBarProps)}
          {@attach searchBarRef(searchBarOptions?.ref)}
        />
      </svelte:element>
    {/if}
    {#each subviewHosts as host (host.kind)}
      <svelte:element
        this={RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME}
        {@attach hostProps(host.props)}
      >
        {#if host.imageProps !== undefined}
          <svelte:element this="image" {@attach hostProps(host.imageProps)} />
        {:else}
          {@render headerViews[host.kind]?.()}
        {/if}
      </svelte:element>
    {/each}
  </svelte:element>
  <svelte:element
    this={RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME}
    {@attach hostProps(plan.contentWrapperProps)}
  >
    {#if plan.safeAreaHost !== undefined}
      <svelte:element
        this={plan.safeAreaHost.viewName}
        {@attach hostProps(plan.safeAreaHost.props)}
      >
        {@render content()}
      </svelte:element>
    {:else}
      {@render content()}
    {/if}
  </svelte:element>
  {#if sheetFooterHost !== undefined}
    <svelte:element
      this={sheetFooterHost.viewName}
      {@attach hostProps(sheetFooterHost.props)}
    >
      {@render options.sheetFooter?.()}
    </svelte:element>
  {/if}
{/snippet}

<svelte:element
  this={plan.screenViewName}
  {@attach hostProps(plan.screenProps)}
>
  {#if plan.inModal}
    <svelte:element
      this={RNS_SCREEN_STACK_VIEW_NAME}
      {@attach hostProps(innerStackProps)}
    >
      <svelte:element
        this={RNS_SCREEN_VIEW_NAME}
        {@attach hostProps(plan.innerScreenProps)}
      >
        {@render chrome()}
      </svelte:element>
    </svelte:element>
  {:else}
    {@render chrome()}
  {/if}
</svelte:element>
