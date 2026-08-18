## §22. `injectX()`, not `useX()`: the real Angular convention for an injection-context function, and why `this` is valid inside a template

**The lifecycle-bucket naming `<adapter_src_follows_framework_idioms>` calls for is `injectors/`
+ `injectX()`, never `hooks/` + `useX()`.** A standalone function that calls `inject()` internally
(so it must run in an injection context: a component/directive constructor or field initializer)
is called an **"Injection Function"** in the Angular ecosystem, and the adopted naming convention
is the `inject` prefix, not a borrowed React `use`/Vue-composable-flavored name. Confirmed 2026-07
by an Angular Team member (`synalx`) in
[angular/angular#59615](https://github.com/angular/angular/issues/59615): *"If a function uses
inject internally... I think we should properly showcase that the function needs to be called in
an injection context, that's why we went with `injectX` pattern."* ngxtension (`injectNetwork()`,
folder `utilities/injectors/`) and TanStack Query Angular (`injectQuery()`) independently confirm
the same convention. `useX` is the flagged-as-inferior alternative: it doesn't signal the injection-
context requirement the way `injectX` does, and can't be linted for it. `@symbiote-native/navigation`'s
Angular adapter had this backwards until a 2026-07 refactor: `packages/navigation/src/angular/hooks/`
(`useNavigation`, `useRoute`, `useIsFocused`, `useFocusEffect`, `useNavigationState`) is now
`injectors/` (`injectNavigation`, `injectRoute`, `injectIsFocused`, `injectFocusEffect`,
`injectNavigationState`): the corrected reference shape for any future Angular-adapter injection
function in this codebase. `services/` (real `@Injectable` classes like
`ColorSchemeService`/`WindowDimensionsService`) stays a SEPARATE bucket, since those are DI
singletons, not per-call injection functions.

**A component's imperative API (reached via a template reference variable or `@ViewChild`) should
be plain public methods directly on the class, never a nested wrapper object.** Angular
Material's own components confirm this: `MatDrawer.open()`/`.close()`/`.toggle()`,
`MatPaginator.nextPage()`, `MatSort` all expose their imperative surface as flat public methods on
the instance, never behind a sub-property. A `readonly handle: ISomeHandle = { push: () => ..., ...
}` field (forcing `nav.handle.push(...)` access) is a React `useImperativeHandle` habit leaking in:
React needs that pattern because a function component has no stable instance identity across
renders, but an Angular component **is** a real, persistent class instance, so the fix is simply:
`class Stack implements INavigatorHandle { readonly push = (...) => this.dispatch(...); ... }`,
reached as `nav.push(...)`. `@symbiote-native/navigation`'s `Stack`/`Tab`/`Drawer` were fixed this
way in the same 2026-07 refactor as the injectX rename above.

**`this` inside a component's own template is a legal, type-safe self-reference**, confirmed by
reading the vendored compiler: `.vendors/angular/packages/compiler/src/expression_parser/
{ast.ts,parser.ts}` parses it as `ThisReceiver`, distinct from the default `ImplicitReceiver`, and
`.../template/pipeline/src/ingest.ts` compiles it straight to `ir.ContextExpr(job.root.xref)`,
i.e. the component instance. So `[someInput]="this"` is valid, idiomatic Angular for handing a
child/directive "the component itself" when it expects a value structurally matching an interface
the component implements, with no extra wrapper field or getter needed. This is how `Stack`/`Tab`/
`Drawer` pass themselves down to `NavigationScopeDirective` and to each mounted screen's
`navigation` input post-refactor.
