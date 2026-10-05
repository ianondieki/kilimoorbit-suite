/**
 * Crop doctor ("Daktari wa mimea"): a symptom checker for the pests and
 * diseases Kenyan smallholders meet most often. Fully offline.
 *
 * Advice follows integrated pest management: look first, act by hand and by
 * good practice, spray only when needed, and always by the label. We name no
 * brands and give no doses: the label and the agro-vet do that.
 *
 * NOTE: Kiswahili must be reviewed by a native Kenyan speaker, and the content
 * by an extension agronomist, before release.
 */
import type { CropKey, L } from "./agronomy";
import type { SeasonKey } from "./season";

export type Part = "leaf" | "stem" | "fruit";

export type Symptom = { id: string; part: Part; label: L };

export const SYMPTOMS: Symptom[] = [
  { id: "holes", part: "leaf", label: { en: "Holes or ragged, chewed leaves", sw: "Matundu au majani yaliyotafunwa" } },
  { id: "frass", part: "leaf", label: { en: "Sawdust-like droppings in the funnel", sw: "Kinyesi kama machujo katikati ya mmea" } },
  { id: "windows", part: "leaf", label: { en: "See-through patches on leaves", sw: "Madoa ya uwazi kwenye majani" } },
  { id: "mines", part: "leaf", label: { en: "Pale tunnels or blotches inside leaves", sw: "Njia au madoa meupe ndani ya jani" } },
  { id: "caterpillars", part: "leaf", label: { en: "Small green caterpillars that wriggle", sw: "Viwavi wadogo wa kijani wanaojirusha" } },
  { id: "curled", part: "leaf", label: { en: "Curled, sticky leaves with tiny insects", sw: "Majani yaliyojikunja, yenye unata na wadudu wadogo" } },
  { id: "yellowEdges", part: "leaf", label: { en: "Leaves yellow and dry from the edges", sw: "Majani yanakauka kuanzia kingoni" } },
  { id: "streaks", part: "leaf", label: { en: "Yellow streaks along the veins", sw: "Mistari ya manjano kando ya mishipa" } },
  { id: "mottled", part: "leaf", label: { en: "Mottled light and dark green leaves", sw: "Majani yenye madoa ya kijani-kibichi na hafifu" } },
  { id: "darkPatches", part: "leaf", label: { en: "Large dark, water-soaked patches", sw: "Madoa makubwa meusi kama yaliyoloweshwa" } },
  { id: "whiteMould", part: "leaf", label: { en: "White fuzz under leaves in wet weather", sw: "Ukungu mweupe chini ya jani wakati wa mvua" } },
  { id: "rings", part: "leaf", label: { en: "Brown spots with rings, on lower leaves", sw: "Madoa ya kahawia yenye pete, majani ya chini" } },
  { id: "rust", part: "leaf", label: { en: "Rusty brown powdery spots", sw: "Madoa ya kutu yenye unga wa kahawia" } },
  { id: "angular", part: "leaf", label: { en: "Angular grey-brown spots between veins", sw: "Madoa ya pembe ya kijivu kati ya mishipa" } },
  { id: "vShape", part: "leaf", label: { en: "Yellow V-shapes from the edge, black veins", sw: "Madoa ya manjano umbo la V kutoka kingoni, mishipa myeusi" } },
  { id: "deadHeart", part: "stem", label: { en: "Centre shoot has dried out", sw: "Kichipukizi cha katikati kimekauka" } },
  { id: "wiltWet", part: "stem", label: { en: "Wilts suddenly though the soil is moist", sw: "Unanyauka ghafla ingawa udongo una unyevu" } },
  { id: "brownInside", part: "stem", label: { en: "Brown streaks inside the cut stem", sw: "Mistari ya kahawia ndani ya shina lililokatwa" } },
  { id: "swollenBase", part: "stem", label: { en: "Swollen or cracked stem at soil level", sw: "Shina limevimba au kupasuka usawa wa udongo" } },
  { id: "seedlingsDie", part: "stem", label: { en: "Young seedlings yellow, wilt and die", sw: "Miche michanga inageuka manjano na kufa" } },
  { id: "stunted", part: "stem", label: { en: "Plants stunted", sw: "Mimea imedumaa" } },
  { id: "fruitHoles", part: "fruit", label: { en: "Holes in fruit", sw: "Matundu kwenye matunda" } },
  { id: "fruitRot", part: "fruit", label: { en: "Firm brown patches on fruit", sw: "Madoa magumu ya kahawia kwenye tunda" } },
  { id: "blackBottom", part: "fruit", label: { en: "Dark sunken patch at the bottom of fruit", sw: "Doa jeusi lililobonyea chini ya tunda" } },
  { id: "podSpots", part: "fruit", label: { en: "Dark sunken spots on pods", sw: "Madoa meusi yaliyobonyea kwenye maganda" } },
  { id: "cobDamage", part: "fruit", label: { en: "Caterpillars eating the cob", sw: "Viwavi wanakula gunzi" } },
  { id: "tuberTunnels", part: "fruit", label: { en: "Tunnels in tubers", sw: "Njia ndani ya viazi" } },
];

