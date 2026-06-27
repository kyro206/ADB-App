import * as m from '../../paraglide/messages';
import deviceDb from '../../assets/device-db.json';

export function getMarketingName(model: string, brand?: string): string {
  if (!model) return '';
  if (brand && (deviceDb as any)[brand]) {
    const name = (deviceDb as any)[brand][model];
    if (name) return `${brand} ${name}`;
  }
  for (const [dbBrand, models] of Object.entries(deviceDb)) {
    const name = (models as any)[model];
    if (name) return `${dbBrand} ${name}`;
  }
  return '';
}

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

export function translateError(error: any): string {
  const msg = error?.message || String(error);
  const lowerMsg = msg.toLowerCase();
  
  if (msg === 'ERROR_DEVICE_NOT_FOUND' || (lowerMsg.includes('device') && lowerMsg.includes('not found'))) {
    return m.error_device_not_found();
  }
  if (msg === 'ERROR_UNAUTHORIZED' || lowerMsg.includes('unauthorized')) {
    return m.error_unauthorized();
  }
  if (msg === 'ERROR_TIMEOUT' || lowerMsg.includes('timeout')) {
    return m.error_timeout();
  }
  if (msg === 'ERROR_CONNECTION_FAILED' || lowerMsg.includes('failed to connect') || lowerMsg.includes('connection refused') || lowerMsg.includes('connection failed')) {
    return m.error_connection_failed();
  }

  return msg;
}
