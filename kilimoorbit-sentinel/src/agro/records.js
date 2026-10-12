/**
 * The daftari (records) email: when a farmer records a sale or a cost, or
 * asks for it from the Records tab, the app sends the season's totals and
 * the report text it already builds on the phone, and the server emails it to
 * the farmer's own address (SMTP) or logs it (SIMULATED). The server keeps
 * nothing: the records stay on the phone, the email is the farmer's copy.
 */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MAX_TEXT = 6000;
const MAX_CROPS = 20;
const CROP_RE = /^[a-z][a-z-]{0,30}$/;

const money = (n) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e12;

/** Validates a digest request. Returns { input } or { error, fields }. */
export function validateDigest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON digest is required.", fields: [] };
  const fields = [];
  const name = clean(body.name, 60);
  if (!name) fields.push("name");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fields.push("email");
  const lang = body.lang === "en" ? "en" : body.lang === "sw" ? "sw" : null;
  if (!lang) fields.push("lang");
  const period = clean(body.period, 40);
  if (!period) fields.push("period");
  const t = body.totals;
  const totalsOk = t && typeof t === "object" && num(t.income) && num(t.expense) && t.income >= 0 && t.expense >= 0;
  if (!totalsOk) fields.push("totals");
  const text = typeof body.text === "string" ? body.text.replace(/\r/g, "").trim() : "";
  if (!text || text.length > MAX_TEXT) fields.push("text");
  const crops = Array.isArray(body.crops) ? body.crops : [];
  if (crops.length > MAX_CROPS || crops.some((c) => !c || typeof c !== "object" || !CROP_RE.test(String(c.crop)) || !num(c.profit))) fields.push("crops");
  const entries = body.entries === undefined ? null : Number.isInteger(body.entries) && body.entries >= 0 && body.entries <= 1e6 ? body.entries : NaN;
  if (Number.isNaN(entries)) fields.push("entries");
  const last = body.last == null ? null : clean(body.last, 160) || null;
  if (fields.length) return { error: `Invalid digest: ${fields.join(", ")}.`, fields };
  return {
    input: {
      name, email, lang, period, text, entries,
      totals: { income: Math.round(t.income), expense: Math.round(t.expense), profit: Math.round(t.income - t.expense) },
      crops: crops.map((c) => ({ crop: String(c.crop), profit: Math.round(c.profit) })),
      last,
    },
  };
}

const COPY = {
  sw: {
    subject: (p) => `Daftari la shamba · ${p.period}: ${p.totals.profit < 0 ? "hasara" : "faida"} ${money(Math.abs(p.totals.profit))}`,
    hello: (n) => `Habari ${n},`,
    intro: "Hili ni toleo jipya la daftari lako la KilimoOrbit:",
    income: "Mapato", expense: "Gharama", profit: "Faida", loss: "Hasara",
    last: "Ingizo la mwisho", byCrop: "Kwa kila zao", report: "Ripoti kamili",
    footer: "Rekodi zako zimehifadhiwa kwenye simu yako tu; barua pepe hii ni nakala yako. KilimoOrbit",
  },
  en: {
    subject: (p) => `Farm records · ${p.period}: ${p.totals.profit < 0 ? "loss" : "profit"} ${money(Math.abs(p.totals.profit))}`,
    hello: (n) => `Habari ${n},`,
    intro: "Here is the latest from your KilimoOrbit records:",
    income: "Income", expense: "Costs", profit: "Profit", loss: "Loss",
    last: "Latest entry", byCrop: "By crop", report: "Full report",
    footer: "Your records live only on your phone; this email is your copy. KilimoOrbit",
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);

/** The email (text and HTML) for a validated digest. */
export function digestMessage(p) {
  const c = COPY[p.lang];
  const { income, expense, profit } = p.totals;
  const profitWord = profit < 0 ? c.loss : c.profit;
  const lines = [
    c.hello(p.name), "", c.intro, "",
    `${c.income}: ${money(income)}`, `${c.expense}: ${money(expense)}`, `${profitWord}: ${money(Math.abs(profit))}`,
  ];
  if (p.last) lines.push("", `${c.last}: ${p.last}`);
  if (p.crops.length) { lines.push("", `${c.byCrop}:`); for (const x of p.crops) lines.push(`- ${x.crop}: ${x.profit < 0 ? "−" : "+"}${money(Math.abs(x.profit))}`); }
  lines.push("", `${c.report}:`, "", p.text, "", c.footer);
  const good = profit >= 0;
  const html = [
    `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2a1f">`,
    `<p style="font-size:16px">${esc(c.hello(p.name))}</p><p>${esc(c.intro)}</p>`,
    `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:8px -8px">`,
    `<tr>${[[c.income, money(income), "#1f2a1f"], [c.expense, money(expense), "#1f2a1f"], [profitWord, money(Math.abs(profit)), good ? "#2e7d32" : "#c62828"]]
      .map(([k, v, col]) => `<td style="background:#f4f1e6;border-radius:12px;padding:12px;width:33%;vertical-align:top"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6b6450">${esc(k)}</div><div style="font-size:20px;font-weight:700;color:${col};margin-top:4px">${esc(v)}</div></td>`).join("")}</tr></table>`,
    p.last ? `<p><strong>${esc(c.last)}:</strong> ${esc(p.last)}</p>` : "",
    p.crops.length ? `<p><strong>${esc(c.byCrop)}</strong></p><ul>${p.crops.map((x) => `<li>${esc(x.crop)}: <span style="color:${x.profit < 0 ? "#c62828" : "#2e7d32"}">${x.profit < 0 ? "−" : "+"}${esc(money(Math.abs(x.profit)))}</span></li>`).join("")}</ul>` : "",
    `<p><strong>${esc(c.report)}</strong></p><pre style="white-space:pre-wrap;font:14px/1.5 Menlo,Consolas,monospace;background:#f8f6ef;border-radius:12px;padding:12px">${esc(p.text)}</pre>`,
    `<p style="color:#6b6450;font-size:12px">${esc(c.footer)}</p></div>`,
  ].join("");
  return { to: p.email, subject: c.subject(p), text: lines.join("\n"), html };
}

export const maskEmail = (e) => { const at = e.indexOf("@"); return at < 1 ? "•••" : `${e[0]}•••${e.slice(at)}`; };
