export function calculateRms(frame: Int16Array): number {
  if (frame.length === 0) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < frame.length; index += 1) {
    const normalized = (frame[index] ?? 0) / 32768;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / frame.length);
}
