/**
 * Seedlings and seed near the farmer.
 *
 * A directory of the public research stations, forestry nurseries,
 * agricultural training centres and well-known suppliers across Kenya where
 * smallholders get seedlings and certified seed, with what each one carries,
 * ranked by distance from the farmer (the phone's GPS when it is shared, else
 * the county centre) and with a transport estimate, so a farmer can choose the
 * near source over the famous far one. The Advisor step asks the LLM for a
 * short plan grounded in that shortlist; without a key, or when the model
 * fails, a deterministic plan is written from the same facts.
 *
 * Honesty: locations are the station's town (approximate), stock and prices
 * change with the season, and no phone numbers are listed because they
 * change too — every entry says to confirm before travelling.
 */
import { findCounty } from "./weather.js";
import { distanceKm } from "./events.js";

/** What a farmer may be looking for, with how many go into an acre (common extension spacings). */
export const NEEDS = {
  avocado:    { en: "Avocado seedlings",            sw: "Miche ya parachichi",        per_acre: 80,    unit: "seedlings", spacing: "7 m × 7 m",   ask: { en: "grafted Hass or Fuerte on a healthy rootstock, KEPHIS-inspected", sw: "Hass au Fuerte zilizopandikizwa kwenye shina lenye afya, zilizokaguliwa na KEPHIS" } },
  mango:      { en: "Mango seedlings",              sw: "Miche ya maembe",            per_acre: 60,    unit: "seedlings", spacing: "8 m × 8 m",   ask: { en: "grafted Apple, Tommy Atkins or Kent, one season old", sw: "Apple, Tommy Atkins au Kent zilizopandikizwa, za msimu mmoja" } },
  macadamia:  { en: "Macadamia seedlings",          sw: "Miche ya mkadamia",          per_acre: 60,    unit: "seedlings", spacing: "8 m × 8 m",   ask: { en: "grafted MRG-20 or KRG-15 clones", sw: "koni za MRG-20 au KRG-15 zilizopandikizwa" } },
  citrus:     { en: "Citrus seedlings",             sw: "Miche ya machungwa na ndimu", per_acre: 160,  unit: "seedlings", spacing: "5 m × 5 m",   ask: { en: "grafted orange, lime or lemon on rough-lemon rootstock", sw: "machungwa, ndimu au malimau yaliyopandikizwa" } },
  pawpaw:     { en: "Pawpaw seedlings",             sw: "Miche ya papai",             per_acre: 640,   unit: "seedlings", spacing: "2.5 m × 2.5 m", ask: { en: "Solo Sunrise or Calina (hermaphrodite) seedlings", sw: "miche ya Solo Sunrise au Calina" } },
  passion:    { en: "Passion fruit seedlings",      sw: "Miche ya matunda ya pasheni", per_acre: 670,  unit: "seedlings", spacing: "3 m × 2 m",   ask: { en: "purple passion grafted on yellow rootstock, disease-free", sw: "pasheni ya zambarau iliyopandikizwa kwenye shina la njano" } },
  banana:     { en: "Banana plantlets (tissue culture)", sw: "Miche ya ndizi (tissue culture)", per_acre: 450, unit: "plantlets", spacing: "3 m × 3 m", ask: { en: "hardened tissue-culture plantlets of Grand Naine, Williams or FHIA-17", sw: "miche ya tissue culture ya Grand Naine, Williams au FHIA-17 iliyokomaa" } },
  coffee:     { en: "Coffee seedlings",             sw: "Miche ya kahawa",            per_acre: 550,   unit: "seedlings", spacing: "2.7 m × 2.7 m", ask: { en: "Ruiru 11 or Batian seedlings, 6–8 months old", sw: "miche ya Ruiru 11 au Batian ya miezi 6–8" } },
  tea:        { en: "Tea cuttings",                 sw: "Vipandikizi vya chai",       per_acre: 5600,  unit: "cuttings",  spacing: "1.2 m × 0.6 m", ask: { en: "rooted clonal cuttings (TRFK 31/8 or purple tea TRFK 306)", sw: "vipandikizi vya koni vilivyoota mizizi (TRFK 31/8 au chai ya zambarau TRFK 306)" } },
  vegetables: { en: "Vegetable seedlings & seed",   sw: "Miche na mbegu za mboga",    per_acre: 10000, unit: "seedlings", spacing: "60 cm × 45 cm (tomato)", ask: { en: "nursery-raised tomato, cabbage, onion or kale seedlings, or certified seed in sealed packets", sw: "miche ya nyanya, kabichi, kitunguu au sukuma wiki, au mbegu zilizothibitishwa kwenye pakiti zilizofungwa" } },
  trees:      { en: "Tree seedlings (agroforestry)", sw: "Miche ya miti",             per_acre: 450,   unit: "seedlings", spacing: "3 m × 3 m",   ask: { en: "Grevillea, Calliandra, Croton or indigenous species suited to your altitude", sw: "Grevillea, Calliandra, Croton au miti ya asili inayofaa urefu wa eneo lako" } },
  potato:     { en: "Certified seed potato",        sw: "Mbegu za viazi zilizothibitishwa", per_acre: 1000, unit: "kg of seed", spacing: "75 cm × 30 cm", ask: { en: "certified seed of Shangi, Dutch Robijn or Unica, with the KEPHIS label", sw: "mbegu zilizothibitishwa za Shangi, Dutch Robijn au Unica zenye lebo ya KEPHIS" } },
  maize:      { en: "Certified maize seed",         sw: "Mbegu za mahindi zilizothibitishwa", per_acre: 10, unit: "kg of seed", spacing: "75 cm × 25 cm", ask: { en: "a sealed 10 kg bag of a hybrid for your altitude, from a stockist with a KEPHIS sticker", sw: "mfuko wa kilo 10 uliofungwa wa mbegu chotara ya urefu wako, kutoka kwa muuzaji mwenye stika ya KEPHIS" } },
  grass:      { en: "Napier / Brachiaria splits",   sw: "Vipandikizi vya Napier / Brachiaria", per_acre: 4500, unit: "canes or splits", spacing: "90 cm × 60 cm", ask: { en: "disease-free Napier (Kakamega 1/2) or Brachiaria splits", sw: "Napier (Kakamega 1/2) isiyo na ugonjwa au vipandikizi vya Brachiaria" } },
  coconut:    { en: "Coconut & cashew seedlings",   sw: "Miche ya nazi na korosho",   per_acre: 70,    unit: "seedlings", spacing: "8 m × 8 m",   ask: { en: "East African Tall coconut or grafted cashew seedlings", sw: "miche ya nazi ya East African Tall au korosho iliyopandikizwa" } },
};
export const NEED_KEYS = Object.keys(NEEDS);

