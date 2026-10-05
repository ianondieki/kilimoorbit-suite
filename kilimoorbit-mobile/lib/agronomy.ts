/**
 * Crop calendars for the Shamba planner: growth stages, dated tasks and the
 * input rates behind the "what you'll need" calculator.
 *
 * These are typical rain-fed Kenyan smallholder recommendations (extension
 * and seed-company guides), not a prescription: varieties, altitude and soil
 * change them, and the app says so wherever the numbers appear. Day 0 is the
 * planting day (the transplanting day for nursery crops; nursery work has
 * negative days).
 *
 * NOTE: Kiswahili must be reviewed by a native Kenyan speaker before release.
 */
import type { Lang } from "./i18n";
import type { SeasonKey } from "./season";

/** A string in both app languages. */
export type L = { sw: string; en: string };
export const pick = (lang: Lang, l: L) => l[lang];

export type CropKey = "maize" | "beans" | "tomato" | "potatoes" | "cabbage" | "kale";
export const CROP_KEYS: CropKey[] = ["maize", "beans", "tomato", "potatoes", "cabbage", "kale"];

export type TaskKind = "prep" | "plant" | "feed" | "weed" | "protect" | "harvest" | "store";
/** Which forecast window decides the best day for this task (see lib/advice.ts). */
export type TaskWeather = "spray" | "plant" | "feed" | "dry";
export type CropTask = { id: string; day: number; kind: TaskKind; title: L; wx?: TaskWeather };
export type Stage = { day: number; name: L };

export type Input = { product: string; kgPerAcre: number; splits?: number; when: L };

export type CropPlan = {
  key: CropKey;
  /** Typical days from planting (or transplanting) to the first harvest. */
  daysToHarvest: number;
  /** How long harvesting goes on (picked crops). */
  harvestDays: number;
  /** Range note, e.g. maturity by altitude/variety. */
  maturity: L;
  spacing: string;
  /** Seed per acre: kg of seed, or seedlings for transplanted crops. */
  seed: { perAcre: number; unit: "kg" | "seedlings"; note: L };
  basal?: Input;
  topdress?: Input;
  /** Typical smallholder harvest per acre, kg: [average practice, good practice]. */
  yieldPerAcre: [number, number];
  /** Rain-fed planting seasons; `water` crops can go in any season with irrigation. */
  seasons: SeasonKey[];
  water?: boolean;
  stages: Stage[];
  tasks: CropTask[];
};

const RAINS: SeasonKey[] = ["masika", "vuli"];
const ALL: SeasonKey[] = ["kiangazi", "masika", "kipupwe", "vuli"];

