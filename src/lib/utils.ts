import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizePhoneDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

export function phoneNumbersMatch(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizePhoneDigits(left);
  const normalizedRight = normalizePhoneDigits(right);

  if (!normalizedLeft || !normalizedRight) return false;

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(normalizedRight) ||
    normalizedRight.endsWith(normalizedLeft)
  );
}

export function getPhoneSearchVariants(value?: string | null) {
  const normalized = normalizePhoneDigits(value);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  if (normalized.length >= 8) variants.add(normalized.slice(-8));
  if (normalized.length >= 9) variants.add(normalized.slice(-9));
  if (normalized.length >= 10) variants.add(normalized.slice(-10));

  return [...variants];
}
