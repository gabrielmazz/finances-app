export const MAX_EMAIL_LENGTH = 254;

export const MAX_PASSWORD_LENGTH = 128;

export const normalizeEmailForAuth = (value: string) =>
  value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);

export const clampEmailInput = (value: string) => value.slice(0, MAX_EMAIL_LENGTH);

export const clampPasswordInput = (value: string) => value.slice(0, MAX_PASSWORD_LENGTH);

export const formatRemainingTime = (remainingMs: number) => {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}min`;
  }

  return `${minutes}min ${seconds}s`;
};