const SYM = new Map(SYMPTOMS.map((s) => [s.id, s]));
export const symptom = (id: string) => SYM.get(id);

export type Problem = {
  id: string;
  kind: "pest" | "disease" | "disorder";
  crops: CropKey[];
  name: L;
  latin?: string;
  /** Everything it can cause, and the giveaways among them. */
  symptoms: string[];
  key: string[];
  /** Seasons when it is most common (weather it favours), for the "common now" flag. */
  seasons: SeasonKey[];
  look: L;
  act: L[];
  prevent: L[];
};

export const PROBLEMS: Problem[] = [
  {
    id: "faw", kind: "pest", crops: ["maize"],
    name: { en: "Fall armyworm", sw: "Viwavijeshi vamizi" }, latin: "Spodoptera frugiperda",
    symptoms: ["holes", "frass", "windows", "cobDamage"], key: ["frass", "windows"], seasons: ["masika", "vuli"],
    look: { en: "Caterpillars with a pale upside-down Y on the head, feeding deep in the funnel.", sw: "Viwavi wenye alama ya Y iliyopinduka kichwani, wakila ndani ya kikonyo." },
    act: [
      { en: "Scout every week with a W-walk: 5 stops, 10 plants each (Scout, at the top of this screen).", sw: "Kagua kila wiki kwa kutembea kwa umbo la W: vituo 5, mimea 10 kila kimoja (Kagua, juu ya skrini hii)." },
      { en: "Crush egg masses and young caterpillars by hand.", sw: "Ponda mayai na viwavi wachanga kwa mkono." },
      { en: "If 1 plant in 5 is damaged while the maize is under 3 weeks old (2 in 5 after that), put an approved bio-pesticide or insecticide into the funnel, early morning or evening.", sw: "Iwapo mmea 1 kati ya 5 umeharibiwa mahindi yakiwa chini ya wiki 3 (2 kati ya 5 baada ya hapo), weka dawa iliyoidhinishwa ndani ya kikonyo asubuhi na mapema au jioni." },
    ],
    prevent: [
      { en: "Plant early, with the first rains.", sw: "Panda mapema, mvua za kwanza zikinyesha." },
      { en: "Try push-pull: desmodium between rows, Napier or brachiaria around the field.", sw: "Jaribu sukuma-vuta: desmodium kati ya mistari, nyasi ya Napier au brachiaria kuzunguka shamba." },
      { en: "Rotate maize with beans or other legumes.", sw: "Badilisha mahindi na maharagwe au jamii ya kunde." },
    ],
  },
  {
    id: "mln", kind: "disease", crops: ["maize"],
    name: { en: "Maize lethal necrosis (MLN)", sw: "Ugonjwa hatari wa mahindi (MLN)" },
    symptoms: ["yellowEdges", "mottled", "deadHeart", "stunted"], key: ["yellowEdges", "deadHeart"], seasons: ["masika", "vuli"],
    look: { en: "Leaves dry from the edges inward; the centre shoot dies; cobs are small or empty.", sw: "Majani yanakauka kutoka kingoni; kichipukizi cha katikati kinakufa; magunzi madogo au matupu." },
    act: [
      { en: "Uproot infected plants and destroy them away from the field.", sw: "Ng'oa mimea iliyoathirika na iharibu mbali na shamba." },
      { en: "Control the thrips and aphids that spread it.", sw: "Dhibiti vithiripi na vidukari wanaoueneza." },
      { en: "Next season, plant beans or another non-cereal in that field.", sw: "Msimu ujao, panda maharagwe au zao lisilo la nafaka shambani humo." },
    ],
    prevent: [
      { en: "Use certified MLN-tolerant seed; never replant your own maize seed.", sw: "Tumia mbegu zilizothibitishwa zinazostahimili MLN; usipande tena mbegu zako za mahindi." },
      { en: "Don't grow maize after maize all year round.", sw: "Usipande mahindi baada ya mahindi mwaka mzima." },
    ],
  },
  {
    id: "msv", kind: "disease", crops: ["maize"],
    name: { en: "Maize streak virus", sw: "Ugonjwa wa michirizi ya mahindi" },
    symptoms: ["streaks", "stunted"], key: ["streaks"], seasons: ["masika", "vuli"],
    look: { en: "Narrow, broken yellow streaks along the veins; young plants are hit hardest.", sw: "Mistari myembamba ya manjano kando ya mishipa; mimea michanga huathirika zaidi." },
    act: [
      { en: "Pull out badly streaked young plants.", sw: "Ng'oa mimea michanga iliyoathirika vibaya." },
      { en: "Slash grassy weeds around the field, where leafhoppers live.", sw: "Fyeka nyasi kuzunguka shamba, wanapoishi wadudu wanaoueneza (leafhoppers)." },
    ],
    prevent: [
      { en: "Plant streak-resistant varieties.", sw: "Panda aina zinazostahimili michirizi." },
      { en: "Avoid planting late beside older maize.", sw: "Epuka kupanda kuchelewa karibu na mahindi makubwa." },
    ],
  },
  {
    id: "beanfly", kind: "pest", crops: ["beans"],
    name: { en: "Bean fly (bean stem maggot)", sw: "Inzi wa maharagwe" }, latin: "Ophiomyia spp.",
    symptoms: ["seedlingsDie", "swollenBase", "stunted"], key: ["swollenBase"], seasons: ["masika", "vuli"],
    look: { en: "Seedlings yellow and wilt; the stem is swollen and cracked just above the soil.", sw: "Miche inageuka manjano na kunyauka; shina limevimba na kupasuka juu ya udongo." },
    act: [
      { en: "Pull and destroy dying seedlings.", sw: "Ng'oa na uharibu miche inayokufa." },
      { en: "Heap soil around the stems so new roots can form.", sw: "Pandisha udongo kuzunguka mashina ili mizizi mipya iote." },
    ],
    prevent: [
      { en: "Plant early with the rains, into soil with manure.", sw: "Panda mapema na mvua, kwenye udongo wenye samadi." },
      { en: "Use seed treated with an approved product.", sw: "Tumia mbegu zilizotibiwa kwa dawa iliyoidhinishwa." },
    ],
  },
  {
    id: "aphids", kind: "pest", crops: ["beans", "cabbage", "kale", "potatoes"],
    name: { en: "Aphids", sw: "Vidukari" },
    symptoms: ["curled", "stunted", "mottled"], key: ["curled"], seasons: ["kiangazi", "kipupwe"],
    look: { en: "Clusters of tiny green, black or grey insects on shoots and leaf undersides.", sw: "Vikundi vya wadudu wadogo wa kijani, weusi au kijivu kwenye vichipukizi na chini ya majani." },
    act: [
      { en: "Wash clusters off with a strong jet of water.", sw: "Ondoa vikundi kwa kunyunyizia maji kwa nguvu." },
      { en: "If they keep spreading, use an approved insecticide that spares ladybirds.", sw: "Wakiendelea kuenea, tumia dawa iliyoidhinishwa isiyoua wadudu rafiki kama ladybird." },
    ],
    prevent: [
      { en: "Remove weeds that shelter aphids.", sw: "Ondoa magugu yanayohifadhi vidukari." },
      { en: "Avoid too much CAN: soft growth attracts them.", sw: "Epuka CAN nyingi: ukuaji laini huwavutia." },
    ],
  },
  {
    id: "rust", kind: "disease", crops: ["beans"],
    name: { en: "Bean rust", sw: "Kutu ya maharagwe" },
    symptoms: ["rust"], key: ["rust"], seasons: ["masika", "vuli"],
    look: { en: "Small rusty pustules that rub off like powder, mostly on leaf undersides.", sw: "Vipele vidogo vya kutu vinavyotoka kama unga, hasa chini ya majani." },
    act: [
      { en: "Remove badly infected leaves.", sw: "Ondoa majani yaliyoathirika vibaya." },
      { en: "If it spreads before flowering ends, apply an approved fungicide.", sw: "Ukienea kabla maua kwisha, tumia dawa ya kuvu iliyoidhinishwa." },
    ],
    prevent: [
      { en: "Plant resistant varieties.", sw: "Panda aina zinazostahimili." },
      { en: "Bury or burn old bean trash after harvest.", sw: "Fukia au choma mabaki ya maharagwe baada ya kuvuna." },
    ],
  },
  {
    id: "beanspots", kind: "disease", crops: ["beans"],
    name: { en: "Angular leaf spot and anthracnose", sw: "Madoa ya pembe na anthracnose" },
    symptoms: ["angular", "podSpots"], key: ["angular", "podSpots"], seasons: ["masika", "vuli"],
    look: { en: "Angular spots boxed in by veins; dark sunken spots on pods and seed.", sw: "Madoa ya pembe yaliyozungukwa na mishipa; madoa meusi yaliyobonyea kwenye maganda na mbegu." },
    act: [
      { en: "Don't walk or weed among wet plants: it spreads the disease.", sw: "Usitembee wala kupalilia mimea ikiwa na unyevu: huueneza ugonjwa." },
      { en: "Remove and destroy badly infected plants.", sw: "Ng'oa na uharibu mimea iliyoathirika vibaya." },
    ],
    prevent: [
      { en: "Use clean, certified seed: both diseases travel on seed.", sw: "Tumia mbegu safi zilizothibitishwa: magonjwa haya husafiri kwenye mbegu." },
      { en: "Rotate with maize or other cereals for two seasons.", sw: "Badilisha na mahindi au nafaka nyingine kwa misimu miwili." },
    ],
  },
  {
    id: "tuta", kind: "pest", crops: ["tomato"],
    name: { en: "Tomato leafminer (Tuta absoluta)", sw: "Funza wa nyanya (Tuta absoluta)" },
    symptoms: ["mines", "fruitHoles", "windows"], key: ["mines"], seasons: ["kiangazi", "kipupwe"],
    look: { en: "Pale blotches inside leaves with a small caterpillar; pinholes in fruit.", sw: "Madoa meupe ndani ya majani yenye kiwavi mdogo; vitundu vidogo kwenye matunda." },
    act: [
      { en: "Pick off mined leaves and holed fruit; bury or burn them.", sw: "Chuma majani yenye njia na matunda yenye matundu; yafukie au uyachome." },
      { en: "Hang Tuta pheromone traps to catch the moths.", sw: "Tundika mitego ya feromoni ya Tuta kunasa nondo." },
      { en: "If needed, spray an approved product, changing product groups each time.", sw: "Ikihitajika, nyunyizia dawa iliyoidhinishwa, ukibadilisha aina ya dawa kila mara." },
    ],
    prevent: [
      { en: "Raise seedlings in a screened nursery.", sw: "Kuza miche kwenye kitalu chenye neti." },
      { en: "Rotate away from tomato, potato and eggplant; clear old crops at once.", sw: "Badilisha mbali na nyanya, viazi na biringanya; ondoa mazao ya zamani mara moja." },
    ],
  },
  {
    id: "lateblight", kind: "disease", crops: ["tomato", "potatoes"],
    name: { en: "Late blight", sw: "Baridi (late blight)" }, latin: "Phytophthora infestans",
    symptoms: ["darkPatches", "whiteMould", "fruitRot"], key: ["whiteMould", "darkPatches"], seasons: ["masika", "vuli", "kipupwe"],
    look: { en: "Dark water-soaked patches that spread fast in cool, wet weather, with white fuzz beneath.", sw: "Madoa meusi kama yaliyoloweshwa yanayoenea haraka hali ya baridi na mvua, na ukungu mweupe chini." },
    act: [
      { en: "Remove and destroy infected leaves and plants.", sw: "Ondoa na uharibu majani na mimea iliyoathirika." },
      { en: "Spray an approved protective fungicide before rain; a systemic one if it is spreading. Follow the label.", sw: "Nyunyizia dawa ya kinga ya kuvu kabla ya mvua; ya kupenya ikiwa unaenea. Fuata maelekezo ya lebo." },
      { en: "Water at the base in the morning, never over the leaves.", sw: "Mwagilia shinani asubuhi, kamwe si juu ya majani." },
    ],
    prevent: [
      { en: "Stake and prune for airflow.", sw: "Weka miti na pogoa ili hewa ipite." },
      { en: "Don't plant tomatoes next to potatoes.", sw: "Usipande nyanya karibu na viazi." },
      { en: "Rotate for three seasons; use tolerant varieties.", sw: "Badilisha mazao kwa misimu mitatu; tumia aina zinazostahimili." },
    ],
  },
  {
    id: "wilt", kind: "disease", crops: ["tomato", "potatoes"],
    name: { en: "Bacterial wilt", sw: "Mnyauko bakteria" }, latin: "Ralstonia solanacearum",
    symptoms: ["wiltWet", "brownInside", "stunted"], key: ["wiltWet", "brownInside"], seasons: ["kiangazi", "masika"],
    look: { en: "Green plants wilt in the heat of the day though the soil is moist. Test: a cut stem in clear water streams milky threads.", sw: "Mimea mibichi inanyauka mchana ingawa udongo una unyevu. Jaribio: shina lililokatwa ndani ya maji safi hutoa nyuzi kama maziwa." },
    act: [
      { en: "Uproot wilted plants with the soil around the roots; destroy them away from the field.", sw: "Ng'oa mimea iliyonyauka pamoja na udongo wa mizizi; iharibu mbali na shamba." },
      { en: "Don't move soil or run-off water from infected patches.", sw: "Usihamishe udongo wala maji yanayotiririka kutoka sehemu zilizoathirika." },
    ],
    prevent: [
      { en: "No spray cures it. Rotate with maize, beans or grass for three or more seasons.", sw: "Hakuna dawa inayoutibu. Badilisha na mahindi, maharagwe au nyasi kwa misimu mitatu au zaidi." },
      { en: "Use certified clean seed potatoes or grafted tomato seedlings.", sw: "Tumia mbegu safi za viazi zilizothibitishwa au miche ya nyanya iliyopandikizwa." },
    ],
  },
  {
    id: "earlyblight", kind: "disease", crops: ["tomato", "potatoes"],
    name: { en: "Early blight", sw: "Madoa ya pete (early blight)" }, latin: "Alternaria solani",
    symptoms: ["rings", "fruitRot"], key: ["rings"], seasons: ["masika", "vuli"],
    look: { en: "Brown spots with target-like rings, starting on the oldest leaves.", sw: "Madoa ya kahawia yenye pete kama shabaha, kuanzia majani ya zamani zaidi." },
    act: [
      { en: "Remove the lower infected leaves.", sw: "Ondoa majani ya chini yaliyoathirika." },
      { en: "Mulch so rain doesn't splash soil onto leaves.", sw: "Weka matandazo ili mvua isirushe udongo kwenye majani." },
      { en: "If it keeps spreading, apply an approved fungicide.", sw: "Ukiendelea kuenea, tumia dawa ya kuvu iliyoidhinishwa." },
    ],
    prevent: [
      { en: "Rotate crops and feed plants well: weak plants suffer most.", sw: "Badilisha mazao na lisha mimea vizuri: mimea dhaifu huathirika zaidi." },
    ],
  },
  {
    id: "ber", kind: "disorder", crops: ["tomato"],
    name: { en: "Blossom-end rot", sw: "Kuoza kwa kitako cha tunda" },
    symptoms: ["blackBottom"], key: ["blackBottom"], seasons: ["kiangazi"],
    look: { en: "A dark, leathery, sunken patch at the bottom of the fruit. Not a disease: the fruit lacks calcium.", sw: "Doa jeusi lililobonyea chini ya tunda. Si ugonjwa: tunda limekosa kalsiamu." },
    act: [
      { en: "Water evenly: don't let the soil dry out and then flood it.", sw: "Mwagilia kwa usawa: usiache udongo ukauke kisha uufurike." },
      { en: "Mulch to keep moisture steady.", sw: "Weka matandazo kuhifadhi unyevu." },
      { en: "Ease off CAN while fruit is setting.", sw: "Punguza CAN wakati matunda yanaanza." },
    ],
    prevent: [
      { en: "Test the soil; lime acid soils before planting.", sw: "Pima udongo; weka chokaa kwenye udongo wenye asidi kabla ya kupanda." },
    ],
  },
  {
    id: "tubermoth", kind: "pest", crops: ["potatoes"],
    name: { en: "Potato tuber moth", sw: "Nondo wa viazi" }, latin: "Phthorimaea operculella",
    symptoms: ["tuberTunnels", "mines"], key: ["tuberTunnels"], seasons: ["kiangazi", "kipupwe"],
    look: { en: "Tunnels in tubers, often with droppings at the eye; leaf mines in the field.", sw: "Njia ndani ya viazi, mara nyingi na kinyesi kwenye jicho; njia ndani ya majani shambani." },
    act: [
      { en: "Earth up well so no tubers are exposed.", sw: "Pandisha udongo vizuri ili viazi visionekane." },
      { en: "Harvest promptly; don't leave tubers lying in the field.", sw: "Vuna mapema; usiache viazi shambani." },
      { en: "Sort out damaged tubers before storing.", sw: "Tenganisha viazi vilivyoharibika kabla ya kuhifadhi." },
    ],
    prevent: [
      { en: "Store in a clean, cool, dark store and check weekly.", sw: "Hifadhi mahali safi, penye baridi na giza; kagua kila wiki." },
    ],
  },
  {
    id: "dbm", kind: "pest", crops: ["cabbage", "kale"],
    name: { en: "Diamondback moth", sw: "Nondo wa kabichi" }, latin: "Plutella xylostella",
    symptoms: ["holes", "windows", "caterpillars"], key: ["caterpillars", "windows"], seasons: ["kiangazi", "kipupwe"],
    look: { en: "Small green caterpillars that wriggle back when touched; leaves full of small holes.", sw: "Viwavi wadogo wa kijani wanaorudi nyuma kwa haraka ukiwagusa; majani yenye matundu madogo mengi." },
    act: [
      { en: "Check leaf undersides twice a week.", sw: "Kagua chini ya majani mara mbili kwa wiki." },
      { en: "When there are many, spray an approved Bt bio-pesticide in the evening.", sw: "Wakiwa wengi, nyunyizia dawa ya kibaiolojia ya Bt iliyoidhinishwa jioni." },
      { en: "Change product groups: this moth quickly resists sprays.", sw: "Badilisha aina za dawa: nondo huyu huzoea dawa haraka." },
    ],
    prevent: [
      { en: "Grow a trap row of Indian mustard.", sw: "Panda mstari wa mtego wa haradali (Indian mustard)." },
      { en: "Clear old cabbage and kale stumps after harvest.", sw: "Ondoa visiki vya kabichi na sukuma baada ya kuvuna." },
    ],
  },
  {
    id: "blackrot", kind: "disease", crops: ["cabbage", "kale"],
    name: { en: "Black rot", sw: "Kuoza mweusi" }, latin: "Xanthomonas campestris",
    symptoms: ["vShape", "stunted"], key: ["vShape"], seasons: ["masika", "vuli"],
    look: { en: "Yellow V-shaped patches from the leaf edge, with blackened veins.", sw: "Madoa ya manjano umbo la V kutoka kingo za jani, na mishipa myeusi." },
    act: [
      { en: "Remove infected leaves and badly hit plants.", sw: "Ondoa majani na mimea iliyoathirika vibaya." },
      { en: "Don't work among wet plants.", sw: "Usifanye kazi kati ya mimea ikiwa na unyevu." },
    ],
    prevent: [
      { en: "Use certified seed and healthy seedlings.", sw: "Tumia mbegu zilizothibitishwa na miche yenye afya." },
      { en: "Keep the cabbage family off that field for three years.", sw: "Usipande jamii ya kabichi shambani humo kwa miaka mitatu." },
    ],
  },
];

