import { BeneficiaryCase } from '../types/models';

export interface DuplicateMatch {
  matchedCase: BeneficiaryCase;
  matchType: 'exact_national_id' | 'exact_phone' | 'fuzzy_arabic_name';
  similarity: number; // 0.0 to 1.0
  reason_ar: string;
}

/**
 * Normalizes Arabic text for smart deduplication and search (Section 14 P1.4):
 * - Unifies Alef variants (أ، إ، آ، ٱ -> ا)
 * - Unifies Teh Marbuta (ة -> ه)
 * - Unifies Alef Maqsura / Yeh variants (ى، ئ -> ي)
 * - Unifies Waw with Hamza (ؤ -> و)
 * - Strips Arabic diacritics (تشكيل) and Tatweel (ـ)
 * - Normalizes compound prefixes (عبد ال -> عبدال)
 * - Converts Arabic-Indic digits (٠-٩) to Latin digits (0-9)
 */
export function normalizeArabicText(input: string | undefined | null): string {
  if (!input) return '';
  const arabicDigitsMap: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
  };

  return input
    .trim()
    .replace(/[٠-٩]/g, (d) => arabicDigitsMap[d] || d)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Strip diacritics & tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/عبد\s+ال/g, 'عبدال')
    .replace(/ابو\s+/g, 'ابو')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normalizes phone numbers while strictly preserving leading zeros for storage,
 * and extracting canonical digits for duplicate comparison.
 */
export function normalizePhoneForComparison(phone: string | undefined | null): string {
  if (!phone) return '';
  const clean = normalizeArabicText(phone).replace(/\D/g, '');
  if (!clean) return '';
  // Normalize country prefix e.g. +2010... or 002010... to 010...
  if (clean.startsWith('0020') && clean.length > 11) {
    return '0' + clean.slice(4);
  }
  if (clean.startsWith('20') && clean.length === 12) {
    return '0' + clean.slice(2);
  }
  return clean;
}

/**
 * Computes Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Computes similarity (0..1) between two Arabic names, accounting for:
 * 1. Orthographic normalization (Hamzas, Teh Marbuta, Yeh)
 * 2. Token order independence (e.g. "محمد أحمد علي" vs "محمد علي أحمد")
 * 3. Edit distance on full normalized name
 */
export function calculateArabicNameSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeArabicText(nameA);
  const normB = normalizeArabicText(nameB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const maxLen = Math.max(normA.length, normB.length);
  const directSim = 1 - levenshteinDistance(normA, normB) / maxLen;

  // Token-sorted comparison to handle reordered middle/family names
  const tokensA = normA.split(' ').filter(Boolean).sort().join(' ');
  const tokensB = normB.split(' ').filter(Boolean).sort().join(' ');
  const maxTokenLen = Math.max(tokensA.length, tokensB.length);
  const sortedSim = 1 - levenshteinDistance(tokensA, tokensB) / maxTokenLen;

  return Math.max(directSim, sortedSim * 0.96);
}

/**
 * Checks a candidate case against existing cases for:
 * 1. Exact National ID match (Section 7 mandatory warning, preserves leading zeros)
 * 2. Exact Phone match
 * 3. Smart Fuzzy Arabic Name match (Section 14 P1.4)
 */
export function findDuplicateMatches(
  candidate: {
    id?: string;
    name?: string;
    national_id?: string;
    phone?: string;
    phone2?: string;
  },
  existingCases: BeneficiaryCase[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const candidateId = candidate.id || '';
  const candidateNatId = (candidate.national_id || '').trim();
  const candidatePhone1 = normalizePhoneForComparison(candidate.phone);
  const candidatePhone2 = normalizePhoneForComparison(candidate.phone2);
  const candidateName = (candidate.name || '').trim();

  for (const existing of existingCases) {
    if (existing.deleted_at) continue;
    if (candidateId && existing.id === candidateId) continue;

    // 1. Exact National ID check (preserves leading zeros)
    const existingNatId = (existing.national_id || '').trim();
    if (candidateNatId && existingNatId && candidateNatId === existingNatId) {
      matches.push({
        matchedCase: existing,
        matchType: 'exact_national_id',
        similarity: 1.0,
        reason_ar: `تطابق تام في رقم الهوية (${existingNatId}) مع الحالة ${existing.code} (${existing.name})`,
      });
      continue;
    }

    // 2. Exact Phone check
    const exPhone1 = normalizePhoneForComparison(existing.phone);
    const exPhone2 = normalizePhoneForComparison(existing.phone2);
    const phoneMatched =
      (candidatePhone1 &&
        candidatePhone1.length >= 8 &&
        (candidatePhone1 === exPhone1 || candidatePhone1 === exPhone2)) ||
      (candidatePhone2 &&
        candidatePhone2.length >= 8 &&
        (candidatePhone2 === exPhone1 || candidatePhone2 === exPhone2));

    if (phoneMatched) {
      matches.push({
        matchedCase: existing,
        matchType: 'exact_phone',
        similarity: 0.95,
        reason_ar: `تطابق في رقم الهاتف (${existing.phone}) مع الحالة ${existing.code} (${existing.name})`,
      });
      continue;
    }

    // 3. Fuzzy Arabic Name check (only if name has at least 2 words / >= 7 chars)
    if (candidateName.length >= 7 && existing.name.length >= 7) {
      const nameSim = calculateArabicNameSimilarity(candidateName, existing.name);
      if (nameSim >= 0.85) {
        matches.push({
          matchedCase: existing,
          matchType: 'fuzzy_arabic_name',
          similarity: Number(nameSim.toFixed(2)),
          reason_ar: `تشابه ذكي بالاسم (${Math.round(nameSim * 100)}%) مع الحالة ${existing.code} (${existing.name})`,
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