/**
 * id, name, kind, town, county, lat, lon (town-level), what it carries, site.
 * kind: research | forestry | training | seed | supplier.
 */
export const NURSERIES = [
  { id: "kalro-thika", name: "KALRO Horticulture Research Institute, Thika", kind: "research", town: "Thika", county: "Kiambu", lat: -1.033, lon: 37.069, carries: ["avocado", "mango", "macadamia", "passion", "pawpaw", "citrus", "banana"], url: "https://www.kalro.org" },
  { id: "kalro-kandara", name: "KALRO Kandara", kind: "research", town: "Kandara", county: "Murang'a", lat: -0.88, lon: 37.03, carries: ["avocado", "macadamia", "mango", "passion"], url: "https://www.kalro.org" },
  { id: "kalro-embu", name: "KALRO Embu", kind: "research", town: "Embu", county: "Embu", lat: -0.52, lon: 37.45, carries: ["banana", "vegetables", "trees", "maize"], url: "https://www.kalro.org" },
  { id: "kalro-tigoni", name: "KALRO Tigoni (potato centre)", kind: "research", town: "Tigoni", county: "Kiambu", lat: -1.15, lon: 36.68, carries: ["potato"], url: "https://www.kalro.org" },
  { id: "kalro-njoro", name: "KALRO Njoro (Food Crops Research)", kind: "research", town: "Njoro", county: "Nakuru", lat: -0.33, lon: 35.95, carries: ["potato", "maize", "grass"], url: "https://www.kalro.org" },
  { id: "kalro-oljororok", name: "KALRO Ol Joro Orok", kind: "research", town: "Ol Joro Orok", county: "Nyandarua", lat: -0.03, lon: 36.37, carries: ["potato", "vegetables"], url: "https://www.kalro.org" },
  { id: "kalro-kitale", name: "KALRO Kitale", kind: "research", town: "Kitale", county: "Trans Nzoia", lat: 1.02, lon: 35.0, carries: ["maize", "grass"], url: "https://www.kalro.org" },
  { id: "kalro-katumani", name: "KALRO Katumani (dryland crops)", kind: "research", town: "Katumani", county: "Machakos", lat: -1.58, lon: 37.24, carries: ["maize", "trees", "vegetables"], url: "https://www.kalro.org" },
  { id: "kalro-mtwapa", name: "KALRO Mtwapa", kind: "research", town: "Mtwapa", county: "Kilifi", lat: -3.93, lon: 39.74, carries: ["coconut", "mango", "banana", "citrus"], url: "https://www.kalro.org" },
  { id: "kalro-matuga", name: "KALRO Matuga", kind: "research", town: "Matuga", county: "Kwale", lat: -4.18, lon: 39.56, carries: ["coconut", "mango", "citrus"], url: "https://www.kalro.org" },
  { id: "kalro-kakamega", name: "KALRO Kakamega", kind: "research", town: "Kakamega", county: "Kakamega", lat: 0.28, lon: 34.75, carries: ["maize", "grass", "banana"], url: "https://www.kalro.org" },
  { id: "kalro-kisii", name: "KALRO Kisii", kind: "research", town: "Kisii", county: "Kisii", lat: -0.68, lon: 34.77, carries: ["banana", "vegetables", "trees"], url: "https://www.kalro.org" },
  { id: "kalro-perkerra", name: "KALRO Perkerra, Marigat", kind: "research", town: "Marigat", county: "Baringo", lat: 0.47, lon: 35.98, carries: ["maize", "vegetables", "grass"], url: "https://www.kalro.org" },
  { id: "kalro-kibos", name: "KALRO Sugar Research Institute, Kibos", kind: "research", town: "Kibos", county: "Kisumu", lat: -0.07, lon: 34.82, carries: ["grass", "vegetables"], url: "https://www.kalro.org" },
  { id: "cri-ruiru", name: "Coffee Research Institute, Ruiru", kind: "research", town: "Ruiru", county: "Kiambu", lat: -1.15, lon: 36.96, carries: ["coffee"], url: "https://www.kalro.org" },
  { id: "tri-kericho", name: "Tea Research Institute, Kericho", kind: "research", town: "Kericho", county: "Kericho", lat: -0.37, lon: 35.35, carries: ["tea"], url: "https://www.kalro.org" },
  { id: "kefri-muguga", name: "KEFRI Muguga (tree seed centre)", kind: "forestry", town: "Muguga", county: "Kiambu", lat: -1.23, lon: 36.65, carries: ["trees"], url: "https://www.kefri.org" },
  { id: "kefri-kitui", name: "KEFRI Kitui (dryland trees)", kind: "forestry", town: "Kitui", county: "Kitui", lat: -1.37, lon: 38.01, carries: ["trees", "mango"], url: "https://www.kefri.org" },
  { id: "kefri-maseno", name: "KEFRI Maseno", kind: "forestry", town: "Maseno", county: "Kisumu", lat: -0.0, lon: 34.6, carries: ["trees"], url: "https://www.kefri.org" },
  { id: "kefri-londiani", name: "KEFRI Londiani", kind: "forestry", town: "Londiani", county: "Kericho", lat: -0.17, lon: 35.6, carries: ["trees"], url: "https://www.kefri.org" },
  { id: "kefri-gede", name: "KEFRI Gede (coastal trees)", kind: "forestry", town: "Gede", county: "Kilifi", lat: -3.3, lon: 40.0, carries: ["trees", "coconut"], url: "https://www.kefri.org" },
  { id: "kefri-karura", name: "KEFRI Karura", kind: "forestry", town: "Nairobi", county: "Nairobi", lat: -1.24, lon: 36.83, carries: ["trees"], url: "https://www.kefri.org" },
  { id: "kfs-karura", name: "Kenya Forest Service nursery, Karura", kind: "forestry", town: "Nairobi", county: "Nairobi", lat: -1.24, lon: 36.82, carries: ["trees"], url: "https://www.kenyaforestservice.org" },
  { id: "kfs-menengai", name: "Kenya Forest Service nursery, Menengai", kind: "forestry", town: "Nakuru", county: "Nakuru", lat: -0.26, lon: 36.07, carries: ["trees"], url: "https://www.kenyaforestservice.org" },
  { id: "kfs-kakamega", name: "Kenya Forest Service nursery, Kakamega forest", kind: "forestry", town: "Kakamega", county: "Kakamega", lat: 0.33, lon: 34.86, carries: ["trees"], url: "https://www.kenyaforestservice.org" },
  { id: "jkuat-juja", name: "JKUAT tissue-culture laboratory, Juja", kind: "research", town: "Juja", county: "Kiambu", lat: -1.09, lon: 37.01, carries: ["banana", "vegetables"], url: "https://www.jkuat.ac.ke" },
  { id: "egerton-njoro", name: "Egerton University seed unit, Njoro", kind: "research", town: "Njoro", county: "Nakuru", lat: -0.37, lon: 35.93, carries: ["potato", "vegetables", "grass"], url: "https://www.egerton.ac.ke" },
  { id: "adc-kitale", name: "ADC seed potato and maize, Kitale", kind: "seed", town: "Kitale", county: "Trans Nzoia", lat: 1.0, lon: 35.0, carries: ["potato", "maize"], url: "https://www.adc.co.ke" },
  { id: "ksc-kitale", name: "Kenya Seed Company, Kitale", kind: "seed", town: "Kitale", county: "Trans Nzoia", lat: 1.02, lon: 35.0, carries: ["maize", "vegetables", "grass"], url: "https://kenyaseed.com" },
  { id: "kisima-timau", name: "Kisima Farm seed potato, Timau", kind: "seed", town: "Timau", county: "Meru", lat: 0.08, lon: 37.25, carries: ["potato"], url: "https://kisima.co.ke" },
  { id: "plantech-naivasha", name: "Plantech Kenya seedlings, Naivasha", kind: "supplier", town: "Naivasha", county: "Nakuru", lat: -0.72, lon: 36.43, carries: ["vegetables"], url: "https://plantechkenya.com" },
  { id: "simlaw-nairobi", name: "Simlaw Seeds, Nairobi", kind: "supplier", town: "Nairobi", county: "Nairobi", lat: -1.28, lon: 36.82, carries: ["vegetables", "maize", "grass"], url: "https://simlaw.co.ke" },
  { id: "simlaw-nakuru", name: "Simlaw Seeds, Nakuru", kind: "supplier", town: "Nakuru", county: "Nakuru", lat: -0.29, lon: 36.07, carries: ["vegetables", "maize"], url: "https://simlaw.co.ke" },
  { id: "simlaw-eldoret", name: "Simlaw Seeds, Eldoret", kind: "supplier", town: "Eldoret", county: "Uasin Gishu", lat: 0.51, lon: 35.27, carries: ["vegetables", "maize"], url: "https://simlaw.co.ke" },
  { id: "simlaw-kisumu", name: "Simlaw Seeds, Kisumu", kind: "supplier", town: "Kisumu", county: "Kisumu", lat: -0.09, lon: 34.76, carries: ["vegetables", "maize"], url: "https://simlaw.co.ke" },
  { id: "amiran-nairobi", name: "Amiran Kenya, Nairobi", kind: "supplier", town: "Nairobi", county: "Nairobi", lat: -1.31, lon: 36.86, carries: ["vegetables"], url: "https://amirankenya.com" },
  { id: "wambugu-atc", name: "Wambugu Agricultural Training Centre, Nyeri", kind: "training", town: "Nyeri", county: "Nyeri", lat: -0.42, lon: 36.95, carries: ["avocado", "mango", "vegetables", "trees", "grass"], url: "https://www.nyeri.go.ke" },
  { id: "bukura-atc", name: "Bukura Agricultural College, Kakamega", kind: "training", town: "Bukura", county: "Kakamega", lat: 0.26, lon: 34.63, carries: ["vegetables", "trees", "banana", "grass"], url: "https://www.bukuracollege.ac.ke" },
  { id: "mabanga-atc", name: "Mabanga Agricultural Training Centre, Bungoma", kind: "training", town: "Bungoma", county: "Bungoma", lat: 0.6, lon: 34.6, carries: ["vegetables", "trees", "grass", "banana"], url: "https://www.bungoma.go.ke" },
];

