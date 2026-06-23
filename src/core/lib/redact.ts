export function redactSensitiveText(text: string, secret: string): string {
  if (!secret) {
    return text;
  }

  return text.split(secret).join('[redacted]');
}
