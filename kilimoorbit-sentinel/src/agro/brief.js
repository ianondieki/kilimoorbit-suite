/**
 * Two more emails the app asks the server to send to the farmer's own
 * address (SMTP, or SIMULATED and logged like sign-in); the server stores
 * nothing in either case.
 *
 *   - The morning brief: what the Today screen reads aloud, once a day —
 *     the weather and the farm-work windows, this week's tasks, price alerts,
 *     the best market and the day's proverb. The app composes the sections in
 *     the farmer's language; the server only lays them out.
 *   - A price alert: the board has reached a target the farmer set.
 */
import { EMAIL_RE, stripUrls } from "./mail.js";
const MAX_SECTIONS = 8;
const MAX_LINES = 12;
const MAX_HITS = 12;
const CROP_RE = /^[a-z][a-z-]{0,30}$/;

const clean = (s, n) => stripUrls(s).slice(0, n);
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);
const money = (n) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const num = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9;
export { maskEmail } from "./mail.js";

const shell = (kicker, title, inner) =>
  `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2a1f"><div style="background:#18271b;color:#efeadb;border-radius:14px;padding:18px 20px"><div style="font-size:11px;letter-spacing:2px;color:#e9b44c">${esc(kicker)}</div><div style="font-size:22px;font-weight:700;margin-top:6px">${esc(title)}</div></div><div style="padding:8px 4px">${inner}</div></div>`;

/* ── the morning brief ── */
const BRIEF = {
  sw: { subject: (d) => `Habari za asubuhi · ${d}`, hello: (n) => `Habari ${n},`, intro: "Hii ndiyo siku yako leo, kutoka KilimoOrbit:", footer: "Kuzima barua pepe hii: Mipangilio → Habari za asubuhi kwa barua pepe." },
  en: { subject: (d) => `Your morning brief · ${d}`, hello: (n) => `Habari ${n},`, intro: "Here is your day, from KilimoOrbit:", footer: "To stop these emails: Settings → Morning brief by email." },
};

/** Validates a brief request. Returns { input } or { error, fields }. */
export function validateBrief(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON brief is required.", fields: [] };
  const fields = [];
  const name = clean(body.name, 60);
  if (!name) fields.push("name");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fields.push("email");
  const lang = body.lang === "en" ? "en" : body.lang === "sw" ? "sw" : null;
  if (!lang) fields.push("lang");
  const date = clean(body.date, 40);
  if (!date) fields.push("date");
  const county = clean(body.county, 40) || null;
  const raw = Array.isArray(body.sections) ? body.sections : null;
  const sections = raw
    ? raw.slice(0, MAX_SECTIONS).map((s) => ({
        title: clean(s?.title, 60),
        lines: (Array.isArray(s?.lines) ? s.lines : []).map((l) => clean(l, 240)).filter(Boolean).slice(0, MAX_LINES),
      })).filter((s) => s.title && s.lines.length)
    : [];
  if (!raw || raw.length > MAX_SECTIONS || !sections.length) fields.push("sections");
  if (fields.length) return { error: `Invalid brief: ${fields.join(", ")}.`, fields };
  return { input: { name, email, lang, date, county, sections } };
}

/** The brief as a text and HTML email. */
export function briefMessage(p) {
  const c = BRIEF[p.lang];
  const text = [c.hello(p.name), "", c.intro, ""];
  for (const s of p.sections) { text.push(s.title.toUpperCase()); for (const l of s.lines) text.push(`- ${l}`); text.push(""); }
  text.push(c.footer);
  const html = shell(p.county ? `KILIMOORBIT · ${p.county.toUpperCase()}` : "KILIMOORBIT", p.date, [
    `<p style="font-size:16px">${esc(c.hello(p.name))}</p><p>${esc(c.intro)}</p>`,
    ...p.sections.map((s) => `<h3 style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6450;margin:18px 0 6px">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join("")}</ul>`),
    `<p style="color:#6b6450;font-size:12px;margin-top:20px">${esc(c.footer)}</p>`,
  ].join(""));
  return { to: p.email, subject: c.subject(p.date), text: text.join("\n"), html };
}

/* ── price alerts ── */
const ALERT = {
  sw: {
    subject: (h) => (h.length === 1 ? `Bei ya ${h[0].crop} imefika ${money(h[0].price)}/kg ${h[0].market}` : `Bei ${h.length} ulizolenga zimefikiwa leo`),
    hello: (n) => `Habari ${n},`, intro: "Soko limefika bei uliyolenga:", line: (h) => `${h.crop}: ${money(h.price)}/kg ${h.market} (lengo lako: ${money(h.target)}/kg)`,
    footer: "Bei ni za jumla za leo; thibitisha sokoni kabla ya kusafiri. Kuzima: Mipangilio → Habari za asubuhi kwa barua pepe.",
  },
  en: {
    subject: (h) => (h.length === 1 ? `${h[0].crop} has reached ${money(h[0].price)}/kg at ${h[0].market}` : `${h.length} of your price targets were reached today`),
    hello: (n) => `Habari ${n},`, intro: "The market has reached a price you were waiting for:", line: (h) => `${h.crop}: ${money(h.price)}/kg at ${h.market} (your target: ${money(h.target)}/kg)`,
    footer: "Today's wholesale prices; confirm at the market before you travel. To stop these emails: Settings → Morning brief by email.",
  },
};

/** Validates a price-alert email request. Returns { input } or { error, fields }. */
export function validateAlertMail(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON alert is required.", fields: [] };
  const fields = [];
  const name = clean(body.name, 60);
  if (!name) fields.push("name");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fields.push("email");
  const lang = body.lang === "en" ? "en" : body.lang === "sw" ? "sw" : null;
  if (!lang) fields.push("lang");
  const raw = Array.isArray(body.hits) ? body.hits : [];
  const hits = raw.slice(0, MAX_HITS).map((h) => ({
    crop: clean(h?.crop, 40), market: clean(h?.market, 60), price: h?.price, target: h?.target, key: CROP_RE.test(String(h?.key ?? "")) ? String(h.key) : null,
  }));
  if (!hits.length || raw.length > MAX_HITS || hits.some((h) => !h.crop || !h.market || !num(h.price) || !num(h.target) || !h.key)) fields.push("hits");
  if (fields.length) return { error: `Invalid alert: ${fields.join(", ")}.`, fields };
  return { input: { name, email, lang, hits: hits.map((h) => ({ ...h, price: Math.round(h.price), target: Math.round(h.target) })) } };
}

/** The alert as a text and HTML email. */
export function alertMessage(p) {
  const c = ALERT[p.lang];
  const text = [c.hello(p.name), "", c.intro, "", ...p.hits.map((h) => `- ${c.line(h)}`), "", c.footer].join("\n");
  const html = shell("KILIMOORBIT · MASOKO", c.subject(p.hits), [
    `<p style="font-size:16px">${esc(c.hello(p.name))}</p><p>${esc(c.intro)}</p>`,
    `<ul style="margin:0;padding-left:18px">${p.hits.map((h) => `<li style="margin:6px 0"><strong>${esc(h.crop)}</strong>: ${esc(money(h.price))}/kg · ${esc(h.market)} <span style="color:#6b6450">(${esc(money(h.target))}/kg)</span></li>`).join("")}</ul>`,
    `<p style="color:#6b6450;font-size:12px;margin-top:20px">${esc(c.footer)}</p>`,
  ].join(""));
  return { to: p.email, subject: c.subject(p.hits), text, html };
}
