import { copySvelteSources } from '../../scripts/copy-svelte-sources.mjs';
import { emitSvelteDeclarations } from '../../scripts/emit-svelte-declarations.mjs';

copySvelteSources(import.meta.dirname);
await emitSvelteDeclarations(import.meta.dirname);
