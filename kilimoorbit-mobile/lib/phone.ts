/**
 * Kenyan mobile number helpers. Phone numbers are universal in Kenya; many
 * farmers have no email address, so the phone is the primary identifier.
 *
 * normalizeKePhone is duplicated in kilimoorbit-sentinel/src/server.js; keep
 * the two algorithms identical.
 */

export type PhoneReason = "empty" | "short" | "long" | "prefix" | "notPhone";
export type PhoneResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; reason: PhoneReason };

export function normalizeKePhone(raw: string): PhoneResult {
  const str = String(raw ?? "");
  // 1. An "@" or any letter means this is not a phone number (often an email).
  if (str.includes("@") || /[a-z]/i.test(str)) return { ok: false, reason: "notPhone" };
  // 2. Digits only.
  let d = str.replace(/\D/g, "");
  if (!d) return { ok: false, reason: "empty" };
  // 3. Drop the country code, then a trunk "0" (also accepts "+254 0712…").
  if (d.startsWith("254")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // 4. National significant number is exactly 9 digits.
  if (d.length < 9) return { ok: false, reason: "short" };
  if (d.length > 9) return { ok: false, reason: "long" };
  // 5. Kenyan mobile ranges start 7 or 1 (07XX / 01XX).
  if (!/^[17]\d{8}$/.test(d)) return { ok: false, reason: "prefix" };
  return { ok: true, e164: "+254" + d, national: d };
}

const group = (digits: string, sizes: number[]) => {
  const out: string[] = [];
  let i = 0;
  for (const n of sizes) {
    if (i >= digits.length) break;
    out.push(digits.slice(i, i + n));
    i += n;
  }
  if (i < digits.length) out.push(digits.slice(i));
  return out.join(" ");
};

/** Groups digits as the farmer types, keeping the prefix they chose. */
export function formatKePhoneInput(raw: string): string {
  const str = String(raw ?? "");
  // Letters or "@" mean it isn't a phone number: leave it alone so the blur
  // handler can move it into the email field.
  if (str.includes("@") || /[a-z]/i.test(str)) return str.slice(0, 64);
  const plus = str.trimStart().startsWith("+");
  let d = str.replace(/\D/g, "");
  // "+254 0712…": the trunk 0 is dropped for display (normalizeKePhone accepts both).
  if (d.startsWith("2540")) d = "254" + d.slice(4);
  // Cap by digits, not display characters: one digit too many is kept (up to
  // 13) so normalizeKePhone reports "long" instead of silently dropping a
  // digit and turning a mistyped number into a different valid one.
  d = d.slice(0, 13);
  let out: string;
  if (!d) out = plus ? "+" : "";
  else if (d.startsWith("254")) out = "+" + group(d, [3, 3, 3, 3]);
  else if (d.startsWith("0")) out = group(d, [4, 3, 3]);
  else if (d.startsWith("7") || d.startsWith("1")) out = group(d, [3, 3, 3]);
  else out = (plus ? "+" : "") + d;
  return out;
}

/** TextInput maxLength for the phone field. A constant 64, never the digit
 *  length: the cap applies before onChangeText runs, so a pasted email or name
 *  must arrive whole for the login screen to move it to the right field.
 *  formatKePhoneInput bounds the display (13 digits, or 64 other characters). */
export const PHONE_INPUT_MAX = 64;

/** "+254712345678" → "+254 712 345 678" */
export const displayE164 = (e164: string) =>
  `+254 ${e164.slice(4, 7)} ${e164.slice(7, 10)} ${e164.slice(10)}`;

/** "+254712345678" → "0712 ••• 678" */
export const maskPhone = (e164: string) => `0${e164.slice(4, 7)} ••• ${e164.slice(-3)}`;

/** "wanjiru@gmail.com" → "w•••@gmail.com" */
export function maskEmail(e: string): string {
  const at = e.indexOf("@");
  if (at < 1) return e;
  return `${e[0]}•••${e.slice(at)}`;
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isValidEmail = (e: string) => EMAIL_RE.test(normalizeEmail(e));

/** Collapses whitespace and line breaks; any script, apostrophes and hyphens allowed. */
export const normalizeName = (n: string) => n.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim();
export const isValidName = (n: string) => {
  const v = normalizeName(n);
  return v.length >= 2 && v.length <= 80;
};

export const firstName = (n: string) => normalizeName(n).split(" ")[0] ?? "";
export const initials = (n: string) =>
  normalizeName(n)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");