const KENYA = { lat: [-5, 5.5], lon: [33.5, 42] };
const inKenya = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= KENYA.lat[0] && lat <= KENYA.lat[1] && lon >= KENYA.lon[0] && lon <= KENYA.lon[1];

/** Where the farmer is: the phone's position when shared and plausible, else the county centre. */
export function farmerPosition({ county, lat, lon }) {
  const c = findCounty(county);
  if (!c) return null;
  const gps = inKenya(Number(lat), Number(lon));
  return gps ? { county: c.name, lat: Number(lat), lon: Number(lon), gps: true } : { county: c.name, lat: c.lat, lon: c.lon, gps: false };
}

/**
 * Getting there and back. Two ways a farmer actually travels: a boda straight
 * to the gate (KES 50 flag + 20/km, sensible up to ~15 km) or a matatu along
 * the road plus a boda hop at the far end (KES 60 + 4/km, about KES 100 for the
 * hop). The cheaper one is quoted, so the fare always grows with distance and a
 * nearer source is never shown as dearer to reach. Labelled an estimate in the app.
 */
export function transportEstimate(km) {
  const d = Math.max(1, km);
  const boda = { mode: "boda", oneWay: 50 + 20 * d, minutes: (d / 30) * 60 };
  const matatu = { mode: "matatu", oneWay: 60 + 4 * d + 100, minutes: (d / 40) * 60 + 15 };
  const pick = d <= 15 && boda.oneWay <= matatu.oneWay ? boda : matatu;
  const round10 = (n) => Math.round(n / 10) * 10;
  return { mode: pick.mode, one_way_kes: round10(pick.oneWay), round_trip_kes: round10(2 * pick.oneWay), minutes: Math.max(5, Math.round(pick.minutes)) };
}

