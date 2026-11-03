<!-- This tab is the content of a root Stack screen, `getParent()` reaches that Stack -->
<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import LabeledChoice from '../../components/LabeledChoice.vue';
import Recipe from '../../components/Recipe.vue';
import ScreenHero from '../../components/ScreenHero.vue';
import SwitchRow from '../../components/SwitchRow.vue';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { useNestedPanel } from './nested-panel';
import { CONTAINER_CHOICES } from './nested-settings';

const COLOR = LINE_COLOR.structure;
const parentRecipe = recipeById('nested-parent');
const headerRecipe = recipeById('nested-double-header');
const containerRecipe = recipeById('nested-container');

const { settings, update } = useNestedPanel();
const navigation = useNavigation();
const parent = computed(() => navigation.value.getParent());
const canPopParent = computed(
  () => parent.value !== undefined && 'pop' in parent.value,
);

function popParent() {
  const handle = parent.value;
  if (handle !== undefined && 'pop' in handle) handle.pop();
}
</script>

<template>
  <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.NestedNavigators"
        title="Nested navigators"
        body="A Tab navigator inside a Stack screen, with a Stack inside one of its tabs."
      />
      <Recipe :recipe="parentRecipe">
        <text class="info-text">
          {{
            `parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`
          }}
        </text>
        <ActionButton
          testID="nested-pop-parent"
          title="Pop parent Stack (via getParent)"
          :onPress="popParent"
          :color="COLOR"
        />
      </Recipe>
      <Recipe :recipe="headerRecipe">
        <SwitchRow
          testID="nested-parent-header"
          label="headerShown of the parent screen"
          :value="settings.isParentHeader"
          :onChange="isParentHeader => update({ isParentHeader })"
          :color="COLOR"
        />
      </Recipe>
      <Recipe :recipe="containerRecipe">
        <LabeledChoice
          testID="nested-container"
          label="nativeContainerStyle of the inner Stack"
          :value="settings.container"
          :options="CONTAINER_CHOICES"
          :onChange="container => update({ container })"
          :color="COLOR"
        />
      </Recipe>
    </view>
  </scroll-view>
</template>
