// Pulls in svelte's ambient global declarations ($state/$effect/...) for this package's tsc
// program. adapters/svelte gets these for free because render.ts does a real value import from
// 'svelte' (any file in a program importing a module loads its ambient globals for the whole
// program); this package has no such import, so a triple-slash reference does the same job
// explicitly rather than relying on an incidental side-effect.
/// <reference types="svelte" />
