/**
 * Farm news for the Today screen: the latest agriculture headlines from
 * Kenyan outlets, with the farmer's own county first.
 *
 * Sources (all public RSS, read with a short timeout and no dependencies):
 *   - The Standard's Smart Harvest / agriculture feed and Kilimo News
 *     (national), and
 *   - a Google News search for the county ("Nakuru farmers OR agriculture
 *     Kenya"), which gives the regional items.
 * Each source is cached for 30 minutes; a source that fails keeps serving
 * its last good copy for a day. When nothing can be fetched at all (no
 * internet on the server), a few evergreen KilimoOrbit tips are served and
 * labelled SAMPLE, so the app never shows an empty card without saying why.
 */
import { findCounty, hash } from "./weather.js";

export const FRESH_MS = 30 * 60_000;
export const STALE_MS = 24 * 60 * 60_000;
export const MAX_ITEMS = 12;
const MAX_AGE_DAYS = 60;

export const SOURCES = [
  { id: "standard", name: "The Standard", url: "https://www.standardmedia.co.ke/rss/agriculture.php" },
  { id: "kilimonews", name: "Kilimo News", url: "https://kilimonews.co.ke/feed/" },
];

export const googleNewsUrl = (county) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${county} farmers OR agriculture Kenya`)}&hl=en-KE&gl=KE&ceid=KE:en`;

/* ── a small RSS reader ── */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
const unwrap = (s) => decodeEntities(String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
// Feeds often escape the HTML inside a description, so entities are decoded again after the tags go.
const stripTags = (s) => decodeEntities(unwrap(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`, "i"));
  return m ? decodeEntities(m[1]) : "";
};

/** Items from an RSS 2.0 document, newest first. Malformed input gives []. */
export function parseRss(xml, sourceName) {
  const items = [];
  for (const m of String(xml ?? "").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    let title = stripTags(tag(it, "title"));
    const link = unwrap(tag(it, "link")).trim() || attr(it, "link", "href");
    if (!title || !/^https?:\/\//.test(link)) continue;
    const source = stripTags(tag(it, "source")) || sourceName;
    // Google News puts the outlet after a dash in the title.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const ts = Date.parse(unwrap(tag(it, "pubDate") || tag(it, "dc:date")));
    let summary = stripTags(tag(it, "description")).replace(/\s*(Read more|Continue reading).*$/i, "");
    // Google News "descriptions" are the headline again plus the outlet: no summary is better than an echo.
    if (summary.toLowerCase().startsWith(title.toLowerCase().slice(0, 40))) summary = "";
    items.push({
      id: Math.floor(hash(link) * 4294967296).toString(36),
      title: title.slice(0, 160),
      source: source.slice(0, 60),
      link: link.slice(0, 500),
      published: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
      summary: summary.slice(0, 220),
      image: attr(it, "media:content", "url") || attr(it, "media:thumbnail", "url") || attr(it, "enclosure", "url") || null,
    });
  }
  return items.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
}

/* ── evergreen tips for a server with no internet ── */
export const SAMPLE_TIPS = [
  { id: "tip-faw", route: "/daktari?crop=maize", title: "Scout maize weekly for fall armyworm: a W-walk, 5 stops, 10 plants each", title_sw: "Kagua mahindi kila wiki kuona viwavijeshi: tembea kwa umbo la W, vituo 5, mimea 10" },
  { id: "tip-seed", route: "/shamba", title: "Fake seed? Scratch the KEPHIS label and SMS the code to 1397 before you plant", title_sw: "Mbegu bandia? Kwangua lebo ya KEPHIS na utume nambari kwa SMS kwenda 1397 kabla ya kupanda" },
  { id: "tip-store", route: "/masoko", title: "Grain in hermetic bags loses about 0.5 % a month; in ordinary bags, up to 2.5 %", title_sw: "Nafaka kwenye mifuko isiyopitisha hewa hupoteza takriban 0.5% kwa mwezi; magunia ya kawaida hadi 2.5%" },
  { id: "tip-lime", route: "/shamba", title: "Soil below pH 5.5 wastes fertiliser: a soil test and lime before planting pay back", title_sw: "Udongo chini ya pH 5.5 hupoteza mbolea: kipimo cha udongo na chokaa kabla ya kupanda hulipa" },
  { id: "tip-water", route: "/shamba?tab=livestock", title: "A milking cow needs about 65 L of water a day plus 4–5 L for every litre of milk", title_sw: "Ng'ombe anayekamuliwa anahitaji takriban lita 65 za maji kwa siku na lita 4–5 kwa kila lita ya maziwa" },
];
const sampleItems = (now) =>
  SAMPLE_TIPS.map((t) => ({ ...t, source: "KilimoOrbit", link: null, published: now.toISOString(), summary: "", image: null, scope: "tip" }));

/* ── fetching with a cache per source ── */
async function fetchText(url, { fetchImpl, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { "User-Agent": "KilimoOrbit Sentinel (farm news reader)", Accept: "application/rss+xml, application/xml, text/xml" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function createNews({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const cache = new Map(); // key → { items, ts }

  async function source(key, url, name, now) {
    const hit = cache.get(key);
    if (hit && now - hit.ts < FRESH_MS) return { items: hit.items, live: true };
    try {
      const items = parseRss(await fetchText(url, { fetchImpl, timeoutMs }), name);
      if (!items.length) throw new Error("empty feed");
      cache.set(key, { items, ts: now });
      return { items, live: true };
    } catch {
      // A source that is down keeps serving its last good copy for a day.
      if (hit && now - hit.ts < STALE_MS) return { items: hit.items, live: false };
      return { items: [], live: false };
    }
  }

  return {
    /** The farmer's news: county items first, then national, at most 12, newest first within each group. */
    async newsFor(countyName, { now = new Date() } = {}) {
      const county = findCounty(countyName);
      const ms = now.getTime();
      const jobs = SOURCES.map((s) => source(s.id, s.url, s.name, ms));
      if (county) jobs.push(source(`county:${county.name}`, googleNewsUrl(county.name), "Google News", ms));
      const results = await Promise.all(jobs);
      const cutoff = new Date(ms - MAX_AGE_DAYS * 86400_000).toISOString();
      const fresh = (it) => !it.published || it.published >= cutoff;
      const national = results.slice(0, SOURCES.length).flatMap((r) => r.items).filter(fresh);
      const regional = county ? results[SOURCES.length].items.filter(fresh) : [];
      const mentions = (it) => county && new RegExp(`\\b${county.name.replace(/'/g, "'?")}\\b`, "i").test(`${it.title} ${it.summary}`);
      const seen = new Set();
      const take = (list, scope, max) => {
        const out = [];
        for (const it of list.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))) {
          const k = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ ...it, scope, county: scope === "county" || mentions(it) ? county.name : null });
          if (out.length >= max) break;
        }
        return out;
      };
      const items = [...take(regional, "county", 6), ...take(national, "national", MAX_ITEMS)].slice(0, MAX_ITEMS);
      const live = results.some((r) => r.live);
      if (!items.length) return { county: county?.name ?? null, fetched_at: now.toISOString(), source: "SAMPLE", items: sampleItems(now) };
      return { county: county?.name ?? null, fetched_at: now.toISOString(), source: live ? "LIVE" : "CACHED", items };
    },
    _clear: () => cache.clear(),
  };
}
