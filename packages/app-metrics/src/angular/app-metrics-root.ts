import { Component, type OnInit } from '@angular/core';
import { markFirstRender } from '../core';

/** Marks the first render, so time-to-first-render is measured without a manual call */
@Component({
  selector: 'app-metrics-root',
  standalone: true,
  template: '<ng-content />',
})
export class AppMetricsRoot implements OnInit {
  ngOnInit(): void {
    markFirstRender();
  }
}
