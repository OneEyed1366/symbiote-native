import { configDefaults, defineConfig } from 'vitest/config';

// `e2e/**` is Detox and needs a real device, a unit run skips it
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    passWithNoTests: true,
  },
});
