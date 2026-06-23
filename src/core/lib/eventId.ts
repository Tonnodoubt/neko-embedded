export function createEventId(scope: string): string {
  return `${scope}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
