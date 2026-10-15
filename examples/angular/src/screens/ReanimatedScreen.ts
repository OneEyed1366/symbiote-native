import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { RaAnimations } from './reanimated/RaAnimations';
import { RaCss } from './reanimated/RaCss';
import { RaDerived } from './reanimated/RaDerived';
import { RaEnteringExiting } from './reanimated/RaEnteringExiting';
import { RaFrames } from './reanimated/RaFrames';
import { RaLayoutTransitions } from './reanimated/RaLayoutTransitions';
import { RaList } from './reanimated/RaList';
import { RaMeasure } from './reanimated/RaMeasure';
import { RaParity } from './reanimated/RaParity';
import { RaScroll } from './reanimated/RaScroll';
import { RaSharedState } from './reanimated/RaSharedState';
import { RaSharedTransition } from './reanimated/RaSharedTransition';
import { RaTransformOrigin } from './reanimated/RaTransformOrigin';
import { RaWorklets } from './reanimated/RaWorklets';
import './reanimated/keyframes.css';
import './reanimated/sections.css';

// Everything react-native-reanimated 4.7.1 does, one section each, running on the UI thread over
// the native half of Reanimated. The last section checks the package's exports against the list
@Component({
  selector: 'ReanimatedScreen',
  standalone: true,
  imports: [
    RaAnimations,
    RaCss,
    RaDerived,
    RaEnteringExiting,
    RaFrames,
    RaLayoutTransitions,
    RaList,
    RaMeasure,
    RaParity,
    RaScroll,
    RaSharedState,
    RaSharedTransition,
    RaTransformOrigin,
    RaWorklets,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <safe-area-view class="ra-screen">
      <scroll-view class="ra-scroll" contentContainerStyle="ra-content">
        <text class="ra-title">Reanimated</text>
        <RaAnimations />
        <RaDerived />
        <RaEnteringExiting />
        <RaLayoutTransitions />
        <RaTransformOrigin />
        <RaScroll />
        <RaList />
        <RaFrames />
        <RaCss />
        <RaWorklets />
        <RaSharedState />
        <RaSharedTransition />
        <RaMeasure />
        <RaParity />
      </scroll-view>
    </safe-area-view>
  `,
})
export class ReanimatedScreen {}
