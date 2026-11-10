import {
  Fragment,
  cloneVNode,
  createVNode,
  defineComponent,
  getCurrentInstance,
  h,
  hasInjectionContext,
  inject,
  isVNode,
  mergeProps,
  onMounted,
  provide,
  ref,
} from 'vue';
import type { InjectionKey, Ref } from 'vue';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

type IThemeContext = { accent: Ref<string> };
const THEME_KEY: InjectionKey<IThemeContext> = Symbol('api-playground-theme');
const ALTERNATE_ACCENT = '#68d391';

const ProvideInjectChild = defineComponent({
  name: 'ProvideInjectChild',
  setup() {
    const theme = inject(THEME_KEY);
    const hasContextHere = hasInjectionContext();
    const instance = getCurrentInstance();
    return () => (
      <view class="tab-card">
        <text class="info-text">
          {`inject(THEME_KEY): ${theme === undefined ? 'undefined (no provider above)' : theme.accent.value}`}
        </text>
        <text class="info-text">{`hasInjectionContext() inside setup(): ${hasContextHere}`}</text>
        <text class="info-text">
          {`getCurrentInstance() inside setup(): ${instance === null ? 'null' : 'a real ComponentInternalInstance'}`}
        </text>
      </view>
    );
  },
});

export const ProvideInjectDemo = defineComponent({
  name: 'ProvideInjectDemo',
  setup() {
    const accent = ref(LINE_COLOR.introspection);
    provide(THEME_KEY, { accent });
    const outsideSetupCheck = ref<boolean | null>(null);
    // Runs after `setup()` returned, so no instance is left to inject against
    onMounted(() => {
      outsideSetupCheck.value = hasInjectionContext();
    });
    const rotateAccent = (): void => {
      accent.value =
        accent.value === LINE_COLOR.introspection
          ? ALTERNATE_ACCENT
          : LINE_COLOR.introspection;
    };
    return () => (
      <view class="section-nested">
        <text class="section-label">
          provide() / inject() / hasInjectionContext() / getCurrentInstance()
        </text>
        <ActionButton
          testID="provide-rotate"
          title="Rotate accent"
          onPress={rotateAccent}
          color={accent.value}
        />
        <ProvideInjectChild />
        <text class="info-text">
          {`hasInjectionContext() from onMounted (outside setup): ${outsideSetupCheck.value ?? 'not checked yet'}`}
        </text>
      </view>
    );
  },
});

export const RawRenderFunctionDemo = defineComponent({
  name: 'RawRenderFunctionDemo',
  setup() {
    return () => {
      const original = createVNode(
        'text',
        { class: 'list-row-text', testID: 'raw-h-original' },
        'built with createVNode()',
      );
      const cloned = cloneVNode(original, {
        class: 'accent-note',
        testID: 'raw-h-cloned',
      });
      return (
        <view class="section-nested">
          <text class="section-label">
            h() / createVNode / cloneVNode / isVNode / Fragment / mergeProps
          </text>
          <text class="note-text">
            Every element on this whole screen already compiles down to h()
            through @vue/babel-plugin-jsx — this widget just calls the
            primitives directly instead of through JSX sugar.
          </text>
          {original}
          {cloned}
          <text class="info-text">{`isVNode(original): ${isVNode(original)} · isVNode({}): ${isVNode({})}`}</text>
          {h(Fragment, {}, [
            <text key="fragment-a" class="list-row-text">
              Fragment child A
            </text>,
            <text key="fragment-b" class="list-row-text">
              Fragment child B — one h(Fragment, …) call, two roots
            </text>,
          ])}
          {h(
            'text',
            mergeProps(
              { class: 'list-row-text' },
              { testID: 'raw-h-merged' },
              { style: { opacity: 0.75 } },
            ),
            'props merged via mergeProps()',
          )}
        </view>
      );
    };
  },
});
