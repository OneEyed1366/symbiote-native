// Shared building blocks for the Options-API corner of the playground (OptionsApiChild.vue):
// a `mixins` entry, an `extends` base, and the module augmentation that types the two
// runtime-installed `app.config.globalProperties` fields (set once from ApiPlaygroundScreen.vue's
// own setup(), via `app.mixin()`/globalProperties directly) so reading them off `this` in an
// Options component needs no cast — Vue's own documented way to type globalProperties.
import { defineComponent } from 'vue';

declare module 'vue' {
  interface ComponentCustomProperties {
    $playgroundGreeting?: string;
  }
}

// A real `mixins` entry (Options-API row): its own `created()` hook merges in alongside the
// host component's, setting a plain instance flag no `data()` of the host component declares.
export const loggingMixin = defineComponent({
  data() {
    return { mixinHit: false };
  },
  created() {
    this.mixinHit = true;
  },
});

// A real `extends` base (Options-API row): the host component below extends this object
// directly, inheriting its `data()` field without redeclaring it.
export const baseCounterOptions = defineComponent({
  data() {
    return { extendedFlag: true };
  },
});
