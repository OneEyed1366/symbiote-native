import { vi } from 'vitest';

// Тесты компилируют `.svelte` сами, `customRenderer` подмешиваем здесь, а не в каждом файле
vi.mock(import('svelte/compiler'), async importOriginal => {
  const original = await importOriginal();
  const { fileURLToPath } = await import('node:url');
  const rendererModule = fileURLToPath(
    new URL('adapters/svelte/src/symbiote-renderer.ts', import.meta.url),
  );
  return {
    ...original,
    compile: (...[source, options]: Parameters<typeof original.compile>) =>
      original.compile(source, {
        ...options,
        experimental: {
          ...options?.experimental,
          customRenderer: rendererModule,
        },
      }),
  };
});
