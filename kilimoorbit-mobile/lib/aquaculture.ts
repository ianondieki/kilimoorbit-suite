/**
 * Fish farming (samaki), the blue-economy side of the farm: Nile tilapia and
 * African catfish in earthen or lined ponds, tanks and cages. Pure logic, no
 * React, unit-tested in e2e/logic.spec.ts.
 *
 * The numbers follow common Kenyan extension guidance (the Kenya Fisheries
 * Service and KMFRI pond manuals behind the Economic Stimulus Programme ponds:
 * 300 m², about 3 tilapia per m², harvest at 250–350 g in 6–8 months). Growth is
 * a projection: every weighing of a sample of fish re-anchors it, so the plan
 * follows the farmer's own pond.
 */
import { addDays, daysBetween } from "./dates";
import type { L } from "./agronomy";

export type FishSpecies = "tilapia" | "catfish";
export type PondKind = "earthen" | "liner" | "tank" | "cage";
export const FISH_SPECIES: FishSpecies[] = ["tilapia", "catfish"];
export const POND_KINDS: PondKind[] = ["earthen", "liner", "tank", "cage"];

export type Pond = { id: string; name: string; species: FishSpecies; kind: PondKind; areaM2: number; stocked: string; fingerlings: number; startG: number };
export type FishSample = { id: string; pondId: string; date: string; avgG: number };
export type FishLoss = { id: string; pondId: string; date: string; count: number };

type SpeciesInfo = { wmax: number; k: number; targetG: number; density: Record<PondKind, number>; price: number; protein: [number, number, number, number] };
/** Logistic growth: W(t) = wmax / (1 + ((wmax − w0) / w0) · e^(−k·t)). k fitted to 5 g → target in ~180 days. */
export const SPECIES_INFO: Record<FishSpecies, SpeciesInfo> = {
  tilapia: { wmax: 450, k: Math.log(178) / 180, targetG: 300, density: { earthen: 3, liner: 5, tank: 30, cage: 40 }, price: 350, protein: [40, 35, 32, 28] },
  catfish: { wmax: 1200, k: Math.log(239) / 180, targetG: 600, density: { earthen: 5, liner: 8, tank: 40, cage: 40 }, price: 300, protein: [45, 40, 35, 32] },
};
/** Assumed further losses (birds, handling, disease) between now and harvest. */
export const FUTURE_LOSS = 0.1;

/** Fingerlings for a pond: density × area (m² of water; m³ for tanks and cages). */
export const stockingFor = (species: FishSpecies, kind: PondKind, areaM2: number) => Math.round(SPECIES_INFO[species].density[kind] * areaM2);

/** Grams after `days` from a known weight, on the species' curve. */
export function weightAfter(species: FishSpecies, w0: number, days: number): number {
  const { wmax, k } = SPECIES_INFO[species];
  const start = Math.min(Math.max(w0, 0.5), wmax * 0.98);
  return wmax / (1 + ((wmax - start) / start) * Math.exp(-k * Math.max(0, days)));
}

