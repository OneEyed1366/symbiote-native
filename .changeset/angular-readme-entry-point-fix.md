---
'@symbiote-native/angular': patch
---

README: the documented native entry point was the low-level `mount`/`AppRegistry.registerRunnable` escape hatch, not the real zero-config `bootstrapApplication` this adapter actually ships (`bootstrap.ts`) and that `cli new` scaffolds — rewritten to lead with it, demoting the low-level path to "for anything the defaults don't cover", matching every other adapter's README shape. Also missing `import '@symbiote-native/angular'`, the bare side-effect import that registers host behaviors. Fixes the opening line and Parity section, both of which only named React and Vue, omitting Svelte and Solid entirely. Corrects the Node requirement (react-native 0.86 needs `>=22.13`, not `>=22.11`), adds the missing `@angular/forms` peer and the `@babel/plugin-transform-class-static-block` requirement, and leads Install with `npx @symbiote-native/cli new`.
