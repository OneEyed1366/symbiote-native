// Один активный запрос ресинка токена, новый прерывает предыдущий
let lastAbortController: AbortController | null = null;

export function abortPendingRegistration(): void {
  lastAbortController?.abort();
}

export function startAbortableRegistration(): AbortSignal {
  abortPendingRegistration();
  lastAbortController = new AbortController();
  return lastAbortController.signal;
}
