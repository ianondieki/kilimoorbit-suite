/**
 * The farmer-mail gate: everything the server emails to a farmer (the records
 * digest, the morning brief, a price alert, and the fixed-content welcome and
 * booking emails) goes through here.
 *
 * The free-text emails (digest, brief, alert) carry lines the app composed on
 * the phone, so without a check they would be an open relay: anyone could
 * send anything to any address through the operator's SMTP account. Three
 * guards close that:
 *   - a recipient must have confirmed their address first: the welcome email
 *     carries a link signed with a server secret, and only a confirmed
 *     address receives the free-text emails (an unconfirmed one gets 403 and
 *     the app offers to resend the confirmation);
 *   - a per-recipient daily cap that does not depend on the client IP;
 *   - links are stripped from every farmer-supplied string.
 * Without SMTP nothing leaves the server (every email is SIMULATED and
 * logged), so the confirmation is not required then.
 *
 * Confirmed addresses live in a JSON file next to the bookings; the signing
 * secret is MAIL_SECRET, or a random one kept in data/mail_secret.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** One plain address: no spaces, no separators or brackets an address parser could split on. */
export const EMAIL_RE = /^[^\s@,;<>"'()[\]\\]{1,64}@[^\s@,;<>"'()[\]\\]{1,255}\.[a-z0-9-]{2,}$/i;

/** Collapses whitespace, drops links (the phishing vector in free text), trims. */
export const stripUrls = (s) => String(s ?? "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]").replace(/\s+/g, " ").trim();

export const maskEmail = (e) => { const at = String(e ?? "").indexOf("@"); return at < 1 ? "•••" : `${e[0]}•••${e.slice(at)}`; };
/** An error message safe for the log: no addresses, no overlong SMTP chatter. */
export const safeError = (err) => String(err?.message ?? err ?? "error").replace(/[^\s@<>]+@[^\s@<>]+/g, "•••@•••").slice(0, 160);

const DAILY_CAP = 40;
const CONFIRM_CAP = 5;

export function createMailGate({ storePath, secretPath, secret = process.env.MAIL_SECRET, now = () => new Date() } = {}) {
  // The secret: the env var, else a random one kept on disk so links survive a restart.
  let key = secret;
  if (!key && secretPath) {
    try { key = readFileSync(secretPath, "utf8").trim(); } catch {}
    if (!key) {
      key = randomBytes(32).toString("hex");
      try { mkdirSync(dirname(secretPath), { recursive: true }); writeFileSync(secretPath, key, { mode: 0o600 }); } catch {}
    }
  }
  if (!key) key = randomBytes(32).toString("hex");

  let db = { confirmed: {} };
  if (storePath && existsSync(storePath)) {
    try { db = { confirmed: JSON.parse(readFileSync(storePath, "utf8")).confirmed ?? {} }; }
    catch (err) { console.error(`[mail] confirmations unreadable (${safeError(err)}); starting empty`); }
  }
  const write = () => {
    if (!storePath) return;
    try {
      mkdirSync(dirname(storePath), { recursive: true });
      const tmp = `${storePath}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(db, null, 2));
      renameSync(tmp, storePath);
    } catch (err) { console.error(`[mail] could not save confirmations (${safeError(err)})`); }
  };

  const norm = (e) => String(e ?? "").trim().toLowerCase();
  const sign = (email) => createHmac("sha256", key).update(`confirm:${norm(email)}`).digest("hex");

  // Per-recipient counters, by day (in memory: a restart resets them, which is fine for a cap).
  const sent = new Map();
  const dayKey = () => now().toISOString().slice(0, 10);
  const count = (email, kind) => {
    const k = `${kind}:${norm(email)}`;
    const e = sent.get(k);
    const day = dayKey();
    return e && e.day === day ? e.n : 0;
  };
  const bump = (email, kind) => {
    const k = `${kind}:${norm(email)}`;
    const day = dayKey();
    const e = sent.get(k);
    sent.set(k, { day, n: e && e.day === day ? e.n + 1 : 1 });
    if (sent.size > 20_000) sent.clear();
  };

  return {
    /** The token for an address's confirmation link. */
    token: sign,
    /** Marks an address confirmed when the token matches. */
    confirm(email, token) {
      const e = norm(email);
      if (!EMAIL_RE.test(e) || typeof token !== "string") return false;
      const want = Buffer.from(sign(e)), got = Buffer.from(token.trim());
      if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
      if (!db.confirmed[e]) { db.confirmed[e] = now().toISOString(); write(); }
      return true;
    },
    isConfirmed: (email) => !!db.confirmed[norm(email)],
    /** Whether one more free-text email may go to this address today; counts it when allowed. */
    allow(email) {
      if (count(email, "mail") >= DAILY_CAP) return false;
      bump(email, "mail");
      return true;
    },
    /** Whether one more confirmation email may go to this address today. */
    allowConfirm(email) {
      if (count(email, "confirm") >= CONFIRM_CAP) return false;
      bump(email, "confirm");
      return true;
    },
    get size() { return Object.keys(db.confirmed).length; },
  };
}

const COPY = {
  sw: { subject: "Thibitisha barua pepe yako · KilimoOrbit", hello: (n) => `Habari ${n},`, body: "Bonyeza kitufe hiki ili KilimoOrbit iweze kukutumia ukumbusho wa maonyesho, habari za asubuhi na ripoti ya daftari lako kwa barua pepe hii.", button: "Thibitisha barua pepe", ignore: "Kama hukuomba, puuza barua pepe hii; hakuna kitakachotumwa." },
  en: { subject: "Confirm your email · KilimoOrbit", hello: (n) => `Habari ${n},`, body: "Tap the button so KilimoOrbit can email you show reminders, the morning brief and your records report at this address.", button: "Confirm my email", ignore: "If you did not ask for this, ignore it; nothing will be sent." },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);

/** The confirmation email (also folded into the welcome email at sign-in). */
export function confirmMessage({ name, email, lang = "sw", url }) {
  const c = COPY[lang] ?? COPY.sw;
  const text = [c.hello(name), "", c.body, "", url, "", c.ignore, "", "KilimoOrbit"].join("\n");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2a1f"><div style="background:#18271b;color:#efeadb;border-radius:14px;padding:18px 20px"><div style="font-size:11px;letter-spacing:2px;color:#e9b44c">KILIMOORBIT</div><div style="font-size:22px;font-weight:700;margin-top:6px">${esc(c.subject.split(" · ")[0])}</div></div><div style="padding:8px 4px"><p style="font-size:16px">${esc(c.hello(name))}</p><p>${esc(c.body)}</p><p style="margin-top:18px"><a href="${esc(url)}" style="display:inline-block;background:#e9b44c;color:#0c150e;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">${esc(c.button)}</a></p><p style="color:#6b6450;font-size:12px">${esc(c.ignore)}</p></div></div>`;
  return { to: email, subject: c.subject, text, html };
}

/** The page the confirmation link opens. */
export function confirmPage(ok, lang = "sw") {
  const t = ok
    ? (lang === "en" ? ["Email confirmed", "KilimoOrbit can now email you reminders, the morning brief and your records. You can close this page and go back to the app."] : ["Barua pepe imethibitishwa", "Sasa KilimoOrbit inaweza kukutumia ukumbusho, habari za asubuhi na daftari lako. Unaweza kufunga ukurasa huu na kurudi kwenye programu."])
    : (lang === "en" ? ["This link did not work", "Open the latest KilimoOrbit email and tap its button, or ask the app to send a new one."] : ["Kiungo hiki hakikufanya kazi", "Fungua barua pepe ya hivi karibuni ya KilimoOrbit na ubonyeze kitufe chake, au uombe programu itume nyingine."]);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t[0])} · KilimoOrbit</title></head><body style="margin:0;background:#101b12;color:#efeadb;font-family:Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:12vh auto;padding:28px"><div style="font-size:11px;letter-spacing:2px;color:#e9b44c">KILIMOORBIT</div><h1 style="font-size:26px;margin:10px 0 12px">${ok ? "✓ " : ""}${esc(t[0])}</h1><p style="font-size:17px;line-height:1.5;color:#adb7a0">${esc(t[1])}</p></div></body></html>`;
}