export const problemsFor = (crop: CropKey) => PROBLEMS.filter((p) => p.crops.includes(crop));

/** In-season problems first (stable otherwise), for the "common problems" list. */
export const problemsForSeason = (crop: CropKey, season: SeasonKey) =>
  problemsFor(crop).sort((a, b) => Number(b.seasons.includes(season)) - Number(a.seasons.includes(season)));

/** The symptoms worth offering for a crop, in catalogue order. */
export function symptomsFor(crop: CropKey): Symptom[] {
  const ids = new Set(problemsFor(crop).flatMap((p) => p.symptoms));
  return SYMPTOMS.filter((s) => ids.has(s.id));
}

export type Match = { problem: Problem; matched: string[]; strength: "strong" | "possible" };

/**
 * Ranks the crop's problems by the selected symptoms. "strong" needs a
 * giveaway symptom and at least half of what the farmer picked; everything
 * else that overlaps is "possible". No overlap, no listing.
 */
export function diagnose(crop: CropKey, selected: string[]): Match[] {
  if (!selected.length) return [];
  const out: Match[] = [];
  for (const p of problemsFor(crop)) {
    const matched = selected.filter((s) => p.symptoms.includes(s));
    if (!matched.length) continue;
    const strong = matched.some((s) => p.key.includes(s)) && matched.length * 2 >= selected.length;
    out.push({ problem: p, matched, strength: strong ? "strong" : "possible" });
  }
  const rank = (m: Match) => (m.strength === "strong" ? 100 : 0) + m.matched.length * 10 + m.matched.filter((s) => m.problem.key.includes(s)).length;
  return out.sort((a, b) => rank(b) - rank(a));
}