/** The latest anchor: the last sample on or before `today`, else stocking. */
export function anchorOf(pond: Pond, samples: FishSample[], today: string): { date: string; g: number; sampled: boolean } {
  const mine = samples.filter((s) => s.pondId === pond.id && s.date >= pond.stocked && s.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const last = mine[mine.length - 1];
  return last ? { date: last.date, g: last.avgG, sampled: true } : { date: pond.stocked, g: pond.startG, sampled: false };
}

export const weightOn = (pond: Pond, samples: FishSample[], date: string, today = date) => {
  const a = anchorOf(pond, samples, today);
  return weightAfter(pond.species, a.g, daysBetween(a.date, date));
};

export const aliveIn = (pond: Pond, losses: FishLoss[]) =>
  Math.max(0, pond.fingerlings - losses.filter((l) => l.pondId === pond.id).reduce((s, l) => s + l.count, 0));

/** Feed as % of body weight per day, by size. */
export function feedRate(g: number): number {
  return g < 10 ? 7 : g < 20 ? 5 : g < 50 ? 4 : g < 100 ? 3.5 : g < 200 ? 2.5 : g < 350 ? 2 : 1.5;
}

export type FeedStage = "fry" | "starter" | "grower" | "finisher";
export const feedStage = (g: number): FeedStage => (g < 5 ? "fry" : g < 20 ? "starter" : g < 100 ? "grower" : "finisher");
const STAGE_INDEX: Record<FeedStage, number> = { fry: 0, starter: 1, grower: 2, finisher: 3 };
export const FEED_PELLET: Record<FeedStage, L> = {
  fry: { en: "crumble (powder)", sw: "unga (crumble)" },
  starter: { en: "1–2 mm starter pellets", sw: "chembe za mwanzo mm 1–2" },
  grower: { en: "2–3 mm grower pellets", sw: "chembe za kukuza mm 2–3" },
  finisher: { en: "3–4 mm finisher pellets", sw: "chembe za kumalizia mm 3–4" },
};
export const proteinFor = (species: FishSpecies, stage: FeedStage) => SPECIES_INFO[species].protein[STAGE_INDEX[stage]];
export const mealsFor = (g: number) => (g < 20 ? 3 : 2);

export type FeedToday = { g: number; alive: number; biomassKg: number; kgPerDay: number; meals: number; stage: FeedStage; protein: number; ratePct: number };
export function feedToday(pond: Pond, samples: FishSample[], losses: FishLoss[], today: string): FeedToday {
  const g = weightOn(pond, samples, today);
  const alive = aliveIn(pond, losses);
  const biomassKg = (alive * g) / 1000;
  const ratePct = feedRate(g);
  const stage = feedStage(g);
  return { g, alive, biomassKg, kgPerDay: Math.round(biomassKg * ratePct * 10) / 1000, meals: mealsFor(g), stage, protein: proteinFor(pond.species, stage), ratePct };
}

export type HarvestPlan = { date: string; daysLeft: number; kg: number; feedKg: number; bags: number; fcr: number | null; value: number; reached: boolean };
/**
 * When the fish reach market size, how many kilos then (after FUTURE_LOSS),
 * the feed until then (day by day on the curve), bags of 20 kg, the feed
 * conversion ratio of that stretch, and the value at `price` per kg.
 */
export function harvestPlan(pond: Pond, samples: FishSample[], losses: FishLoss[], today: string, price = SPECIES_INFO[pond.species].price): HarvestPlan {
  const info = SPECIES_INFO[pond.species];
  const a = anchorOf(pond, samples, today);
  const alive = aliveIn(pond, losses);
  let day = 0, feed = 0;
  const startDay = Math.max(0, daysBetween(a.date, today));
  let g = weightAfter(pond.species, a.g, startDay);
  const g0 = g;
  const reached = g >= info.targetG;
  // Fish die off gradually: the average count over the stretch is used for feed.
  while (g < info.targetG && day < 730) {
    const left = alive * (1 - (FUTURE_LOSS * day) / 240);
    feed += (Math.max(0, left) * g * feedRate(g)) / 100 / 1000;
    day++;
    g = weightAfter(pond.species, a.g, startDay + day);
  }
  const fish = alive * (1 - FUTURE_LOSS);
  const kg = Math.round((fish * Math.max(g, g0)) / 1000);
  const gain = (fish * g - alive * g0) / 1000;
  return {
    date: addDays(today, day), daysLeft: day, kg, feedKg: Math.round(feed), bags: Math.ceil(feed / 20),
    fcr: gain > 0 && feed > 0 ? Math.round((feed / gain) * 10) / 10 : null, value: Math.round(kg * price), reached,
  };
}

/** A reminder for a pond, with a stable id so a tick survives re-renders. */
export type PondTask = { id: string; due: string; kind: "sample" | "feedChange" | "manure" | "harvest"; title: L };

/**
 * The pond's calendar: weigh a sample every 14 days, change the feed when the
 * fish cross a size, re-fertilise an earthen pond every 14 days, and harvest
 * when they reach market size.
 */
export function pondTasks(pond: Pond, samples: FishSample[], losses: FishLoss[], today: string): PondTask[] {
  const out: PondTask[] = [];
  const age = daysBetween(pond.stocked, today);
  const nextEvery = (n: number) => addDays(pond.stocked, Math.max(n, Math.ceil(Math.max(0, age) / n) * n));
  const sampleDue = nextEvery(14);
  out.push({ id: `sample:${sampleDue}`, due: sampleDue, kind: "sample", title: { en: `${pond.name}: weigh 20 fish and record the average`, sw: `${pond.name}: pima samaki 20 na urekodi wastani` } });
  if (pond.kind === "earthen") {
    const due = nextEvery(14);
    out.push({ id: `manure:${due}`, due, kind: "manure", title: { en: `${pond.name}: check the water is green; add manure if you can see your palm at elbow depth`, sw: `${pond.name}: hakikisha maji ni ya kijani; ongeza samadi ukiona kiganja kwa kina cha kiwiko` } });
  }
  // The next feed change: the first day the fish cross the next size.
  const now = feedStage(weightOn(pond, samples, today));
  for (let d = 1; d <= 120 && now !== "finisher"; d++) {
    const date = addDays(today, d);
    const s = feedStage(weightOn(pond, samples, date, today));
    if (s !== now) {
      out.push({ id: `feed:${s}`, due: date, kind: "feedChange", title: { en: `${pond.name}: change to ${FEED_PELLET[s].en} (${proteinFor(pond.species, s)}% protein)`, sw: `${pond.name}: badilisha kwa ${FEED_PELLET[s].sw} (protini ${proteinFor(pond.species, s)}%)` } });
      break;
    }
  }
  const h = harvestPlan(pond, samples, losses, today);
  out.push({ id: `harvest:${pond.id}`, due: h.date, kind: "harvest", title: { en: `${pond.name}: harvest, the fish should be about ${SPECIES_INFO[pond.species].targetG} g`, sw: `${pond.name}: vuna, samaki wanapaswa kuwa takriban g ${SPECIES_INFO[pond.species].targetG}` } });
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Before stocking: the steps, in order. */
export const POND_PREP: L[] = [
  { en: "Drain the pond and let the bottom dry and crack for 1–2 weeks (kills pests and predators).", sw: "Toa maji na uache sakafu ikauke na kupasuka wiki 1–2 (huua wadudu na wanyama wanaokula samaki)." },
  { en: "On acid soils, spread agricultural lime on the bottom: about 10–20 kg per 100 m².", sw: "Kwenye udongo wenye asidi, tawanya chokaa ya kilimo sakafuni: kilo 10–20 kwa kila m² 100." },
  { en: "Fill with clean water through a screened inlet, and put well-rotted manure in a crib at one corner (about a sack per 100 m²).", sw: "Jaza maji safi kupitia mlango wenye chujio, na weka samadi iliyooza kwenye kizimba pembeni (gunia moja kwa m² 100)." },
  { en: "Wait 7–10 days for green water: put your arm in to the elbow; when you can't see your palm, it's ready.", sw: "Subiri siku 7–10 maji yawe ya kijani: tia mkono hadi kiwiko; usipoona kiganja, yako tayari." },
  { en: "Stock in the cool of the morning: float the closed bags for 15–20 minutes, then let the fish swim out.", sw: "Weka samaki asubuhi kukiwa na baridi: elea mifuko iliyofungwa dakika 15–20, kisha waache samaki watoke." },
  { en: "Cover the pond with a net or strings against birds, and fence it against otters and thieves.", sw: "Funika bwawa kwa neti au kamba dhidi ya ndege, na uzungushie uzio dhidi ya fisi-maji na wezi." },
];

/** What a farmer sees at the pond, and what to do. */
export type FishProblem = { id: string; sign: L; cause: L; act: L; urgent: boolean };
export const FISH_PROBLEMS: FishProblem[] = [
  { id: "gasping", urgent: true,
    sign: { en: "Fish gasping at the surface at dawn", sw: "Samaki wanavuta hewa juu ya maji alfajiri" },
    cause: { en: "Too little oxygen (too much feed or manure, a thick algae bloom, hot still weather)", sw: "Oksijeni kidogo (chakula au samadi nyingi, mwani mzito, joto bila upepo)" },
    act: { en: "Stop feeding today, let fresh water in (and some out), splash or aerate. Feed less for a few days.", sw: "Acha kulisha leo, ingiza maji safi (na toa mengine), piga maji au tumia aerator. Lisha kidogo kwa siku chache." } },
  { id: "not-eating", urgent: false,
    sign: { en: "Fish not eating; feed left over; water cloudy or smelly", sw: "Samaki hawali; chakula kinabaki; maji machafu au yananuka" },
    cause: { en: "Overfeeding and dirty water (ammonia), or cold water", sw: "Kulisha kupita kiasi na maji machafu (amonia), au maji baridi" },
    act: { en: "Feed only what they finish in 10 minutes, remove left-over feed, change a third of the water.", sw: "Lisha kile wanachomaliza kwa dakika 10, toa chakula kilichobaki, badilisha theluthi ya maji." } },
  { id: "cotton", urgent: false,
    sign: { en: "White cotton-like patches on the skin or fins", sw: "Mabaka meupe kama pamba kwenye ngozi au mapezi" },
    cause: { en: "Fungus (Saprolegnia), usually after handling or wounds", sw: "Kuvu (Saprolegnia), mara nyingi baada ya kushikwa au majeraha" },
    act: { en: "Remove sick fish, handle gently, keep the water clean; ask the county fisheries officer about a salt bath.", sw: "Ondoa samaki wagonjwa, washike kwa upole, weka maji safi; uliza afisa wa uvuvi wa kaunti kuhusu kuoga kwa chumvi." } },
  { id: "red-sores", urgent: true,
    sign: { en: "Red sores, bleeding fins or swollen bellies; fish dying daily", sw: "Vidonda vyekundu, mapezi yanayotoka damu au matumbo yaliyovimba; samaki wanakufa kila siku" },
    cause: { en: "A bacterial infection, often when the water is poor", sw: "Maambukizi ya bakteria, mara nyingi maji yakiwa mabaya" },
    act: { en: "Record and bury dead fish away from the pond, improve the water, and call the county fisheries officer before using any drug.", sw: "Rekodi na uzike samaki waliokufa mbali na bwawa, boresha maji, na umpigie afisa wa uvuvi wa kaunti kabla ya kutumia dawa yoyote." } },
  { id: "missing", urgent: false,
    sign: { en: "Fewer fish than expected at sampling", sw: "Samaki wachache kuliko ilivyotarajiwa wakati wa kupima" },
    cause: { en: "Birds (kingfishers, herons), otters, snakes or theft", sw: "Ndege (mdiria, korongo), fisi-maji, nyoka au wizi" },
    act: { en: "Net or string the pond, fence it, and clear tall grass around it.", sw: "Weka neti au kamba juu ya bwawa, zungushia uzio, na fyeka nyasi ndefu kuzunguka." } },
];

/* ── the stored ponds (lib/fish.ts keeps them; sanitized here so it is testable) ── */
export type FishStore = {
  v: 1; ponds: Pond[]; samples: FishSample[]; losses: FishLoss[]; done: Record<string, true>;
  /** The farmer's price per kg, per species. */
  prices: { tilapia: number | null; catfish: number | null };
};
export const EMPTY_FISH: FishStore = { v: 1, ponds: [], samples: [], losses: [], done: {}, prices: { tilapia: null, catfish: null } };
const MAX_PONDS = 20, MAX_SAMPLES = 500, MAX_LOSSES = 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: unknown): d is string => typeof d === "string" && DAY.test(d);
const num = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const price = (p: unknown) => (num(p, 1, 100000) ? Math.round(p) : null);

export function cleanPond(p: any): Pond | null {
  if (!p || typeof p.id !== "string" || !FISH_SPECIES.includes(p.species) || !POND_KINDS.includes(p.kind) || !day(p.stocked)) return null;
  if (!num(p.areaM2, 1, 100000) || !Number.isInteger(p.fingerlings) || p.fingerlings < 1 || p.fingerlings > 1000000) return null;
  return {
    id: p.id, species: p.species, kind: p.kind, stocked: p.stocked, areaM2: Math.round(p.areaM2), fingerlings: p.fingerlings,
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : "—",
    startG: num(p.startG, 0.5, 500) ? p.startG : 5,
  };
}

export function sanitizeFish(raw: any): FishStore {
  if (!raw || typeof raw !== "object") return EMPTY_FISH;
  const ponds = (Array.isArray(raw.ponds) ? raw.ponds : []).map(cleanPond).filter((p: Pond | null): p is Pond => !!p).slice(0, MAX_PONDS);
  const ids = new Set(ponds.map((p: Pond) => p.id));
  return {
    v: 1,
    ponds,
    samples: (Array.isArray(raw.samples) ? raw.samples : [])
      .filter((s: any) => s && typeof s.id === "string" && ids.has(s.pondId) && day(s.date) && num(s.avgG, 0.5, 5000))
      .map((s: any): FishSample => ({ id: s.id, pondId: s.pondId, date: s.date, avgG: Math.round(s.avgG * 10) / 10 }))
      .slice(-MAX_SAMPLES),
    losses: (Array.isArray(raw.losses) ? raw.losses : [])
      .filter((l: any) => l && typeof l.id === "string" && ids.has(l.pondId) && day(l.date) && Number.isInteger(l.count) && l.count >= 1 && l.count <= 1000000)
      .map((l: any): FishLoss => ({ id: l.id, pondId: l.pondId, date: l.date, count: l.count }))
      .slice(-MAX_LOSSES),
    done: raw.done && typeof raw.done === "object" && !Array.isArray(raw.done) ? raw.done : {},
    prices: { tilapia: price(raw.prices?.tilapia), catfish: price(raw.prices?.catfish) },
  };
}