export const CROPS: Record<CropKey, CropPlan> = {
  maize: {
    key: "maize",
    yieldPerAcre: [900, 2250],
    daysToHarvest: 120,
    harvestDays: 14,
    maturity: { en: "90–180 days, by variety and altitude", sw: "Siku 90–180, kulingana na aina na mwinuko" },
    spacing: "75 × 25 cm",
    seed: { perAcre: 10, unit: "kg", note: { en: "1 seed per hole", sw: "Mbegu 1 kila shimo" } },
    basal: { product: "DAP", kgPerAcre: 50, when: { en: "at planting", sw: "wakati wa kupanda" } },
    topdress: { product: "CAN", kgPerAcre: 50, when: { en: "at knee height", sw: "mahindi yakifika gotini" } },
    seasons: RAINS,
    stages: [
      { day: 0, name: { en: "Planted", sw: "Imepandwa" } },
      { day: 7, name: { en: "Emerging", sw: "Inaota" } },
      { day: 21, name: { en: "Leafy growth", sw: "Ukuaji wa majani" } },
      { day: 60, name: { en: "Tasselling", sw: "Kutoa maua" } },
      { day: 85, name: { en: "Grain filling", sw: "Kujaza punje" } },
      { day: 120, name: { en: "Ready to harvest", sw: "Tayari kuvunwa" } },
    ],
    tasks: [
      { id: "prep", day: -14, kind: "prep", title: { en: "Plough and harrow before the rains", sw: "Lima na lainisha udongo kabla ya mvua" } },
      { id: "buy", day: -7, kind: "prep", title: { en: "Buy certified seed and DAP", sw: "Nunua mbegu zilizothibitishwa na mbolea ya DAP" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Plant 75 × 25 cm with DAP", sw: "Panda sm 75 × 25 pamoja na DAP" }, wx: "plant" },
      { id: "faw1", day: 14, kind: "protect", title: { en: "Scout for fall armyworm: a W-walk, 50 plants", sw: "Kagua viwavijeshi: tembea kwa umbo la W, mimea 50" } },
      { id: "weed1", day: 21, kind: "weed", title: { en: "First weeding", sw: "Palizi ya kwanza" } },
      { id: "can", day: 35, kind: "feed", title: { en: "Top-dress with CAN", sw: "Weka mbolea ya CAN" }, wx: "feed" },
      { id: "faw2", day: 35, kind: "protect", title: { en: "Scout again for fall armyworm (W-walk)", sw: "Kagua tena viwavijeshi (umbo la W)" } },
      { id: "weed2", day: 42, kind: "weed", title: { en: "Second weeding", sw: "Palizi ya pili" } },
      { id: "harvest", day: 120, kind: "harvest", title: { en: "Harvest when husks are dry and cobs droop", sw: "Vuna maganda yakikauka na magunzi kuinama" }, wx: "dry" },
      { id: "store", day: 127, kind: "store", title: { en: "Dry grain well, then store in hermetic bags", sw: "Kausha punje vizuri, hifadhi kwenye mifuko isiyopitisha hewa" }, wx: "dry" },
    ],
  },
  beans: {
    key: "beans",
    yieldPerAcre: [270, 720],
    daysToHarvest: 85,
    harvestDays: 10,
    maturity: { en: "60–90 days, by variety", sw: "Siku 60–90, kulingana na aina" },
    spacing: "50 × 10 cm",
    seed: { perAcre: 25, unit: "kg", note: { en: "more for large-seeded types", sw: "zaidi kwa mbegu kubwa" } },
    basal: { product: "DAP", kgPerAcre: 50, when: { en: "at planting", sw: "wakati wa kupanda" } },
    seasons: RAINS,
    stages: [
      { day: 0, name: { en: "Planted", sw: "Imepandwa" } },
      { day: 7, name: { en: "Emerging", sw: "Inaota" } },
      { day: 14, name: { en: "Leafy growth", sw: "Ukuaji wa majani" } },
      { day: 35, name: { en: "Flowering", sw: "Kutoa maua" } },
      { day: 50, name: { en: "Pods filling", sw: "Maganda kujaa" } },
      { day: 85, name: { en: "Ready to harvest", sw: "Tayari kuvunwa" } },
    ],
    tasks: [
      { id: "prep", day: -7, kind: "prep", title: { en: "Prepare a fine seedbed", sw: "Andaa kitalu laini" } },
      { id: "buy", day: -3, kind: "prep", title: { en: "Buy certified seed and DAP", sw: "Nunua mbegu zilizothibitishwa na DAP" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Plant 50 × 10 cm with DAP", sw: "Panda sm 50 × 10 pamoja na DAP" }, wx: "plant" },
      { id: "weed1", day: 14, kind: "weed", title: { en: "First weeding, when leaves are dry", sw: "Palizi ya kwanza, majani yakiwa makavu" } },
      { id: "fly", day: 18, kind: "protect", title: { en: "Check seedlings for bean fly and aphids", sw: "Kagua miche kuona inzi wa maharagwe na vidukari" } },
      { id: "weed2", day: 30, kind: "weed", title: { en: "Second weeding, before flowering", sw: "Palizi ya pili, kabla ya maua" } },
      { id: "spots", day: 40, kind: "protect", title: { en: "Watch for rust and leaf spots", sw: "Angalia kutu na madoa ya majani" } },
      { id: "harvest", day: 85, kind: "harvest", title: { en: "Harvest when most pods are dry", sw: "Vuna maganda mengi yakikauka" }, wx: "dry" },
      { id: "store", day: 90, kind: "store", title: { en: "Thresh, dry and store in hermetic bags", sw: "Pura, kausha na hifadhi kwenye mifuko isiyopitisha hewa" }, wx: "dry" },
    ],
  },
  tomato: {
    key: "tomato",
    yieldPerAcre: [6000, 16000],
    daysToHarvest: 75,
    harvestDays: 45,
    maturity: { en: "first picking 70–90 days after transplanting", sw: "mavuno ya kwanza siku 70–90 baada ya kuhamisha miche" },
    spacing: "90 × 60 cm",
    seed: { perAcre: 7400, unit: "seedlings", note: { en: "staked, open field", sw: "kwa miti, shambani wazi" } },
    basal: { product: "DAP", kgPerAcre: 100, when: { en: "at transplanting", sw: "wakati wa kuhamisha miche" } },
    topdress: { product: "CAN", kgPerAcre: 100, splits: 2, when: { en: "in two halves, weeks 3 and 6", sw: "mara mbili, wiki ya 3 na ya 6" } },
    seasons: ALL,
    water: true,
    stages: [
      { day: -28, name: { en: "Nursery", sw: "Kitalu" } },
      { day: 0, name: { en: "Transplanted", sw: "Imehamishwa" } },
      { day: 7, name: { en: "Establishing", sw: "Inashika" } },
      { day: 30, name: { en: "Flowering", sw: "Kutoa maua" } },
      { day: 50, name: { en: "Fruit setting", sw: "Kuweka matunda" } },
      { day: 75, name: { en: "Picking", sw: "Kuvuna" } },
    ],
    tasks: [
      { id: "nursery", day: -28, kind: "prep", title: { en: "Sow seed in a raised nursery bed", sw: "Panda mbegu kwenye kitalu kilichoinuliwa" } },
      { id: "harden", day: -7, kind: "prep", title: { en: "Harden seedlings: water less", sw: "Imarisha miche: punguza maji" } },
      { id: "holes", day: -3, kind: "prep", title: { en: "Dig holes and mix in manure", sw: "Chimba mashimo na changanya samadi" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Transplant in the evening with DAP", sw: "Hamisha miche jioni pamoja na DAP" } },
      { id: "stake", day: 14, kind: "prep", title: { en: "Stake and tie the plants", sw: "Weka miti na funga mimea" } },
      { id: "scout", day: 18, kind: "protect", title: { en: "Scout for Tuta absoluta and blight", sw: "Kagua Tuta absoluta na baridi (blight)" } },
      { id: "can1", day: 21, kind: "feed", title: { en: "First CAN top-dress (half the dose)", sw: "CAN ya kwanza (nusu ya kipimo)" }, wx: "feed" },
      { id: "prune", day: 28, kind: "weed", title: { en: "Weed and remove side shoots", sw: "Palilia na ondoa machipukizi ya pembeni" } },
      { id: "can2", day: 42, kind: "feed", title: { en: "Second CAN top-dress", sw: "CAN ya pili" }, wx: "feed" },
      { id: "blight", day: 45, kind: "protect", title: { en: "Protect against blight before heavy rain", sw: "Kinga dhidi ya baridi kabla ya mvua kubwa" }, wx: "spray" },
      { id: "harvest", day: 75, kind: "harvest", title: { en: "Start picking at colour-turning", sw: "Anza kuvuna nyanya zikianza kubadilika rangi" } },
    ],
  },
  potatoes: {
    key: "potatoes",
    yieldPerAcre: [2800, 8000],
    daysToHarvest: 100,
    harvestDays: 10,
    maturity: { en: "90–120 days, by variety", sw: "Siku 90–120, kulingana na aina" },
    spacing: "75 × 30 cm",
    seed: { perAcre: 800, unit: "kg", note: { en: "certified seed, about 16 bags of 50 kg", sw: "mbegu zilizothibitishwa, takriban magunia 16 ya kilo 50" } },
    basal: { product: "DAP", kgPerAcre: 200, when: { en: "in the furrow at planting", sw: "mtaroni wakati wa kupanda" } },
    seasons: RAINS,
    stages: [
      { day: 0, name: { en: "Planted", sw: "Imepandwa" } },
      { day: 21, name: { en: "Emerging", sw: "Inaota" } },
      { day: 35, name: { en: "Leafy growth", sw: "Ukuaji wa majani" } },
      { day: 50, name: { en: "Flowering, tubers forming", sw: "Maua, viazi kuanza" } },
      { day: 70, name: { en: "Tubers bulking", sw: "Viazi kunenepa" } },
      { day: 100, name: { en: "Mature", sw: "Vimekomaa" } },
    ],
    tasks: [
      { id: "prep", day: -14, kind: "prep", title: { en: "Plough deep and harrow", sw: "Lima kwa kina na lainisha" } },
      { id: "buy", day: -7, kind: "prep", title: { en: "Buy certified, sprouted seed potatoes", sw: "Nunua mbegu za viazi zilizothibitishwa zenye machipukizi" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Plant 75 × 30 cm with DAP in the furrow", sw: "Panda sm 75 × 30, DAP mtaroni" }, wx: "plant" },
      { id: "earth1", day: 28, kind: "weed", title: { en: "Weed and earth up", sw: "Palilia na pandisha udongo" } },
      { id: "blight1", day: 35, kind: "protect", title: { en: "Scout for late blight in cool, wet weather", sw: "Kagua baridi (blight) hali ikiwa ya baridi na mvua" } },
      { id: "earth2", day: 49, kind: "weed", title: { en: "Second earthing up to cover tubers", sw: "Pandisha udongo tena kufunika viazi" } },
      { id: "dehaulm", day: 90, kind: "harvest", title: { en: "Cut the tops 2 weeks before harvest", sw: "Kata mashina wiki 2 kabla ya kuvuna" } },
      { id: "harvest", day: 104, kind: "harvest", title: { en: "Harvest on a dry day; cure in shade", sw: "Vuna siku kavu; kausha kivulini" }, wx: "dry" },
      { id: "store", day: 110, kind: "store", title: { en: "Store in a dark, cool, airy place", sw: "Hifadhi mahali penye giza, baridi na hewa" } },
    ],
  },
  cabbage: {
    key: "cabbage",
    yieldPerAcre: [8000, 16000],
    daysToHarvest: 90,
    harvestDays: 21,
    maturity: { en: "75–120 days after transplanting", sw: "siku 75–120 baada ya kuhamisha miche" },
    spacing: "60 × 60 cm",
    seed: { perAcre: 11000, unit: "seedlings", note: { en: "from about 100 g of seed", sw: "kutoka takriban gramu 100 za mbegu" } },
    basal: { product: "DAP", kgPerAcre: 100, when: { en: "at transplanting", sw: "wakati wa kuhamisha miche" } },
    topdress: { product: "CAN", kgPerAcre: 100, splits: 2, when: { en: "in two halves, weeks 3 and 6", sw: "mara mbili, wiki ya 3 na ya 6" } },
    seasons: ALL,
    water: true,
    stages: [
      { day: -30, name: { en: "Nursery", sw: "Kitalu" } },
      { day: 0, name: { en: "Transplanted", sw: "Imehamishwa" } },
      { day: 21, name: { en: "Leafy growth", sw: "Ukuaji wa majani" } },
      { day: 50, name: { en: "Heads forming", sw: "Vichwa kuunda" } },
      { day: 90, name: { en: "Ready to harvest", sw: "Tayari kuvunwa" } },
    ],
    tasks: [
      { id: "nursery", day: -30, kind: "prep", title: { en: "Sow seed in a nursery bed", sw: "Panda mbegu kitaluni" } },
      { id: "holes", day: -3, kind: "prep", title: { en: "Dig holes and mix in manure", sw: "Chimba mashimo na changanya samadi" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Transplant 60 × 60 cm with DAP", sw: "Hamisha miche sm 60 × 60 pamoja na DAP" } },
      { id: "weed1", day: 14, kind: "weed", title: { en: "First weeding", sw: "Palizi ya kwanza" } },
      { id: "can1", day: 21, kind: "feed", title: { en: "First CAN top-dress (half the dose)", sw: "CAN ya kwanza (nusu ya kipimo)" }, wx: "feed" },
      { id: "dbm", day: 21, kind: "protect", title: { en: "Check leaf undersides for diamondback moth", sw: "Kagua chini ya majani kuona nondo wa kabichi" } },
      { id: "can2", day: 42, kind: "feed", title: { en: "Second CAN top-dress", sw: "CAN ya pili" }, wx: "feed" },
      { id: "harvest", day: 90, kind: "harvest", title: { en: "Harvest when heads are firm", sw: "Vuna vichwa vikiwa vigumu" } },
    ],
  },
  kale: {
    key: "kale",
    yieldPerAcre: [4000, 8000],
    daysToHarvest: 42,
    harvestDays: 120,
    maturity: { en: "picking from week 6 for several months", sw: "kuvuna kuanzia wiki ya 6 kwa miezi kadhaa" },
    spacing: "60 × 45 cm",
    seed: { perAcre: 15000, unit: "seedlings", note: { en: "from about 150 g of seed", sw: "kutoka takriban gramu 150 za mbegu" } },
    basal: { product: "DAP", kgPerAcre: 50, when: { en: "at transplanting", sw: "wakati wa kuhamisha miche" } },
    topdress: { product: "CAN", kgPerAcre: 100, splits: 2, when: { en: "weeks 3 and 9", sw: "wiki ya 3 na ya 9" } },
    seasons: ALL,
    water: true,
    stages: [
      { day: -30, name: { en: "Nursery", sw: "Kitalu" } },
      { day: 0, name: { en: "Transplanted", sw: "Imehamishwa" } },
      { day: 21, name: { en: "Leafy growth", sw: "Ukuaji wa majani" } },
      { day: 42, name: { en: "Picking", sw: "Kuvuna" } },
    ],
    tasks: [
      { id: "nursery", day: -30, kind: "prep", title: { en: "Sow seed in a nursery bed", sw: "Panda mbegu kitaluni" } },
      { id: "plant", day: 0, kind: "plant", title: { en: "Transplant 60 × 45 cm with DAP", sw: "Hamisha miche sm 60 × 45 pamoja na DAP" } },
      { id: "weed1", day: 14, kind: "weed", title: { en: "First weeding", sw: "Palizi ya kwanza" } },
      { id: "can1", day: 21, kind: "feed", title: { en: "Top-dress with CAN", sw: "Weka mbolea ya CAN" }, wx: "feed" },
      { id: "aphids", day: 25, kind: "protect", title: { en: "Check for aphids and diamondback moth", sw: "Kagua vidukari na nondo wa kabichi" } },
      { id: "harvest", day: 42, kind: "harvest", title: { en: "Start picking the lower leaves weekly", sw: "Anza kuvuna majani ya chini kila wiki" } },
      { id: "can2", day: 63, kind: "feed", title: { en: "Top-dress CAN again to keep leaves coming", sw: "Weka CAN tena ili majani yaendelee" }, wx: "feed" },
    ],
  },
};

/* ── input calculator ── */
export const BAG_KG = 50;

/** Rounded to the nearest half bag, never below half a bag. */
export const bagsFor = (kg: number) => Math.max(0.5, Math.round((kg / BAG_KG) * 2) / 2);

export type InputNeed = { label: string; amount: string; when?: L; note?: L };

export function inputsFor(crop: CropKey, acres: number, lang: Lang): InputNeed[] {
  const p = CROPS[crop];
  const fmt = (n: number) => n.toLocaleString("en-KE", { maximumFractionDigits: 1 });
  const bags = (kg: number) => {
    const b = bagsFor(kg);
    const half = b % 1 !== 0;
    const whole = Math.floor(b);
    const word = lang === "sw" ? (b === 1 ? "gunia" : "magunia") : b === 1 ? "bag" : "bags";
    return `${whole || ""}${half ? "½" : ""} ${word}`.trim();
  };
  const out: InputNeed[] = [];
  const seedAmt = p.seed.perAcre * acres;
  out.push({
    label: p.seed.unit === "kg" ? (lang === "sw" ? "Mbegu" : "Seed") : (lang === "sw" ? "Miche" : "Seedlings"),
    amount: p.seed.unit === "kg" ? `${fmt(seedAmt)} kg` : (Math.round(seedAmt / 100) * 100).toLocaleString("en-KE"),
    note: p.seed.note,
  });
  for (const inp of [p.basal, p.topdress]) {
    if (!inp) continue;
    const kg = inp.kgPerAcre * acres;
    out.push({ label: inp.product, amount: `${fmt(kg)} kg · ${bags(kg)}`, when: inp.when });
  }
  return out;
}

/* ── planting progress ── */
export function stageAt(crop: CropKey, day: number): { stage: Stage; index: number } {
  const stages = CROPS[crop].stages;
  let index = 0;
  for (let i = 0; i < stages.length; i++) if (day >= stages[i].day) index = i;
  return { stage: stages[index], index };
}

/** Crops worth planting (rain-fed first) in a season. */
export function cropsForSeason(season: SeasonKey): { rainfed: CropKey[]; irrigated: CropKey[] } {
  const rainfed = CROP_KEYS.filter((k) => !CROPS[k].water && CROPS[k].seasons.includes(season));
  const irrigated = CROP_KEYS.filter((k) => CROPS[k].water);
  return { rainfed, irrigated };
}

/* ── field size by pacing ── */
export const SQ_M_PER_ACRE = 4046.86;

/**
 * Acres from a field walked in big steps (about a metre each): length × width.
 * For an uneven field, use the average of each pair of opposite sides.
 */
export function acresFromSteps(length: number, width: number, stepM = 1): number | null {
  if (!(length > 0) || !(width > 0) || !(stepM > 0) || !Number.isFinite(length * width * stepM)) return null;
  return Math.round(((length * stepM * width * stepM) / SQ_M_PER_ACRE) * 100) / 100;
}
