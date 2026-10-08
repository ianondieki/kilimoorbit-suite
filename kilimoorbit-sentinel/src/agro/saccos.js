/**
 * Farmers' SACCOs and co-operatives near the farmer, and a one-tap join request.
 *
 * Joining a SACCO is how most smallholders get inputs on credit (seed and
 * fertiliser repaid at harvest), a shop selling genuine inputs at member
 * prices, loans for equipment and accessories (sprayers, water tanks, pumps,
 * chaff cutters), feeds and AI for dairy, and a buyer for the harvest.
 *
 * The directory lists well-known farmer SACCOs and co-operative unions by the
 * town of their head office (approximate positions), with what each one is
 * known for. Every county also has a Co-operatives office that keeps the full
 * register of SACCOs there, so it is always offered as the last row.
 *
 * The join request is stored here with a reference and a checklist of what to
 * bring; SACCOs are not connected to the app yet, so membership is completed
 * at the office (or through the SACCO's own channels). A partner SACCO can
 * collect the requests for itself with SACCO_PARTNER_KEY (see server.js).
 * Honesty: no phone numbers, fees or share-capital amounts are listed because
 * they change; the app says to ask.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { COUNTIES, findCounty } from "./weather.js";
import { distanceKm } from "./events.js";
import { transportEstimate } from "./nurseries.js";

/** What a SACCO can give a farmer. */
export const SERVICES = {
  input_credit:      { en: "Seed and fertiliser on credit, repaid at harvest", sw: "Mbegu na mbolea kwa mkopo, unalipa baada ya mavuno" },
  inputs_shop:       { en: "Inputs shop with member prices", sw: "Duka la pembejeo kwa bei ya wanachama" },
  asset_finance:     { en: "Loans for equipment and accessories (sprayers, tanks, pumps, chaff cutters)", sw: "Mikopo ya vifaa (bomba za kunyunyizia, matangi, pampu, mashine za kukata nyasi)" },
  feeds_vet:         { en: "Dairy feeds, vet and AI services", sw: "Chakula cha mifugo, huduma za daktari wa mifugo na AI" },
  produce_marketing: { en: "Buys or markets members' produce", sw: "Hununua au kuuza mazao ya wanachama" },
  savings_credit:    { en: "Savings, emergency and school-fees loans", sw: "Akiba, mikopo ya dharura na ya karo" },
  insurance:         { en: "Crop and livestock insurance", sw: "Bima ya mazao na mifugo" },
  register:          { en: "The register of every SACCO in the county, and help to register a group", sw: "Orodha ya SACCO zote za kaunti, na msaada wa kusajili kikundi" },
};
export const SERVICE_KEYS = Object.keys(SERVICES);

/** What farmers in each SACCO mostly grow or keep. */
export const FOCUS = ["dairy", "tea", "coffee", "horticulture", "grain", "general"];

/**
 * id, name, kind (sacco | dairy_coop | union | office), town, county, lat, lon,
 * focus[], services[].
 */
