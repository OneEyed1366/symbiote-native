<script lang="ts" module>
  import type { INavigatorPlatform } from '../../core';

  // backTitleVisible defaults to `true` on both platforms per the codegen spec's own default
  // (CT.WithDefault<boolean, 'true'>) - no ios/android divergence in v1 scope, so a single
  // constant stands in for the per-platform injection point ISliderPlatform-style adapters use
  // elsewhere.
  const NAVIGATOR_PLATFORM: INavigatorPlatform = { defaultHeaderBackTitleVisible: true };

  // react-native-screens' RNSScreenStackHeaderConfig.mm requires every header child to be an
  // RNSScreenStackHeaderSubview; `type: 'searchBar'` is how it knows which slot this one fills.
  const HEADER_SUBVIEW_PROPS: Record<string, unknown> = { type: 'searchBar' };
</script>

<script lang="ts">
  // One mounted route's native chrome. Split out of index.svelte so each route owns its own plan
  // derivation and its own attachments, torn down by an ordinary component unmount when the route
  // is popped - the Svelte equivalent of Vue's per-route render-loop closure.
  //
  // Every react-native-screens view here goes through `<svelte:element this={'RNSScreen'}>`
  // rather than a literal tag: their Fabric names are capitalized and un-hyphenated, so a literal
  // tag would parse as a COMPONENT reference in a Svelte template. Their props ride an
  // `{@attach hostProps(...)}` attachment rather than an attribute, because a dynamic tag
  // compiles through Svelte's generic setAttribute path and never the custom-element property-SET
  // path the object bag depends on - see ../attachments.ts for the full reasoning.
  //
  // The whole per-route tree is packed edge-to-edge with zero whitespace between sibling tags:
  // svelte-adapter-dom-shim skill §16, where a stray space would become a real RCTRawText child
  // of a react-native-screens view.
  import { Platform, dlog } from '@symbiote-native/engine';
  import {
    NAVIGATION_EVENT_BLUR,
    NAVIGATION_EVENT_FOCUS,
    RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
    RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME,
    RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
    RNS_SCREEN_STACK_VIEW_NAME,
    RNS_SCREEN_VIEW_NAME,
    RNS_SEARCH_BAR_VIEW_NAME,
    SCREEN_ON_APPEAR,
    SCREEN_ON_DISAPPEAR,
    SCREEN_ON_DISMISSED,
    SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
    SCREEN_ON_WILL_APPEAR,
    SCREEN_ON_WILL_DISAPPEAR,
    buildSearchBarPassthrough,
    resolveScreenRenderPlan,
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

  const plan = $derived.by<IScreenRenderPlan>(() =>
    resolveScreenRenderPlan({
      screenId: route.key,
      index,
      routeCount,
      options,
      platform: NAVIGATOR_PLATFORM,
      isAndroid: Platform.OS === 'android',
      screenPassthrough: {
        [SCREEN_ON_DISMISSED]: onPopRequested,
        [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: onPopRequested,
        // onAppear/onDisappear are the definitive visibility boundary (post-transition-
        // animation), so 'focus'/'blur' fire exactly once per transition; onWillAppear/
        // onWillDisappear fire BEFORE the animation runs, so wiring them to emit() too would
        // double-invoke useFocusEffect per transition - they only get a debug log here.
        [SCREEN_ON_WILL_APPEAR]: () =>
          dlog(`Stack: route "${route.name}" will appear at t=${Date.now()}`),
        [SCREEN_ON_APPEAR]: () => {
          dlog(`Stack: route "${route.name}" appeared (focus) at t=${Date.now()}`);
          emitter.emit(NAVIGATION_EVENT_FOCUS);
        },
        [SCREEN_ON_WILL_DISAPPEAR]: () =>
          dlog(`Stack: route "${route.name}" will disappear at t=${Date.now()}`),
        [SCREEN_ON_DISAPPEAR]: () => {
          dlog(`Stack: route "${route.name}" disappeared (blur) at t=${Date.now()}`);
          emitter.emit(NAVIGATION_EVENT_BLUR);
        },
      },
      // The imperative SearchBarCommands ref rides its OWN attachment on the RNSSearchBar leaf
      // below (../attachments.ts), never this passthrough map - same split Angular uses, so no
      // `ref` key can leak through to Fabric as a real prop.
      searchBarPassthrough: searchBarOptions
        ? buildSearchBarPassthrough(searchBarOptions, message =>
            dlog(`Stack: route "${route.name}" ${message}`),
          )
        : undefined,
    }),
  );

  // Investigation instrumentation (flicker-on-focus bug): the actual timing/z-order-relevant
  // values resolved onto the native RNSScreen, once per mounted route - rules a stackAnimation/
  // transitionDuration mismatch against react-native-screens' own native default in or out. Kept
  // behind DEBUG, never removed.
  let hasLoggedScreenProps = false;
  $effect(() => {
    const screenProps = plan.screenProps;
    if (hasLoggedScreenProps) return;
    hasLoggedScreenProps = true;
    dlog(
      `Stack: route "${route.name}" resolved screen props ` +
        `stackAnimation=${String(screenProps.stackAnimation)} ` +
        `stackPresentation=${String(screenProps.stackPresentation)} ` +
        `transitionDuration=${String(screenProps.transitionDuration)} ` +
        `gestureEnabled=${String(screenProps.gestureEnabled)} at t=${Date.now()}`,
    );
  });

  // A modal/formSheet screen has no UINavigationController of its own on iOS - nest an inner
  // RNSScreenStack/RNSScreen purely to host the native header bar (see isHeaderInModal's comment
  // in core/render-stack.ts). Skipping this leaves RNSScreenStackHeaderConfig with no navigation
  // controller to attach to, so the header silently never renders. activityState mirrors the
  // outer screen's own value - RNSScreen.mm treats an unset/inactive nested screen as not yet
  // pushed, leaving it parked at its pre-push transition position.
  const innerStackProps = $derived<Record<string, unknown>>({ style: plan.innerStackStyle });
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

{#snippet chrome()}<svelte:element this={RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME} {@attach hostProps(plan.headerConfig.props)}>{#if plan.searchBarProps !== undefined}<svelte:element this={RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME} {@attach hostProps(HEADER_SUBVIEW_PROPS)}><svelte:element this={RNS_SEARCH_BAR_VIEW_NAME} {@attach hostProps(plan.searchBarProps)} {@attach searchBarRef(searchBarOptions?.ref)}></svelte:element></svelte:element>{/if}</svelte:element><svelte:element this={RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME} {@attach hostProps(plan.contentWrapperProps)}><NavigationScope value={scopeValue}><ScreenComponent /></NavigationScope></svelte:element>{/snippet}<svelte:element this={plan.screenViewName} {@attach hostProps(plan.screenProps)}>{#if plan.inModal}<svelte:element this={RNS_SCREEN_STACK_VIEW_NAME} {@attach hostProps(innerStackProps)}><svelte:element this={RNS_SCREEN_VIEW_NAME} {@attach hostProps(innerScreenProps)}>{@render chrome()}</svelte:element></svelte:element>{:else}{@render chrome()}{/if}</svelte:element>
