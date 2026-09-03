import { Pipe, type PipeTransform } from '@angular/core';

// Custom @Pipe, implementing PipeTransform. `pure: true` (the default) is left implicit - this
// pipe only reads its own argument, so it re-runs only when that reference/value changes, exactly
// the behavior `pure` describes.
@Pipe({
  name: 'playgroundShout',
  standalone: true,
})
export class PlaygroundShoutPipe implements PipeTransform {
  transform(value: string, exclamations = 1): string {
    return `${value.toUpperCase()}${'!'.repeat(exclamations)}`;
  }
}
