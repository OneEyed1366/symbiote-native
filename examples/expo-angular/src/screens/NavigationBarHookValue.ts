import { Component, computed, inject } from '@angular/core';
import { NavigationBarVisibilityService } from '@symbiote-native/navigation-bar/angular';
import { ResultRow } from '../components/ResultRow';

@Component({
  selector: 'NavigationBarHookValue',
  standalone: true,
  imports: [ResultRow],
  template: `<ResultRow
    testID="navigation-bar-hook"
    label="useVisibility"
    [value]="visibilityText()"
  />`,
})
export class NavigationBarHookValue {
  private readonly visibility = inject(NavigationBarVisibilityService)
    .visibility;
  readonly visibilityText = computed(() => this.visibility() ?? 'loading…');
}