/** The nearest sources, those carrying the need first; at least `limit` rows even when few carry it. */
export function nurseriesNear({ lat, lon, need, limit = 5 }) {
  const from = { lat, lon };
  const rows = NURSERIES.map((n) => {
    const distance_km = Math.round(distanceKm(from, n) * 10) / 10;
    return { ...n, distance_km, carries_need: !need || n.carries.includes(need), transport: transportEstimate(distance_km) };
  });
  rows.sort((a, b) => (a.carries_need === b.carries_need ? a.distance_km - b.distance_km : a.carries_need ? -1 : 1));
  const carrying = rows.filter((r) => r.carries_need);
  const picked = carrying.slice(0, limit);
  for (const r of rows) { if (picked.length >= limit) break; if (!picked.includes(r)) picked.push(r); }
  return picked.map(({ carries_need, ...r }) => ({ ...r, carries_need }));
}

/** `{ input }` or `{ error, fields }`. acres is optional (defaults to 1). */
export function validatePlanRequest(body) {
  const fields = {};
  const b = body && typeof body === "object" ? body : {};
  const need = String(b.need ?? "").toLowerCase().trim();
  if (!NEEDS[need]) fields.need = "UNKNOWN_NEED";
  const county = findCounty(String(b.county ?? ""));
  if (!county) fields.county = "UNKNOWN_COUNTY";
  const acresRaw = b.acres == null || b.acres === "" ? 1 : Number(b.acres);
  const acres = Number.isFinite(acresRaw) && acresRaw > 0 && acresRaw <= 500 ? Math.round(acresRaw * 4) / 4 : null;
  if (acres == null) fields.acres = "INVALID";
  const lang = b.lang === "sw" ? "sw" : "en";
  if (Object.keys(fields).length) return { error: "VALIDATION_ERROR", fields };
  return { input: { need, county: county.name, acres, lang, lat: b.lat, lon: b.lon } };
}

