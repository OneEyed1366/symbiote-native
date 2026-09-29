# React public API surface (React 19.3, `.vendors/react` canary)

Source of truth: `.vendors/react/packages/react/index.js` (top-level exports),
`.vendors/react/packages/react-reconciler/src/ReactFiberConfig.js` and
`react-native-renderer/src/ReactFiberConfigFabric.js` (host-config surface),
cross-checked against react.dev's current reference structure (Hooks,
Components, APIs, Directives). Scope: `react` core only, router/redux/etc
excluded per decision.

Category tags: `[core-reconciler-relevant]` touches mount/update/unmount,
refs, host tree, or scheduling, i.e. our adapter's job. `[pure-userland]` is
state/logic only, works unmodified once the reconciler runs at all.
`[dom-specific]` has no meaning off a browser DOM.

## Top-level React exports (`React.*`)

- `Component` / `PureComponent`: class component base. [pure-userland]
- `Fragment`: grouping without a host node. [core-reconciler-relevant], must not emit a host instance
- `StrictMode`: dev-only double-invoke. [pure-userland]
- `Profiler`: onRender timing callback. [pure-userland]
- `Suspense`: fallback boundary while children suspend. [core-reconciler-relevant], needs `maySuspendCommit`/`startSuspendingCommit` support, see below
- `memo`: skip re-render on shallow-equal props. [pure-userland]
- `forwardRef`: legacy ref forwarding, superseded by ref-as-prop in 19 but still exported. [core-reconciler-relevant], ref attach/detach path
- `lazy`: code-split component via dynamic import plus Suspense. [core-reconciler-relevant], Suspense dependency
- `createContext` / `Context.Provider` / `useContext`: [pure-userland], no host node emitted
- `createElement` / `cloneElement` / `isValidElement`: element factory and introspection. [pure-userland]
- `createRef`: legacy ref object factory. [pure-userland]
- `use`: read a promise (Suspense) or context value conditionally, during render. Promise case is [core-reconciler-relevant], context case is [pure-userland]
- `Children.map/forEach/count/only/toArray`: opaque-children helpers. [pure-userland]
- `cache` / `cacheSignal`: React Server Components request memoization. Server-only, N/A off a server runtime
- `startTransition`: mark update as non-urgent. [core-reconciler-relevant], needs `getCurrentEventPriority`/lane priority
- `Activity` (19.2+, stable in this vendor snapshot): keep a subtree mounted but hidden, preserving state. [core-reconciler-relevant], needs Offscreen-style visibility toggle, `cloneHiddenInstance`/`cloneHiddenTextInstance`
- `ViewTransition` and `addTransitionType`: opt-in view-transition wrapper component. [core-reconciler-relevant], DOM View Transitions API shaped; on Fabric this is either a no-op passthrough or maps to a future native transition primitive, currently N/A
- `unstable_SuspenseList`: orders/staggers sibling Suspense reveals. [core-reconciler-relevant], Suspense-dependent, unstable
- `unstable_LegacyHidden`, `unstable_Scope`, `unstable_TracingMarker`, `unstable_getCacheForType`, `unstable_useCacheRefresh`: internal/experimental, not part of the stable public contract, skip unless a concrete need surfaces
- `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`, `__COMPILER_RUNTIME`: private renderer/compiler plumbing only, not user-facing API, excluded from parity scope
- `version`: string constant. [pure-userland]

## Hooks

- `useState`, `useReducer`: [pure-userland]
- `useEffect`, `useLayoutEffect`, `useInsertionEffect`: commit-phase timing hooks. [core-reconciler-relevant], layout effects must fire after host mutations are committed and before paint, which depends on our engine's commit/paint boundary existing at all
- `useEffectEvent` (19.2+): extract non-reactive logic out of an Effect. [pure-userland], no new host dependency, just a closure-freshness helper
- `useContext`: [pure-userland]
- `useCallback`, `useMemo`: memoization. [pure-userland]
- `useRef`: plain box is [pure-userland]; matters for [core-reconciler-relevant] only via `useImperativeHandle`/ref attach
- `useImperativeHandle`: expose a custom instance handle through a ref. [core-reconciler-relevant], host instance attach/detach timing
- `useDebugValue`: devtools label. [pure-userland]
- `useDeferredValue`: low-priority re-render of a value. [core-reconciler-relevant], lane/priority scheduling
- `useTransition`: returns `[isPending, startTransition]`. [core-reconciler-relevant], priority scheduling
- `useId`: stable SSR-safe id. [pure-userland], id generation is renderer-agnostic, just needs a working tree path
- `useSyncExternalStore`: subscribe to an external store with tearing-safe reads. [pure-userland]
- `use`: see above, mixed
- `useActionState`: returns `[state, formAction, isPending]` bound to a transition. [core-reconciler-relevant], built on `startTransition`; the "form" concept itself is dom-specific, but the state/pending mechanics are renderer-agnostic and usable with any async callback, not just a literal `<form>`
- `useOptimistic`: optimistic state during a pending action. [pure-userland], transition-based, no host dependency
- `useFormStatus` (from `react-dom`, not `react`, listed for completeness): reads the nearest `<form>` Action status. [dom-specific], N/A without a native form host component

## React 19 changes relevant to a custom renderer

