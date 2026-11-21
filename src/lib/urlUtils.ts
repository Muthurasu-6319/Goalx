/**
 * Strict URL and filename sanitization utilities for external links, routes, and uploads.
 */

export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeHttpUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!isSafeHttpUrl(trimmed)) return '';
  return trimmed.slice(0, 1000);
}

export function isSafeInternalRoute(route: string | null | undefined): boolean {
  if (!route) return false;
  const trimmed = route.trim();
  return trimmed.startsWith('/') && !trimmed.startsWith('//') && !/[\r\n<>]/.test(trimmed);
}

export function sanitizeInternalRoute(route: string | null | undefined, fallback = '/notifications'): string {
  if (!route) return fallback;
  const trimmed = route.trim();
  return isSafeInternalRoute(trimmed) ? trimmed.slice(0, 240) : fallback;
}

export function sanitizeStorageFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/\.\.+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{3,}/g, '__')
    .slice(0, 120);
  return cleaned || 'receipt';
}
