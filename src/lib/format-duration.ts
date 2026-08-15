/** Format request durations using the most useful unit for the elapsed time. */
export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;

  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return remainder < 0.05
    ? `${minutes} min`
    : `${minutes} min ${remainder.toFixed(1)} s`;
}