const ADVISOR_SYSTEM = `You are a Kenyan agricultural extension officer helping a smallholder farmer find seedlings or seed close to home.
Write 3 to 5 short sentences in plain words, in the language asked. No markdown, no lists, no headings.
Use ONLY the nurseries in the JSON you are given: never invent a nursery, a phone number, a price or an opening time.
Say which listed source to try first and why (distance, what it carries), what exactly to ask for, roughly how many seedlings or how much seed the farmer's acres need, the transport estimate given, and that stock should be confirmed (by phone or through the county agricultural office) before travelling.`;

/** The deterministic plan, used when there is no model or it fails. */
export function fallbackAdvice({ need, acres, lang, nurseries, per_acre }) {
  const n = NEEDS[need];
  const first = nurseries.find((x) => x.carries_need) ?? nurseries[0];
  const second = nurseries.find((x) => x !== first && x.carries_need);
  const total = per_acre.n ? Math.round(per_acre.n * acres) : null;
  const qty = total ? (lang === "sw" ? `Kwa ekari ${acres}, utahitaji takriban ${total.toLocaleString("en-KE")} ${per_acre.unit_sw}.` : `For ${acres} acre${acres === 1 ? "" : "s"} you need about ${total.toLocaleString("en-KE")} ${per_acre.unit}.`) : "";
  if (!first) return lang === "sw" ? "Hakuna chanzo kwenye orodha yetu karibu nawe bado. Uliza afisa wa kilimo wa kaunti yako." : "No source in our directory is near you yet. Ask your county agricultural office.";
  const t = first.transport;
  if (lang === "sw") {
    return [
      `Jaribu kwanza ${first.name} (${first.town}, kama km ${first.distance_km} kutoka kwako): ${first.carries_need ? `ina ${n.sw.toLowerCase()}` : "ni chanzo cha karibu, waulize wapi wanapata " + n.sw.toLowerCase()}.`,
      `Uliza ${n.ask.sw}.`,
      qty,
      `Nauli ya kwenda na kurudi kwa ${t.mode} ni takriban KES ${t.round_trip_kes} (dakika ${t.minutes} njia moja).`,
      second ? `Mbadala: ${second.name}, km ${second.distance_km}.` : "",
      "Thibitisha kuwa wana miche kabla ya kusafiri — piga simu au uliza ofisi ya kilimo ya kaunti; miche huisha mwanzoni mwa mvua.",
    ].filter(Boolean).join(" ");
  }
  return [
    `Try ${first.name} first (${first.town}, about ${first.distance_km} km from you): ${first.carries_need ? `it carries ${n.en.toLowerCase()}` : "it is the nearest source and can say where to get " + n.en.toLowerCase()}.`,
    `Ask for ${n.ask.en}.`,
    qty,
    `Getting there and back by ${t.mode} is about KES ${t.round_trip_kes} (${t.minutes} minutes each way).`,
    second ? `Alternative: ${second.name}, ${second.distance_km} km away.` : "",
    "Confirm they have stock before travelling — call, or ask the county agricultural office; seedlings sell out when the rains start.",
  ].filter(Boolean).join(" ");
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * The agent: Scout (shortlist near the farmer) → Planner (quantities and
 * transport) → Advisor (the model's plan, or the deterministic one).
 * `llm` is async ({ system, prompt }) => string | null.
 */
export async function planNurseries(input, { llm, now = () => new Date() } = {}) {
  const t0 = now().getTime();
  const steps = [];
  const step = (agent, action, output) => steps.push({ agent, action, output, latency_ms: Math.max(1, now().getTime() - t0) });
  const from = farmerPosition(input);
  const need = NEEDS[input.need];
  const nurseries = nurseriesNear({ lat: from.lat, lon: from.lon, need: input.need, limit: 5 });
  const sw = input.lang === "sw";
  const where = from.gps ? (sw ? "mahali ulipo" : "your location") : from.county;
  step("Scout", sw ? `Imetafuta vyanzo ${NURSERIES.length} karibu na ${where}` : `Searched ${NURSERIES.length} sources near ${where}`, `${nurseries.filter((n) => n.carries_need).length} carry ${need.en.toLowerCase()}; nearest ${nurseries[0]?.distance_km ?? "?"} km`);
  const per_acre = { n: need.per_acre, unit: need.unit, unit_sw: need.unit === "seedlings" ? "miche" : need.unit === "plantlets" ? "miche" : need.unit === "cuttings" ? "vipandikizi" : need.unit === "kg of seed" ? "kg za mbegu" : "vipandikizi", spacing: need.spacing };
  const total = Math.round(need.per_acre * input.acres);
  step("Planner", sw ? `Imekadiria kiasi kwa ekari ${input.acres} na nauli kwa kila chanzo` : `Worked out quantities for ${input.acres} acre(s) and the fare to each source`, `${total.toLocaleString("en-KE")} ${need.unit}; nearest round trip ≈ KES ${nurseries[0]?.transport.round_trip_kes ?? "?"}`);
  let text = null, source = "MOCK";
  if (llm) {
    try {
      const prompt = JSON.stringify({ language: input.lang === "sw" ? "Kiswahili" : "English", need: need.en, ask_for: need.ask.en, acres: input.acres, per_acre: need.per_acre, unit: need.unit, farmer_at: from.gps ? "GPS position" : `${from.county} county centre`, nurseries: nurseries.map((n) => ({ name: n.name, town: n.town, county: n.county, kind: n.kind, carries: n.carries, distance_km: n.distance_km, round_trip_kes: n.transport.round_trip_kes, by: n.transport.mode })) });
      const out = await llm({ system: ADVISOR_SYSTEM, prompt });
      if (typeof out === "string" && out.trim()) { text = clip(out.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim(), 900); source = "LIVE"; }
    } catch {}
  }
  if (!text) text = fallbackAdvice({ need: input.need, acres: input.acres, lang: input.lang, nurseries, per_acre });
  step("Advisor", source === "LIVE" ? (sw ? "Imeandika mpango kwa msaada wa modeli" : "Wrote the plan with the model") : (sw ? "Imeandika mpango kutoka kwenye orodha" : "Wrote the plan from the directory"), clip(text, 120));
  return { need: input.need, need_label: { en: need.en, sw: need.sw }, from, acres: input.acres, per_acre: { n: need.per_acre, unit: need.unit, spacing: need.spacing }, nurseries, advice: { text, source, lang: input.lang }, steps, generated_at: now().toISOString() };
}
