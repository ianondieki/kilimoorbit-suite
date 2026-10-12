/**
 * "Imani ya leo" (today's belief): one Kiswahili proverb a day on the Today
 * screen, with its meaning and a line on what it says to a farmer today.
 * Deterministic by date, so everyone in a group sees the same one and a
 * refresh never changes it. The proverbs are common Kiswahili methali; the
 * farm readings are KilimoOrbit's own. NOTE: the Kiswahili should be reviewed
 * by a native Kenyan speaker before release, like the rest of the copy.
 */
import type { Lang } from "./i18n";

export type Proverb = {
  id: string;
  /** The proverb itself, in Kiswahili (shown in both languages). */
  sw: string;
  /** Its plain meaning. */
  meaning: Record<Lang, string>;
  /** What it says on the farm today. */
  farm: Record<Lang, string>;
};

export const PROVERBS: Proverb[] = [
  { id: "jembe", sw: "Jembe halimtupi mtu.",
    meaning: { sw: "Anayelima hakosi riziki.", en: "The hoe never abandons a person: the land feeds those who work it." },
    farm: { sw: "Kazi ya leo shambani ndiyo chakula cha kesho.", en: "Today's work in the field is tomorrow's food." } },
  { id: "mvumilivu", sw: "Mvumilivu hula mbivu.",
    meaning: { sw: "Subira huleta matunda yaliyoiva.", en: "The patient one eats ripe fruit." },
    farm: { sw: "Usivune mapema; mazao yaliyokomaa huuzwa kwa bei nzuri.", en: "Don't harvest early; a crop that has matured fetches a better price." } },
  { id: "haraka", sw: "Haraka haraka haina baraka.",
    meaning: { sw: "Kufanya mambo kwa pupa hakuleti mafanikio.", en: "Hurry, hurry has no blessing." },
    farm: { sw: "Soma lebo ya dawa, pima udongo, kisha panda.", en: "Read the label, test the soil, then plant." } },
  { id: "mchumia", sw: "Mchumia juani hulia kivulini.",
    meaning: { sw: "Anayefanya kazi kwa bidii hufurahia matunda yake.", en: "One who earns in the sun eats in the shade." },
    farm: { sw: "Jasho la msimu huu ni ghala lililojaa msimu ujao.", en: "This season's sweat is next season's full store." } },
  { id: "subira", sw: "Subira huvuta heri.",
    meaning: { sw: "Uvumilivu huleta mema.", en: "Patience draws good fortune." },
    farm: { sw: "Hifadhi nafaka vizuri; bei hupanda baada ya mavuno.", en: "Store your grain well; prices rise after the harvest." } },
  { id: "kidole", sw: "Kidole kimoja hakivunji chawa.",
    meaning: { sw: "Kazi nzito huhitaji ushirikiano.", en: "One finger cannot crush a louse: big jobs need many hands." },
    farm: { sw: "Jiunge na kikundi au chama: pembejeo kwa pamoja ni rahisi.", en: "Join a group or a co-op: inputs bought together cost less." } },
  { id: "dalili", sw: "Dalili ya mvua ni mawingu.",
    meaning: { sw: "Jambo kubwa hutangulizwa na ishara.", en: "Clouds are the sign of rain: read the signs before the event." },
    farm: { sw: "Angalia utabiri na kagua mimea kabla ya shida kuwa kubwa.", en: "Check the forecast and scout your crop before a problem grows." } },
  { id: "bandu", sw: "Bandu bandu humaliza gogo.",
    meaning: { sw: "Kidogo kidogo hujaza kibaba.", en: "Chip by chip finishes the log." },
    farm: { sw: "Tiki kazi moja kila siku; shamba hustawi kwa kazi ndogo nyingi.", en: "Tick one task a day; a farm thrives on many small jobs done on time." } },
  { id: "akiba", sw: "Akiba haiozi.",
    meaning: { sw: "Kuweka akiba hakupotezi.", en: "Savings do not rot." },
    farm: { sw: "Andika kila mauzo na gharama; rekodi ndiyo akiba ya mkulima.", en: "Record every sale and cost; records are a farmer's savings." } },
  { id: "ufa", sw: "Usipoziba ufa utajenga ukuta.",
    meaning: { sw: "Rekebisha tatizo dogo kabla halijawa kubwa.", en: "If you don't seal the crack, you will build a wall." },
    farm: { sw: "Viwavi wachache leo ni shamba zima wiki ijayo: chukua hatua mapema.", en: "A few armyworms today are a whole field next week: act early." } },
  { id: "penye", sw: "Penye nia, pana njia.",
    meaning: { sw: "Ukiwa na dhamira, utapata njia.", en: "Where there is a will, there is a way." },
    farm: { sw: "Hata shamba dogo likitunzwa vizuri hulisha familia.", en: "Even a small plot, well tended, feeds a family." } },
  { id: "ndege", sw: "Kila ndege huruka na mbawa zake.",
    meaning: { sw: "Kila mtu hutegemea uwezo wake mwenyewe.", en: "Every bird flies with its own wings." },
    farm: { sw: "Panga bajeti ya zao lako kwa bei zako mwenyewe.", en: "Budget your crop at your own prices, not someone else's." } },
  { id: "chema", sw: "Chema chajiuza, kibaya chajitembeza.",
    meaning: { sw: "Kitu bora hakihitaji kusifiwa.", en: "A good thing sells itself; a bad one has to be hawked." },
    farm: { sw: "Panga, kausha na weka daraja mazao yako: ubora huuzwa haraka.", en: "Sort, dry and grade your produce: quality sells itself." } },
  { id: "mgaagaa", sw: "Mgaagaa na upwa hali wali mkavu.",
    meaning: { sw: "Anayejitahidi hupata zaidi.", en: "One who keeps searching the shore does not eat dry rice." },
    farm: { sw: "Linganisha masoko kabla ya kuuza; soko bora ni hatua chache tu.", en: "Compare the markets before you sell; the best price is a few taps away." } },
  { id: "maji", sw: "Maji yakimwagika hayazoleki.",
    meaning: { sw: "Jambo lililopita halirudi.", en: "Spilt water cannot be gathered up." },
    farm: { sw: "Nyunyizia dawa siku isiyo na mvua; dawa iliyooshwa imepotea.", en: "Spray on a day without rain; a washed-off spray is money gone." } },
  { id: "kuteleza", sw: "Kuteleza si kuanguka.",
    meaning: { sw: "Kosa dogo si mwisho wa safari.", en: "To slip is not to fall." },
    farm: { sw: "Msimu mbaya hufundisha; andika ulichojifunza kwa msimu ujao.", en: "A bad season teaches; write down what you learned for the next one." } },
  { id: "mtaka", sw: "Mtaka cha mvunguni sharti ainame.",
    meaning: { sw: "Unachotaka hupatikana kwa juhudi.", en: "One who wants what is under the bed must bend down for it." },
    farm: { sw: "Kagua mimea kwa karibu: wadudu hujificha chini ya majani.", en: "Look closely at your plants: pests hide under the leaves." } },
  { id: "mkono", sw: "Mkono mtupu haulambwi.",
    meaning: { sw: "Bila kitu mkononi hupati msaada.", en: "An empty hand is not licked: bring something to the table." },
    farm: { sw: "Ripoti ya rekodi zako hufungua mlango wa mkopo na mnunuzi mzuri.", en: "A report of your records opens the door to credit and a good buyer." } },
];

/** The day's proverb: the same for everyone on the same date. */
export function proverbFor(dateKey: string): Proverb {
  // Day of the year from the key, so the list cycles through the month.
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const day = Math.round((Date.UTC(y, m - 1, d) - start) / 86400_000);
  return PROVERBS[((day + y) % PROVERBS.length + PROVERBS.length) % PROVERBS.length];
}
