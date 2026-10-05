/**
 * Farm trivia for the Today screen: five questions a day, drawn from the
 * same extension guidance the rest of the app is built on (so a right answer
 * is also a reminder of what the app advises). Pure logic here: the question
 * bank, the day's draw (the same five all day, unanswered questions first)
 * and the score/streak maths. Storage lives in lib/quiz.ts. Unit-tested in
 * e2e/logic.spec.ts.
 *
 * NOTE: Kiswahili must be reviewed by a native Kenyan speaker before release.
 */
import type { L } from "./agronomy";
import { addDays } from "./dates";

export type Topic = "crops" | "livestock" | "soil" | "pests" | "store" | "market" | "weather" | "poultry";
export type Trivia = { id: string; topic: Topic; q: L; options: L[]; answer: number; why: L };

const q = (id: string, topic: Topic, sw: string, en: string, options: [string, string][], answer: number, whySw: string, whyEn: string): Trivia => ({
  id, topic, q: { sw, en }, options: options.map(([s, e]) => ({ sw: s, en: e })), answer, why: { sw: whySw, en: whyEn },
});

export const BANK: Trivia[] = [
  q("faw-threshold", "pests", "Mahindi yakiwa chini ya wiki 3, unachukua hatua dhidi ya viwavijeshi mimea mingapi ikiwa imeharibiwa?", "In maize under 3 weeks old, at what share of damaged plants do you act against fall armyworm?",
    [["5%", "5%"], ["20%", "20%"], ["50%", "50%"], ["80%", "80%"]], 1,
    "Kiwango cha CIMMYT: 20% katika wiki 2½ za kwanza, 40% baada ya hapo hadi kutoa maua.", "CIMMYT's action level: 20% in the first 2½ weeks, 40% from then until tasselling."),
  q("faw-walk", "pests", "Ukikagua shamba la mahindi kuona viwavijeshi, unatembea kwa umbo gani?", "When scouting a maize field for fall armyworm, what shape do you walk?",
    [["Mstari mnyoofu", "A straight line"], ["Umbo la W", "A W shape"], ["Duara", "A circle"], ["Pembeni tu", "Along the edge only"]], 1,
    "W-walk: vituo 5, mimea 10 kila kituo, ili kuona shamba lote.", "A W-walk: 5 stops, 10 plants each, so the whole field is sampled."),
  q("maize-spacing", "crops", "Nafasi inayopendekezwa ya kupanda mahindi ni ipi?", "What is the recommended maize spacing?",
    [["sm 50 × 10", "50 × 10 cm"], ["sm 75 × 25", "75 × 25 cm"], ["sm 90 × 60", "90 × 60 cm"], ["sm 100 × 100", "100 × 100 cm"]], 1,
    "Sm 75 kati ya mistari na sm 25 kati ya mimea, mbegu 1 kila shimo.", "75 cm between rows and 25 cm between plants, one seed per hole."),
  q("beans-spacing", "crops", "Maharagwe hupandwa kwa nafasi gani?", "Beans are planted at what spacing?",
    [["sm 50 × 10", "50 × 10 cm"], ["sm 75 × 25", "75 × 25 cm"], ["sm 90 × 60", "90 × 60 cm"], ["sm 30 × 30", "30 × 30 cm"]], 0,
    "Sm 50 kati ya mistari na sm 10 kati ya mimea; takriban kilo 25 za mbegu kwa ekari.", "50 cm between rows, 10 cm between plants; about 25 kg of seed an acre."),
  q("potato-seed", "crops", "Ekari moja ya viazi inahitaji mbegu kiasi gani?", "How much seed does an acre of potatoes need?",
    [["Kilo 80", "80 kg"], ["Kilo 200", "200 kg"], ["Kilo 800", "800 kg"], ["Kilo 2,000", "2,000 kg"]], 2,
    "Takriban kilo 800 (magunia 16 ya kilo 50) za mbegu zilizothibitishwa.", "About 800 kg (16 bags of 50 kg) of certified seed."),
  q("dap-can", "crops", "Mbolea gani huwekwa wakati wa kupanda mahindi, na ipi mahindi yakifika gotini?", "Which fertiliser goes in at planting maize, and which at knee height?",
    [["CAN kisha DAP", "CAN, then DAP"], ["DAP kisha CAN", "DAP, then CAN"], ["Urea pekee", "Urea only"], ["DAP mara zote mbili", "DAP both times"]], 1,
    "DAP (fosforasi) kwenye shimo wakati wa kupanda; CAN (nitrojeni) kama mbolea ya juu.", "DAP (phosphorus) in the hole at planting; CAN (nitrogen) as the top-dressing."),
  q("cow-gestation", "livestock", "Ng'ombe hubeba mimba kwa muda gani?", "How long is a cow pregnant?",
    [["Siku 114", "114 days"], ["Siku 150", "150 days"], ["Siku 283", "283 days"], ["Siku 365", "365 days"]], 2,
    "Takriban siku 283 (miezi 9 na wiki 1–2).", "About 283 days (9 months and a week or two)."),
  q("goat-gestation", "livestock", "Mbuzi hubeba mimba kwa muda gani?", "How long is a goat pregnant?",
    [["Siku 114", "114 days"], ["Siku 150", "150 days"], ["Siku 200", "200 days"], ["Siku 283", "283 days"]], 1,
    "Takriban siku 150 (miezi 5).", "About 150 days (5 months)."),
  q("pig-gestation", "livestock", "Nguruwe hubeba mimba kwa muda gani?", "How long is a sow pregnant?",
    [["Miezi 2", "2 months"], ["Miezi 3, wiki 3, siku 3", "3 months, 3 weeks, 3 days"], ["Miezi 6", "6 months"], ["Miezi 9", "9 months"]], 1,
    "Siku 114: miezi 3, wiki 3 na siku 3.", "114 days: three months, three weeks and three days."),
  q("heat-cycle", "livestock", "Ng'ombe asiye na mimba hupata joto (heat) kila baada ya siku ngapi?", "A cow that is not pregnant comes on heat every how many days?",
    [["Siku 7", "7 days"], ["Siku 21", "21 days"], ["Siku 45", "45 days"], ["Siku 90", "90 days"]], 1,
    "Takriban kila siku 21 (kondoo kila siku 17). Akipata joto baada ya kupandishwa, hana mimba.", "About every 21 days (sheep every 17). Heat after service means she is not in calf."),
  q("deworm", "livestock", "Mifugo hupewa dawa ya minyoo kila baada ya muda gani?", "How often are animals dewormed?",
    [["Kila wiki", "Every week"], ["Kila mwezi", "Every month"], ["Kila miezi 3", "Every 3 months"], ["Mara moja kwa mwaka", "Once a year"]], 2,
    "Kila miezi 3 ni kawaida; daktari wa mifugo anaweza kushauri tofauti.", "Every 3 months is the usual rule; your vet may advise differently."),
  q("ticks", "livestock", "Panapokuwa na hatari ya ugonjwa wa East Coast Fever, kupe hudhibitiwa mara ngapi?", "Where East Coast Fever is a risk, how often is tick control done?",
    [["Kila siku", "Daily"], ["Kila wiki", "Weekly"], ["Kila mwezi", "Monthly"], ["Kila msimu", "Each season"]], 1,
    "Kunyunyizia au kuogesha kila wiki; kupe hueneza East Coast Fever.", "Spray or dip weekly; ticks carry East Coast Fever."),
  q("colostrum", "livestock", "Ndama apewe maziwa ya kwanza (dang'a) ndani ya muda gani baada ya kuzaliwa?", "Within how long after birth should a calf get colostrum?",
    [["Saa 6", "6 hours"], ["Siku 1", "1 day"], ["Siku 3", "3 days"], ["Wiki 1", "1 week"]], 0,
    "Ndani ya saa 6: kinga ya dang'a hufyonzwa vizuri zaidi katika saa za kwanza.", "Within 6 hours: the antibodies in colostrum are absorbed best in the first hours."),
  q("cow-water", "livestock", "Ng'ombe anayekamuliwa anahitaji maji ya ziada kiasi gani kwa kila lita ya maziwa?", "How much extra water does a milking cow need for every litre of milk?",
    [["Lita 1", "1 litre"], ["Lita 4–5", "4–5 litres"], ["Lita 10", "10 litres"], ["Hakuna ya ziada", "No extra"]], 1,
    "Takriban lita 65 kwa siku pamoja na lita 4–5 kwa kila lita ya maziwa.", "About 65 L a day plus 4–5 L for every litre of milk."),
  q("dairy-meal", "livestock", "Dairy meal hupewa kwa kiasi gani?", "How much dairy meal does a cow get?",
    [["Kilo 1 kwa kila lita 2–3 za maziwa", "1 kg for every 2–3 L of milk"], ["Kilo 10 kwa siku", "10 kg a day"], ["Kilo 1 kwa wiki", "1 kg a week"], ["Hapewi, Napier inatosha", "None, Napier is enough"]], 0,
    "Kilo 1 kwa kila lita 2–3 za maziwa, pamoja na kilo 50–70 za Napier iliyokatwakatwa.", "1 kg for every 2–3 litres of milk, on top of 50–70 kg of chopped Napier."),
  q("napier", "livestock", "Ng'ombe mmoja wa maziwa anakula Napier mbichi kiasi gani kwa siku?", "How much fresh Napier does one dairy cow eat a day?",
    [["Kilo 5–10", "5–10 kg"], ["Kilo 20–30", "20–30 kg"], ["Kilo 50–70", "50–70 kg"], ["Kilo 150", "150 kg"]], 2,
    "Kilo 50–70 kwa siku, ikatwekatwe ili isipotee.", "50–70 kg a day, chopped so less is wasted."),
  q("ncd-day", "poultry", "Chanjo ya kwanza ya Newcastle hupewa vifaranga wakiwa na umri gani?", "At what age do chicks get their first Newcastle vaccine?",
    [["Siku 1", "Day 1"], ["Siku 7", "Day 7"], ["Wiki 6", "Week 6"], ["Wiki 18", "Week 18"]], 1,
    "Siku ya 7 (tone la jicho au maji), nyongeza siku ya 21, kisha kila miezi 3.", "Day 7 (eye drop or water), a booster at day 21, then every 3 months."),
  q("gumboro", "poultry", "Chanjo ya Gumboro hupewa lini?", "When is the Gumboro vaccine given?",
    [["Siku 1", "Day 1"], ["Siku 14", "Day 14"], ["Wiki 10", "Week 10"], ["Haipewi kuku wa kienyeji", "Not for kienyeji chickens"]], 1,
    "Siku ya 14 kwenye maji ya kunywa, nyongeza siku ya 28.", "Day 14 in the drinking water, with a booster at day 28."),
  q("hatch-days", "poultry", "Mayai ya kuku huanguliwa baada ya siku ngapi?", "Chicken eggs hatch after how many days?",
    [["Siku 14", "14 days"], ["Siku 21", "21 days"], ["Siku 28", "28 days"], ["Siku 35", "35 days"]], 1,
    "Siku 21; mulika mayai siku ya 7 na acha kuyageuza siku ya 18.", "21 days; candle at day 7 and stop turning at day 18."),
  q("incubator-temp", "poultry", "Mashine ya kutotoa (incubator) huwekwa joto gani?", "What temperature is an incubator kept at?",
    [["30 °C", "30 °C"], ["37.5 °C", "37.5 °C"], ["42 °C", "42 °C"], ["50 °C", "50 °C"]], 1,
    "37.5 °C; zaidi ya 40 °C huua kifaranga.", "37.5 °C; above 40 °C kills the chick."),
  q("tray", "poultry", "Trei moja ya mayai ina mayai mangapi?", "How many eggs are in one tray?",
    [["12", "12"], ["24", "24"], ["30", "30"], ["36", "36"]], 2,
    "Trei ya kawaida sokoni ina mayai 30.", "The standard market tray holds 30 eggs."),
  q("lay-start", "poultry", "Kuku wa mayai huanza kutaga wakiwa na umri gani?", "At what age do layers start laying?",
    [["Wiki 8", "8 weeks"], ["Wiki 12", "12 weeks"], ["Wiki 18–20", "18–20 weeks"], ["Wiki 30", "30 weeks"]], 2,
    "Kwa kawaida wiki 18–20; mwanga wa saa 14–16 kwa siku huwasaidia kutaga.", "Usually 18–20 weeks; 14–16 hours of light a day keeps them laying."),
  q("brooder", "poultry", "Kizimba cha vifaranga huwekwa joto gani wiki ya kwanza?", "How warm is the brooder in the first week?",
    [["25 °C", "25 °C"], ["30 °C", "30 °C"], ["35 °C", "35 °C"], ["40 °C", "40 °C"]], 2,
    "35 °C wiki ya 1, kisha punguza takriban 3 °C kila wiki. Wakijikusanya chini ya joto, ni baridi.", "35 °C in week 1, then about 3 °C less each week. Chicks huddled under the heat are cold."),
  q("hermetic", "store", "Nafaka kwenye mifuko isiyopitisha hewa hupoteza uzito kiasi gani kwa mwezi?", "How much weight does grain in hermetic bags lose a month?",
    [["Takriban 0.5%", "About 0.5%"], ["Takriban 5%", "About 5%"], ["Takriban 10%", "About 10%"], ["Hakuna", "None"]], 0,
    "Takriban 0.5% kwa mwezi, dhidi ya hadi 2.5% kwenye magunia ya kawaida (wadudu).", "About 0.5% a month, against up to 2.5% in ordinary bags (weevils)."),
  q("salt-test", "store", "Jaribio la chumvi kwenye chupa hukuambia nini kuhusu nafaka?", "The salt-in-a-bottle test tells you what about grain?",
    [["Bei yake", "Its price"], ["Kama imekauka vya kutosha kuhifadhi", "Whether it is dry enough to store"], ["Aina ya mbegu", "The variety"], ["Uzito wa gunia", "The bag's weight"]], 1,
    "Chumvi ikinata kwenye nafaka, unyevu uko juu ya 13%: kausha zaidi kabla ya kuhifadhi.", "If the salt sticks to the grain, moisture is above 13%: dry it more before storing."),
  q("aflatoxin", "store", "Mahindi yenye ukungu ni hatari kwa sababu gani?", "Why is mouldy maize dangerous?",
    [["Yana chumvi nyingi", "Too much salt"], ["Yanaweza kuwa na sumu ya aflatoxin", "It can carry aflatoxin"], ["Yanapoteza rangi tu", "It only loses colour"], ["Hayana hatari", "It is not dangerous"]], 1,
    "Ukungu unaweza kuleta aflatoxin, sumu inayoumiza ini. Ondoa punje zenye ukungu kabla ya kuhifadhi.", "Mould can carry aflatoxin, a poison that damages the liver. Sort out mouldy grain before storing."),
  q("maize-bag", "market", "Gunia la mahindi sokoni Kenya lina kilo ngapi?", "A bag of maize in Kenyan markets holds how many kilos?",
    [["Kilo 50", "50 kg"], ["Kilo 70", "70 kg"], ["Kilo 90", "90 kg"], ["Kilo 100", "100 kg"]], 2,
    "Kilo 90 kwa nafaka; viazi huuzwa kwa magunia ya kilo 50.", "90 kg for grain; potatoes trade in 50 kg bags."),
  q("potato-light", "store", "Kwa nini viazi vya kuhifadhi huwekwa gizani?", "Why are stored potatoes kept in the dark?",
    [["Mwanga huvigeuza kijani (sumu)", "Light turns them green (a poison)"], ["Giza huviongeza uzito", "Dark makes them heavier"], ["Panya hawapendi giza", "Rats dislike the dark"], ["Hakuna sababu", "No reason"]], 0,
    "Mwanga huvigeuza kijani na kuongeza solanine; hifadhi mahali penye giza, baridi na hewa.", "Light turns them green and raises solanine; keep them dark, cool and airy."),
  q("lime-ph", "soil", "Udongo unahitaji chokaa pH ikiwa chini ya kiasi gani?", "Soil needs lime when its pH is below what?",
    [["4.0", "4.0"], ["5.5", "5.5"], ["7.0", "7.0"], ["8.5", "8.5"]], 1,
    "Chini ya pH 5.5 alumini huwa sumu kwa mizizi na mbolea hupotea; mazao mengi hupenda pH 5.5–7.", "Below pH 5.5 aluminium poisons roots and fertiliser is wasted; most crops like pH 5.5–7."),
  q("potato-lime", "soil", "Zao gani huvumilia udongo wenye asidi na hupewa chokaa tu pH ikiwa chini ya 5.0?", "Which crop tolerates acid soil and is limed only below pH 5.0?",
    [["Mahindi", "Maize"], ["Maharagwe", "Beans"], ["Viazi", "Potatoes"], ["Kabichi", "Cabbage"]], 2,
    "Chokaa huongeza hatari ya upele (scab) kwenye viazi.", "Lime raises the risk of scab on potatoes."),
  q("kephis", "crops", "Unathibitisha vipi kwamba mbegu ni halali?", "How do you check that seed is genuine?",
    [["Kwa harufu", "By smell"], ["Kwangua lebo ya KEPHIS na utume nambari kwa SMS kwenda 1397", "Scratch the KEPHIS label and SMS the code to 1397"], ["Bei ya juu ni halali", "Expensive seed is genuine"], ["Rangi ya pakiti", "The packet's colour"]], 1,
    "Kila pakiti halali ina lebo ya KEPHIS ya kukwangua; SMS kwenda 1397 hujibu kama ni halali.", "Every genuine packet has a KEPHIS scratch label; an SMS to 1397 says whether it is real."),
  q("kiamis", "market", "Ili kupata mbolea ya ruzuku ya serikali, mkulima hujisajili wapi?", "To get government-subsidised fertiliser, where does a farmer register?",
    [["Sokoni", "At the market"], ["KIAMIS, ofisi ya kilimo ya wadi", "KIAMIS, at the ward agriculture office"], ["Kwa chifu", "With the chief"], ["Hakuna usajili", "No registration"]], 1,
    "Usajili wa KIAMIS ni bure; kisha ununue kwa e-voucher kwenye bohari za NCPB.", "KIAMIS registration is free; then buy with the e-voucher at NCPB depots."),
  q("push-pull", "pests", "Katika push-pull, mmea gani hupandwa katikati ya mistari ya mahindi?", "In push-pull, which plant goes between the maize rows?",
    [["Napier", "Napier"], ["Desmodium", "Desmodium"], ["Maharagwe", "Beans"], ["Brachiaria", "Brachiaria"]], 1,
    "Desmodium hufukuza nondo (sukuma) na kuzuia kiduha; Napier au Brachiaria kuzunguka huwavuta.", "Desmodium drives the moths away (push) and stops striga; Napier or Brachiaria round the edge draws them (pull)."),
  q("striga", "pests", "Gugu gani la mahindi huzuiwa na desmodium?", "Which maize weed does desmodium suppress?",
    [["Kiduha (striga)", "Striga (witchweed)"], ["Mchicha", "Amaranth"], ["Sangare", "Couch grass"], ["Gugu karoti", "Mexican marigold"]], 0,
    "Desmodium huzuia mizizi ya kiduha kushika na huifanya iote na kufa.", "Desmodium stops striga attaching to roots and makes it germinate and die."),
  q("masika", "weather", "Mvua ndefu (masika) Kenya huja miezi gani?", "Kenya's long rains (masika) fall in which months?",
    [["Januari–Februari", "January–February"], ["Machi–Mei", "March–May"], ["Juni–Septemba", "June–September"], ["Oktoba–Desemba", "October–December"]], 1,
    "Masika: Machi–Mei; vuli (mvua fupi): Oktoba–Desemba.", "Masika: March–May; the short rains (vuli): October–December."),
  q("spray-day", "weather", "Siku nzuri ya kunyunyizia dawa ni ipi?", "Which is a good day to spray?",
    [["Upepo mkali", "A windy day"], ["Mvua inatarajiwa", "Rain expected"], ["Upepo chini ya km/h 15 na hakuna mvua", "Wind under 15 km/h and no rain"], ["Jua kali adhuhuri", "Hot midday sun"]], 2,
    "Upepo mdogo na hakuna mvua kwa saa kadhaa; asubuhi mapema au jioni.", "Little wind and no rain for a few hours; early morning or evening."),
  q("tuta", "pests", "Tuta absoluta ni mdudu wa zao gani?", "Tuta absoluta attacks which crop?",
    [["Mahindi", "Maize"], ["Nyanya", "Tomatoes"], ["Viazi", "Potatoes"], ["Kabichi", "Cabbage"]], 1,
    "Nondo mdogo anayechimba majani ya nyanya na kutoboa matunda.", "A small moth whose larvae mine tomato leaves and bore into the fruit."),
  q("blight", "pests", "Baridi (late blight) ya viazi na nyanya hupenda hali gani ya hewa?", "Late blight of potatoes and tomatoes thrives in what weather?",
    [["Joto na kavu", "Hot and dry"], ["Baridi na unyevu", "Cool and wet"], ["Upepo mkali", "Windy"], ["Jua kali", "Full sun"]], 1,
    "Hali ya baridi na mvua; kinga kabla ya mvua kubwa.", "Cool, wet weather; protect before heavy rain."),
  q("store-check", "store", "Magunia ya kawaida ya nafaka ghalani hukaguliwa kila baada ya muda gani?", "How often are ordinary grain bags in store checked?",
    [["Kila siku", "Daily"], ["Kila wiki 2", "Every 2 weeks"], ["Kila miezi 3", "Every 3 months"], ["Mwisho wa msimu", "At the end of the season"]], 1,
    "Kila wiki 2 (kila mwezi mifuko isiyopitisha hewa; kila wiki viazi): wadudu, harufu, unyevu.", "Every 2 weeks (monthly for hermetic bags, weekly for potatoes): weevils, smell, damp."),
  q("hold", "market", "Bei ya mahindi Kenya kwa kawaida huwa juu zaidi lini?", "When are Kenyan maize prices usually highest?",
    [["Mara baada ya mavuno", "Right after harvest"], ["Miezi ya njaa kabla ya mavuno (Mei–Juni)", "The lean months before harvest (May–June)"], ["Desemba", "December"], ["Hazibadiliki", "They never change"]], 1,
    "Chini mara baada ya mavuno, juu katika miezi ya njaa; ndiyo maana kuhifadhi kunaweza kulipa.", "Lowest right after harvest, highest in the lean months; that is why storing can pay."),
];

