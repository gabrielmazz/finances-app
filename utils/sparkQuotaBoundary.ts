/** [[Operações Ordinárias Spark]]: pequena diferença entre relógios não autoriza trocar a intenção nem relaxar a cota. */
export function getSparkQuotaBoundaryRecovery(attemptedWindow: number, now: number) {
  const currentWindow = Math.floor(now / 60000) * 60000;
  if (currentWindow === attemptedWindow + 60000) return { waitMs: 0, readyAt: currentWindow, window: currentWindow };
  if (currentWindow !== attemptedWindow) return null;
  const elapsed = now - currentWindow;
  if (elapsed < 1000) return { waitMs: 1050 - elapsed, readyAt: currentWindow + 1000, window: currentWindow };
  if (elapsed >= 59000) return { waitMs: 60050 - elapsed, readyAt: currentWindow + 60000, window: currentWindow + 60000 };
  return null;
}
