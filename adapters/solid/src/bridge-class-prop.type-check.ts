// Compiled, not run: a component made by a bridge takes `class`, as a screen styles it that way
import type { defineDescriptorComponent } from './define-descriptor-component';
import type { defineOptionalDescriptorComponent } from './define-optional-descriptor-component';
import type { defineNativeViewComponent } from './primitives/define-native-view-component';

type IOwnProps = { testID?: string; children?: undefined };

// The props of the component each bridge makes
type IPlainProps = Parameters<
  ReturnType<typeof defineDescriptorComponent<IOwnProps>>
>[0];
type IOptionalProps = Parameters<
  ReturnType<typeof defineOptionalDescriptorComponent<IOwnProps>>
>[0];
type INativeViewProps = Parameters<
  ReturnType<typeof defineNativeViewComponent<object, IOwnProps>>
>[0];

export const plainTakesClass: IPlainProps = { class: 'card' };

export const optionalTakesClass: IOptionalProps = {
  class: ['card', 'card-active'],
};

export const nativeViewTakesClass: INativeViewProps = { class: 'card' };
