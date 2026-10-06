<script lang="ts" module>
  // `RNSScreenStackHeaderConfig` requires every child to be a header subview, and `type` names
  // the slot this one fills
  const HEADER_SUBVIEW_PROPS: Record<string, unknown> = { type: 'searchBar' };
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
    // only from a capitalized identifier.
    component: ScreenComponent,
    onPopRequested,
  }: IStackScreenProps = $props();

  const searchBarOptions = $derived(options.headerSearchBarOptions);

  // `assignSearchBarHandle` is left out: the handle rides its own attachment on the leaf below, so
  // no `ref` key can leak into the props bag
  const loggedKeys = new Set<string>();
  const plan = $derived.by<IScreenRenderPlan>(() =>
    resolveStackRoutePlan({
      route,
      index,
      routeCount,
      options,
      emitter,
      onPop: onPopRequested,
      loggedKeys,
    }),
  );

  // A modal or `formSheet` screen has no navigation controller on iOS, so an inner stack hosts the
  // header bar. Its screen mirrors `activityState`, else native parks it off the bottom edge
  const innerStackProps = $derived<Record<string, unknown>>({
    style: plan.innerStackStyle,
  });
  const innerScreenProps = $derived<Record<string, unknown>>({
    style: plan.innerScreenStyle,
    activityState: plan.activityState,
  });

  const scopeValue = $derived<INavigationScopeValue>({
    route,
    navigation,
    emitter,
    parent: parentScope,
  });
</script>

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
  </svelte:element>
  <svelte:element
    this={RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME}
    {@attach hostProps(plan.contentWrapperProps)}
  >
    <NavigationScope value={scopeValue}>
      <ScreenComponent />
    </NavigationScope>
  </svelte:element>
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
        {@attach hostProps(innerScreenProps)}
      >
        {@render chrome()}
      </svelte:element>
    </svelte:element>
  {:else}
    {@render chrome()}
  {/if}
</svelte:element>