- Ref as a plain prop: function components can declare `ref` as a normal parameter without `forwardRef`; `forwardRef` still works (deprecation warning planned, not removed). Reconciler-level this is the same attach/detach path as before, no new host-config method; verify our adapter's prop diffing doesn't special-case-drop a `ref` prop key when treating it as ordinary.
- Ref cleanup functions: a ref callback may return a cleanup function, called on detach or before the next ref call. Purely fiber-side bookkeeping in `commitAttachRef`/`commitDetachRef`, no host-config surface required, but our adapter must not assume a ref callback's return value is ignored if it wraps or proxies ref callbacks anywhere.
- Actions, `useActionState`, `useOptimistic`, `startTransition` with async functions: `startTransition` now accepts an async callback and keeps `isPending` true until it settles. Renderer-agnostic; the "form" framing is docs convention, not a hard host dependency, usable with any async handler such as a Pressable's onPress.
- `use()` for promises: suspends the nearest `Suspense` boundary until the promise resolves. Requires our engine to actually support Suspense commit suspension (the `maySuspendCommit` family below); currently the biggest open question for host-config completeness.
- `Activity`: mount-but-hidden subtrees that preserve state (successor to the old experimental Offscreen). Needs a "hidden clone" concept, `cloneHiddenInstance`/`cloneHiddenTextInstance` in the host config (see Fabric's implementation, which unmounts view content but keeps the fiber).
- `ViewTransition`: DOM View Transitions wrapper; the reconciler calls `suspendOnActiveViewTransition` and gesture-related config hooks. No native-view equivalent exists yet; treat as unsupported/no-op, not a parity gap to close blindly.
- `useEffectEvent`: no reconciler dependency, safe to treat as already working once function components render at all.

## `react-reconciler` HostConfig surface

From `ReactFiberConfigFabric.js`, i.e. what RN's own Fabric renderer
implements, the actual reference host config for the platform we target. Our
React adapter should be checked method for method against this list.

- `createInstance`, `createTextInstance`, `appendInitialChild`, `finalizeInitialChildren`: mount path
- `getRootHostContext`, `getChildHostContext`, `shouldSetTextContent`: tree-shape decisions during render
- `getPublicInstance`, `getPublicInstanceFromInternalInstanceHandle`: what a ref resolves to
- `prepareForCommit`, `resetAfterCommit`, `clearContainer`: commit bracketing
- `supportsMutation` (false on Fabric) versus `supportsPersistence` (true): Fabric is clone-on-write persistent, matching `<clone_on_write_lives_in_engine>`. Our React adapter runs in `supportsMutation: true` mode instead, per the M1/M2 notes. This is a deliberate, already-recorded divergence, not a gap.
- `cloneInstance`, `cloneHiddenInstance`, `cloneHiddenTextInstance`: persistent-mode update/hide path
- `createContainerChildSet`, `appendChildToContainerChildSet`, `finalizeContainerChildren`, `replaceContainerChildren`: persistent child-set commit
- `preparePortalMount`: portal target registration, see `createPortal` note below
- `detachDeletedInstance`: unmount cleanup hook
- `scheduleTimeout`/`cancelTimeout`/`noTimeout`: timer plumbing for Suspense retries
- `setCurrentUpdatePriority`/`getCurrentUpdatePriority`/`resolveUpdatePriority`: event-priority lanes, needed for `startTransition`/`useTransition`/`useDeferredValue` to actually defer
- `maySuspendCommit`, `maySuspendCommitOnUpdate`, `maySuspendCommitInSyncRender`, `preloadInstance`, `startSuspendingCommit`, `suspendInstance`, `waitForCommitToBeReady`, `getSuspendedCommitReason`: the full Suspense-on-commit machinery. This is the block to check first; if our adapter's host config stubs these out (returns false or no-op), `<Suspense>` plus `use(promise)` will not actually hold the commit and will show broken or flashing content instead of the fallback.
- `createFragmentInstance`, `updateFragmentInstanceFiber`, `commitNewChildToFragmentInstance`, `deleteChildFromFragmentInstance`: Fragment refs, a `<Fragment ref>`, i.e. the newer API letting a Fragment itself expose an imperative handle over its host children
- `resetFormInstance`, `HostTransitionContext`, `NotPendingTransition`: DOM-form-action plumbing, N/A off a native `<form>` host component
- `suspendOnActiveViewTransition` and view-transition config hooks: N/A, see `ViewTransition` above

## DOM-specific surface (listed for completeness, not silently dropped)

- `createPortal` (react-dom): renders children into a different DOM subtree while keeping React context. A native analog would be mounting into a different native surface/window, conceivable (e.g. a modal's native host) but that is a `react-native-renderer`/RN-core feature (`AppContainer`, native modals), not something `react` core itself defines. Evaluate against RN's own portal story, not react-dom's.
- `dangerouslySetInnerHTML`: raw HTML injection, no native-view equivalent, N/A.
- Form Actions bound to a literal `<form>` element plus `useFormStatus`: N/A without a native form host component. The mechanics (`useActionState`/`startTransition` with async functions) work standalone and are in scope.
- Hydration APIs (`hydrateRoot`, selective hydration, `HydratableInstance`): SSR-only, N/A for a native app with no server-rendered markup.
- Resource preloading (`preload`, `preinit`, `preconnect`, document metadata hoisting `<title>`/`<meta>`/`<link>`): browser-document-specific, N/A.

## Verified this session

`.vendors/react` (read 2026-09-25) is React 19.3.0 canary, ahead of the 19.2
stable release covered by web search: it already ships `Activity`,
`useEffectEvent`, `ViewTransition`, `cache`/`cacheSignal`. Treat this file as
canary-current, re-diff if `.vendors/react` is bumped.

Not yet done: diffing this catalog against `adapters/react/src` to produce
the actual gap list. That is the next step for whichever agent picks up the
React adapter parity work.
