export const words = (value: string) =>
  value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, '')) ?? [];

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function aspectRatio(width: number, height: number): string {
  if (!width || !height) return '-';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function formatRate(rate: number): string {
  return rate > 0 ? `${Number.isInteger(rate) ? rate : rate.toFixed(2)} Hz` : '-';
}

export function formatBytes(bytes: number): string {
  if (bytes < 0) return '-';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function appTone(packageName: string): string {
  return `tone-${[...packageName].reduce((total, character) => total + character.charCodeAt(0), 0) % 6}`;
}
