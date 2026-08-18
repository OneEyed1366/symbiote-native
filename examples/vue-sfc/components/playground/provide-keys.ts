// Typed InjectionKeys shared between ApiPlaygroundScreen.vue's provide()/app.provide() calls and
// the components that inject() them — a plain string key works too, but a typed InjectionKey<T>
// (Vue's own recommended form) is what actually types the return value of inject() without a cast.
import type { InjectionKey } from 'vue';

export type ITheme = { tone: string };

export const THEME_KEY: InjectionKey<ITheme> = Symbol('playground-theme');
export const PLUGIN_KEY: InjectionKey<string> = Symbol(
  'playground-plugin-installed',
);
export const DIRECT_PROVIDE_KEY: InjectionKey<string> = Symbol(
  'playground-direct-app-provide',
);
