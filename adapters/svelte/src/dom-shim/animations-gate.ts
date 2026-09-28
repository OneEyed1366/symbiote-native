// TODO: включить, когда API стабилизируется: `animate:flip` работает, shuffle-реордер нет
// Пока выключено для потребителя, тесты включают через `setShimAnimationsEnabled`

let enabled = false;

export function setShimAnimationsEnabled(value: boolean): void {
  enabled = value;
}

export function areShimAnimationsEnabled(): boolean {
  return enabled;
}