/* ── the day's draw ── */
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** A small seeded random (mulberry32), so the same day draws the same questions on every phone. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededShuffle<T>(list: T[], seed: string): T[] {
  const out = [...list];
  const r = rng(seedOf(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const PER_DAY = 5;
export type Answered = Record<string, { ok: boolean; date: string }>;

/** Five questions for the day: unanswered ones first, then the oldest answered, in a day-seeded order. */
export function pickDaily(day: string, answered: Answered, bank: Trivia[] = BANK, n = PER_DAY): string[] {
  const fresh = seededShuffle(bank.filter((t) => !answered[t.id]), day);
  const seen = seededShuffle(bank.filter((t) => answered[t.id]), day).sort((a, b) => answered[a.id].date.localeCompare(answered[b.id].date));
  return [...fresh, ...seen].slice(0, n).map((t) => t.id);
}

export const byId = (id: string, bank: Trivia[] = BANK) => bank.find((t) => t.id === id) ?? null;

/* ── score and streak ── */
export type QuizState = {
  v: 1;
  answered: Answered;
  day: { date: string; ids: string[] } | null;
  /** Days in a row with at least one answer. */
  streak: number;
  lastDay: string | null;
  /** Right answers all time. */
  right: number;
  total: number;
};
export const EMPTY_QUIZ: QuizState = { v: 1, answered: {}, day: null, streak: 0, lastDay: null, right: 0, total: 0 };
const MAX_ANSWERED = 400;

/** The state with today's draw in place (a new day gets a new draw; the same day keeps its five). */
export function withDay(s: QuizState, today: string): QuizState {
  if (s.day?.date === today && s.day.ids.length) return s;
  return { ...s, day: { date: today, ids: pickDaily(today, s.answered) } };
}

/** Records an answer: the question is marked, the streak and totals move. Answering twice changes nothing. */
export function answer(s: QuizState, id: string, ok: boolean, today: string): QuizState {
  const st = withDay(s, today);
  if (st.answered[id]?.date === today) return st;
  const streak = st.lastDay === today ? st.streak : st.lastDay === addDays(today, -1) ? st.streak + 1 : 1;
  const entries = Object.entries({ ...st.answered, [id]: { ok, date: today } });
  const answered = Object.fromEntries(entries.slice(-MAX_ANSWERED)) as Answered;
  return { ...st, answered, streak, lastDay: today, right: st.right + (ok ? 1 : 0), total: st.total + 1 };
}

/** Today's progress: answered and right out of the day's five. */
export function todayScore(s: QuizState, today: string): { done: number; right: number; of: number } {
  const ids = s.day?.date === today ? s.day.ids : [];
  const hits = ids.map((id) => s.answered[id]).filter((a) => a?.date === today);
  return { done: hits.length, right: hits.filter((a) => a.ok).length, of: ids.length || PER_DAY };
}

/** A streak only counts if yesterday or today had an answer. */
export const liveStreak = (s: QuizState, today: string) =>
  s.lastDay === today || s.lastDay === addDays(today, -1) ? s.streak : 0;