export const SACCOS = [
  { id: "githunguri-dairy", name: "Githunguri Dairy Farmers Co-operative Society", kind: "dairy_coop", town: "Githunguri", county: "Kiambu", lat: -1.06, lon: 36.78, focus: ["dairy"], services: ["feeds_vet", "inputs_shop", "produce_marketing", "savings_credit"] },
  { id: "meru-central-dairy", name: "Meru Central Dairy Co-operative Union", kind: "union", town: "Meru", county: "Meru", lat: 0.05, lon: 37.65, focus: ["dairy"], services: ["feeds_vet", "inputs_shop", "produce_marketing"] },
  { id: "unaitas", name: "Unaitas Sacco", kind: "sacco", town: "Murang'a", county: "Murang'a", lat: -0.72, lon: 37.15, focus: ["general", "tea", "coffee"], services: ["savings_credit", "input_credit", "asset_finance", "insurance"] },
  { id: "mentor", name: "Mentor Sacco", kind: "sacco", town: "Murang'a", county: "Murang'a", lat: -0.72, lon: 37.16, focus: ["tea", "general"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "fortune", name: "Fortune Sacco", kind: "sacco", town: "Kerugoya", county: "Kirinyaga", lat: -0.5, lon: 37.28, focus: ["coffee", "tea", "grain"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "nyambene-arimi", name: "Nyambene Arimi Sacco", kind: "sacco", town: "Maua", county: "Meru", lat: 0.23, lon: 37.94, focus: ["tea", "general"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "imarisha", name: "Imarisha Sacco", kind: "sacco", town: "Kericho", county: "Kericho", lat: -0.37, lon: 35.28, focus: ["tea", "dairy"], services: ["savings_credit", "input_credit", "asset_finance", "insurance"] },
  { id: "tower", name: "Tower Sacco", kind: "sacco", town: "Ol Kalou", county: "Nyandarua", lat: -0.27, lon: 36.38, focus: ["horticulture", "dairy", "grain"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "taifa", name: "Taifa Sacco", kind: "sacco", town: "Nyeri", county: "Nyeri", lat: -0.42, lon: 36.95, focus: ["coffee", "tea", "dairy"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "muki", name: "Muki Sacco", kind: "sacco", town: "Mukurwe-ini", county: "Nyeri", lat: -0.56, lon: 37.05, focus: ["dairy", "coffee"], services: ["savings_credit", "input_credit", "asset_finance"] },
  { id: "boresha", name: "Boresha Sacco", kind: "sacco", town: "Eldama Ravine", county: "Baringo", lat: 0.05, lon: 35.72, focus: ["dairy", "grain"], services: ["savings_credit", "input_credit", "asset_finance"] },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The county Co-operatives office (every county has one), placed at the county centre. */
export function countyOffice(countyName) {
  const c = findCounty(countyName);
  if (!c) return null;
  return { id: `county-coop-${slug(c.name)}`, name: `${c.name} County Co-operatives office`, kind: "office", town: c.name, county: c.name, lat: c.lat, lon: c.lon, focus: ["general"], services: ["register"] };
}
const BY_ID = new Map(SACCOS.map((s) => [s.id, s]));
export function findSacco(id) {
  const key = String(id ?? "");
  if (BY_ID.has(key)) return BY_ID.get(key);
  if (key.startsWith("county-coop-")) {
    const c = COUNTIES.find((x) => `county-coop-${slug(x.name)}` === key);
    return c ? countyOffice(c.name) : null;
  }
  return null;
}

/** The nearest SACCOs (those matching the farmer's focus first within 120 km), then the county office. */
export function saccosNear({ lat, lon, county, focus, limit = 5 }) {
  const from = { lat, lon };
  const rows = SACCOS.map((s) => {
    const distance_km = Math.round(distanceKm(from, s) * 10) / 10;
    return { ...s, distance_km, matches_focus: !focus || s.focus.includes(focus) || s.focus.includes("general"), transport: transportEstimate(distance_km) };
  }).sort((a, b) => a.distance_km - b.distance_km);
  const near = rows.filter((r) => r.distance_km <= 120);
  near.sort((a, b) => (a.matches_focus === b.matches_focus ? a.distance_km - b.distance_km : a.matches_focus ? -1 : 1));
  const picked = (near.length ? near : rows).slice(0, limit);
  const office = countyOffice(county);
  if (office) {
    const distance_km = Math.round(distanceKm(from, office) * 10) / 10;
    picked.push({ ...office, distance_km, matches_focus: true, transport: transportEstimate(distance_km) });
  }
  return picked;
}

/** What to bring to finish joining (typical for a Kenyan SACCO; amounts vary, so they are asked for). */
export const CHECKLIST = [
  { en: "Your national ID (original and a copy)", sw: "Kitambulisho chako (asili na nakala)" },
  { en: "KRA PIN certificate", sw: "Cheti cha KRA PIN" },
  { en: "Two passport photos", sw: "Picha mbili za pasipoti" },
  { en: "The registration fee and the first share capital: ask for the amounts, and pay at the office or to the SACCO's own M-Pesa paybill only", sw: "Ada ya usajili na hisa za kwanza: uliza kiasi, na ulipe ofisini au kwa paybill rasmi ya SACCO pekee" },
  { en: "Names of next of kin (nominees)", sw: "Majina ya warithi (wateule)" },
  { en: "For input credit: your acreage, crops and, for dairy, your cows and milk records", sw: "Kwa mkopo wa pembejeo: ekari zako, mazao, na kwa maziwa, ng'ombe na rekodi za maziwa" },
];

const PHONE_RE = /^(?:\+?254|0)(?:7|1)\d{8}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const MAX_APPLICATIONS = 5000;
const maskEmail = (e) => { const at = e.indexOf("@"); return at < 1 ? "•••" : `${e[0]}•••${e.slice(at)}`; };
const maskPhone = (p) => `${p.slice(0, 4)}•••${p.slice(-2)}`;

/** `{ input }` or `{ error, fields }` for a join request. */
export function validateJoin(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON request is required.", fields: [] };
  const fields = [];
  const sacco = findSacco(body.sacco_id);
  if (!sacco) fields.push("sacco_id");
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (name.length < 2) fields.push("name");
  const phone = typeof body.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
  if (phone && !PHONE_RE.test(phone)) fields.push("phone");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !EMAIL_RE.test(email)) fields.push("email");
  if (!phone && !email) fields.push("contact");
  const county = findCounty(String(body.county ?? ""));
  if (!county) fields.push("county");
  const interests = Array.isArray(body.interests) ? [...new Set(body.interests.filter((x) => SERVICE_KEYS.includes(x)))] : [];
  const acres = Number(body.acres);
  if (fields.length) return { error: `Invalid request: ${fields.join(", ")}.`, fields };
  return { input: { sacco, name, phone: phone || null, email: email || null, county: county.name, interests, acres: Number.isFinite(acres) && acres > 0 && acres <= 5000 ? Math.round(acres * 4) / 4 : null } };
}

export function createApplications({ storePath, now = () => new Date() } = {}) {
  let db = { applications: [] };
  if (storePath && existsSync(storePath)) {
    try { db = { applications: JSON.parse(readFileSync(storePath, "utf8")).applications ?? [] }; }
    catch (err) {
      const quarantine = `${storePath}.corrupt-${Date.now()}`;
      try { renameSync(storePath, quarantine); } catch {}
      console.error(`[saccos] applications unreadable (${err?.message}); moved to ${quarantine}`);
    }
  }
  function write() {
    if (!storePath) return;
    const dir = dirname(storePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${storePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, storePath);
  }
  return {
    /** The join agent: Matcher → Registrar → Messenger → Guide. `mailer(msg)` sends or throws. */
    async apply(input, { mailer = null, lang = "en" } = {}) {
      const t0 = now();
      const sw = lang === "sw";
      const steps = [];
      const step = (agent, action) => steps.push({ agent, action, latency_ms: Math.max(1, now().getTime() - t0.getTime()) });
      const { sacco, name, phone, email, county, interests, acres } = input;
      const office = sacco.kind === "office";
      step("Matcher", sw ? `Imethibitisha ${sacco.name} inahudumia wakulima wa ${county}` : `Checked that ${sacco.name} serves farmers from ${county}`);
      const id = randomUUID();
      const reference = `KO-${id.slice(0, 6).toUpperCase()}`;
      const app = {
        id, token: randomBytes(12).toString("hex"), reference, created_at: t0.toISOString(), status: "PENDING",
        sacco_id: sacco.id, sacco_name: sacco.name, name, phone, email, county, interests, acres,
      };
      db.applications.push(app);
      if (db.applications.length > MAX_APPLICATIONS) db.applications.splice(0, db.applications.length - MAX_APPLICATIONS);
      write();
      step("Registrar", sw ? `Imehifadhi ombi lako la uanachama (namba ${reference})` : `Saved your membership request (reference ${reference})`);
      let emailStatus = "NONE";
      if (email) {
        const msg = {
          to: email,
          subject: `${sacco.name}: your KilimoOrbit membership request ${reference}`,
          text: `Habari ${name},\n\nKilimoOrbit has saved your request to ${office ? "find and join a SACCO through" : "join"} ${sacco.name} (${sacco.town}, ${sacco.county}). Reference: ${reference}.\n\nTo finish joining, visit the office with:\n${CHECKLIST.map((c) => `- ${c.en}`).join("\n")}\n\nPay fees only at the office or to the SACCO's own paybill. KilimoOrbit never asks for money.\n\nKilimoOrbit`,
        };
        if (mailer) {
          try { await mailer(msg); emailStatus = "SENT"; } catch { emailStatus = "FAILED"; }
        } else {
          emailStatus = "SIMULATED";
          console.log(`[saccos] SIMULATED confirmation to ${maskEmail(email)} for ${sacco.name}`);
        }
      }
      const contact = email ? maskEmail(email) : maskPhone(phone);
      step("Messenger", emailStatus === "SENT" ? (sw ? `Imetuma uthibitisho kwa ${contact}` : `Emailed the confirmation to ${contact}`)
        : emailStatus === "SIMULATED" ? (sw ? `Uthibitisho kwa ${contact} umeigizwa (hakuna SMTP)` : `Simulated the confirmation to ${contact} (no SMTP set up)`)
        : emailStatus === "FAILED" ? (sw ? `Imeshindwa kutuma barua pepe kwa ${contact}` : `Could not email ${contact}`)
        : (sw ? `Namba ${reference} ndiyo uthibitisho wako` : `Your reference ${reference} is the confirmation`));
      step("Guide", sw ? "Imeandaa unachohitaji kubeba ili kukamilisha uanachama" : "Prepared what to bring to finish joining");
      return {
        application_id: id, token: app.token, reference, status: "PENDING",
        sacco: { ...sacco }, checklist: CHECKLIST, email: emailStatus, steps,
      };
    },
    withdraw(id, token) {
      const a = db.applications.find((x) => x.id === id);
      if (!a) return "missing";
      if (a.token !== token) return "forbidden";
      db.applications = db.applications.filter((x) => x.id !== id);
      write();
      return "ok";
    },
    /** For a partner SACCO: its pending requests, without tokens. */
    forSacco(saccoId) {
      return db.applications.filter((a) => a.sacco_id === saccoId).map(({ token, ...a }) => a);
    },
    get size() { return db.applications.length; },
  };
}
