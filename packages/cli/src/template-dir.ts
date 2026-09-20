import type { IFramework, IVueFlavor } from './types.js';

// Every IFramework maps 1:1 to a templates/js/<dir> folder, except 'vue' — which has two real
// flavors (templates/js/vue-tsx, templates/js/vue-sfc). See templates/README.md.
export function resolveJsTemplateDir(
  framework: IFramework,
  vueFlavor: IVueFlavor | undefined,
): string {
  if (framework !== 'vue') return framework;
  return `vue-${vueFlavor ?? 'sfc'}`;
}
