import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import stylesModule from './App.module.css';

@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="containerClass">
      <text>Details screen</text>
    </view>
  `,
})
export class DetailsScreen {
  readonly containerClass = stylesModule.container;
}
