/**
 * Formatting, Date (YYYY/MM/DD), Numeral (0-9 / ٠-٩), UUID, and Crypto Hash Utilities
 */

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Converts digits in a string or number according to the selected numeral system (Section 15.2)
 * Default is English/Latin digits (0-9), with optional Arabic-Indic digits (٠-٩).
 */
export function formatNumerals(
  input: string | number | undefined | null,
  system: 'latin' | 'arabic_indic' = 'latin'
): string {
  if (input === undefined || input === null) return '';
  const str = String(input);
  if (system === 'latin') return str;
  return str.replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

/**
 * Formats any valid Date or date string into strict YYYY/MM/DD format (Section 2)
 */
export function toYYYYMMDD(input?: Date | string | null): string {
  if (!input) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim().replace(/-/g, '/');
    const match = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      return `${y}/${m}/${d}`;
    }
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}/${m}/${d}`;
    }
    return trimmed;
  }

  const y = input.getFullYear();
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/**
 * Converts YYYY/MM/DD to YYYY-MM-DD for HTML <input type="date" />
 */
export function toInputDateValue(yyyyMmDd: string): string {
  if (!yyyyMmDd) return '';
  return yyyyMmDd.replace(/\//g, '-').slice(0, 10);
}

/**
 * Validates whether a date string is a valid calendar date in YYYY/MM/DD or YYYY-MM-DD format
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr) return false;
  const normalized = dateStr.trim().replace(/-/g, '/');
  const match = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const maxDays = new Date(year, month, 0).getDate();
  return day >= 1 && day <= maxDays;
}

/**
 * Calculates whole days elapsed between a YYYY/MM/DD date string and a reference date
 */
export function daysSinceDate(dateStr: string, referenceDate: Date = new Date()): number {
  if (!dateStr) return 0;
  const normalized = dateStr.trim().replace(/\//g, '-');
  const parsed = new Date(`${normalized}T00:00:00`);
  if (isNaN(parsed.getTime())) return 0;
  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const diffMs = refMidnight.getTime() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Offline-safe UUID v4 generator (Rule 5.2.3)
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes SHA-256 hex digest for tamper-evident attachment verification (P1.2)
 */
export async function computeSHA256(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic fallback hash for test environments without SubtleCrypto
  let h1 = 0xdeadbeef ^ content.length;
  let h2 = 0x41c6ce57 ^ content.length;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Formats readable sequential case code e.g. CS-0001
 */
export function formatCaseCode(sequenceNumber: number, prefix = 'CS'): string {
  return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`;
}

/**
 * Formats a number as Egyptian Pounds (ج.م)
 */
export function formatCurrencyEGP(amount: number | undefined | null): string {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('en-US')} ج.م`;
}

/**
 * Returns today's date in YYYY/MM/DD format
 */
export function getTodayYYYYMMDD(): string {
  return toYYYYMMDD(new Date());
}

/**
 * Formats device-scoped temporary offline code e.g. CS-D1-0001 (Rule 5.2.4 Option A)
 */
export function formatTempCaseCode(deviceCode: string, sequenceNumber: number): string {
  const cleanDevice = (deviceCode || 'D1').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `CS-${cleanDevice}-${String(sequenceNumber).padStart(4, '0')}`;
}
