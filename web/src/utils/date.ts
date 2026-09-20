/**
 * Parses Hikvision wall-clock timestamp string ("YYYY-MM-DD HH:mm:ss" or ISO) 
 * into a local Date object without unexpected timezone offset shifts.
 */
export function parseSegmentTime(dateStr: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.replace('T', ' ').replace('Z', '');
  const parts = clean.split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '00:00:00';
  
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, s] = timePart.split(':').map(Number);
  
  return new Date(y || 1970, (m || 1) - 1, d || 1, h || 0, min || 0, s || 0);
}

/**
 * Formats a Date to 24-hour time string "HH:mm:ss"
 */
export function format24hTime(date: Date, includeSeconds: boolean = true): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  if (!includeSeconds) return `${h}:${m}`;
  const s = pad(date.getSeconds());
  return `${h}:${m}:${s}`;
}

/**
 * Parses a camera local time string ("YYYY-MM-DDTHH:mm:ss" or ISO with/without offset)
 * into a local Date representing the camera's wall-clock time.
 */
export function parseCameraTime(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [_, y, m, d, h, min, s] = match.map(Number);
  return new Date(y, m - 1, d, h, min, s);
}

/**
 * Formats a Date to "YYYY-MM-DD HH:mm:ss" wall-clock string.
 */
export function formatClockTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

export interface TimeDifferenceResult {
  text: string;
  isDifferent: boolean;
  diffSeconds: number;
}

/**
 * Compares camera wall-clock time with browser/system time and returns a human-readable difference.
 */
export function formatTimeDifference(cameraDate?: Date | null, browserDate: Date = new Date()): TimeDifferenceResult {
  if (!cameraDate || isNaN(cameraDate.getTime())) {
    return { text: 'Unknown', isDifferent: false, diffSeconds: 0 };
  }

  const diffMs = cameraDate.getTime() - browserDate.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSeconds);

  // Consider in sync if within 5 seconds to account for network/request latency
  if (absSec < 5) {
    return {
      text: 'In sync with browser',
      isDifferent: false,
      diffSeconds,
    };
  }

  const isBehind = diffSeconds < 0;
  const suffix = isBehind ? 'behind browser' : 'ahead of browser';

  const totalDays = Math.floor(absSec / 86400);
  const hours = Math.floor((absSec % 86400) / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = absSec % 60;

  const parts: string[] = [];
  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const days = totalDays % 365;
    parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  } else if (totalDays > 0) {
    parts.push(`${totalDays} day${totalDays > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  } else if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min`);
  } else if (minutes > 0) {
    parts.push(`${minutes} min`);
    if (seconds > 0) parts.push(`${seconds} sec`);
  } else {
    parts.push(`${seconds} sec`);
  }

  return {
    text: `${parts.join(', ')} ${suffix}`,
    isDifferent: true,
    diffSeconds,
  };
}
