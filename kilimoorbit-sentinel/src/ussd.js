/**
 * KilimoOrbit Sentinel — USSD service (Africa's Talking gateway format)
 * ----------------------------------------------------------------------
 * The gateway POSTs { sessionId, serviceCode, phoneNumber, text } on every
 * key press, where `text` is the user's full input so far joined with "*"
 * (e.g. "" → first screen, "1" → menu 1, "3*bei ya nyanya" → free text).
 * The reply is plain text: "CON ..." keeps the session open, "END ..." closes.
 *
 * Menu tree:
 *   (root)            → main menu
 *   1                 → crop list (live commodity feed)
 *   1*<n>             → END quotes for crop n + best market
 *   2                 → prompt for county
 *   2*<county>        → END §2 climate risk assessment for county × this month
 *   3                 → prompt for a question
 *   3*<question>      → END Apex chat reply (per-phone conversation memory)
 *
 * Feature phones render GSM-7 only, so all output is stripped of emoji and
 * smart punctuation and capped at 160 characters per screen.
 */
import { callApex, climateSentinel } from "./apex_client.js";
import { liveArbitragePayload, liveCommodityFeed } from "./data.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SCREEN_MAX = 160;

/** GSM-7-safe screen text: no emoji/smart punctuation, ≤ max chars. */
export function toUssd(s, max = SCREEN_MAX) {
  const clean = String(s ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[—–·]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "..")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
  return clean.length <= max ? clean : clean.slice(0, max - 2).trimEnd() + "..";
}

/* ── Per-phone conversation memory (Route B chat_history over USSD) ──────
 * USSD sessions are seconds long, but the phone number is a stable identity,
 * so follow-up questions across dial-ins stay coherent. Bounded: 6 turns per
 * phone, 30-minute TTL, at most 500 phones (oldest evicted).
 */
const CHAT_TTL_MS = 30 * 60 * 1000;
const MAX_PHONES = 500;
const chatMemory = new Map(); // phone → { turns: [{role, text}], at }

function recall(phone) {
  const entry = chatMemory.get(phone);
  if (!entry) return [];
  if (Date.now() - entry.at > CHAT_TTL_MS) {
    chatMemory.delete(phone);
    return [];
  }
  return entry.turns;
}

function remember(phone, role, text) {
  if (!phone) return;
  const turns = [...recall(phone), { role, text }].slice(-6);
  chatMemory.delete(phone); // re-insert so Map order doubles as LRU
  chatMemory.set(phone, { turns, at: Date.now() });
  if (chatMemory.size > MAX_PHONES)
    chatMemory.delete(chatMemory.keys().next().value);
}

const cap = (s) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
const titleCase = (s) =>
  String(s ?? "").trim().toLowerCase().split(/\s+/).map(cap).join(" ");

const MAIN_MENU = [
  "CON Karibu KilimoOrbit Sentinel",
  "1. Bei za soko (Prices)",
  "2. Hatari ya hewa (Climate risk)",
  "3. Uliza Apex (Ask Apex)",
].join("\n");

const INVALID = "END Chaguo si sahihi. Tafadhali piga tena uanze upya. (Invalid choice - please dial again.)";

export async function handleUssd({ text = "", phoneNumber = "" }) {
  const parts = String(text)
    .split("*")
    .map((s) => s.trim())
    .filter((s, i) => i > 0 || s !== "");
  const [step, ...rest] = parts;

  if (!step) return MAIN_MENU;

  /* 1 — market prices from the live commodity feed */
  if (step === "1") {
    const feed = liveCommodityFeed();
    if (!rest.length) {
      const lines = feed.commodities.map((c, i) => `${i + 1}. ${cap(c.crop)}`);
      return toUssd(["CON Chagua zao (choose crop):", ...lines].join("\n"));
    }
    const crop = feed.commodities[Number(rest[0]) - 1];
    if (!crop) return INVALID;
    const best = [...crop.quotes].sort((a, b) => b.price - a.price)[0];
    const lines = crop.quotes.map((q) => `${q.market}: KES ${q.price}/kg`);
    return toUssd(
      [`END ${cap(crop.crop)} leo (today):`, ...lines, `Bora (best): ${best.market}`].join("\n")
    );
  }

  /* 2 — §2 climate risk for a county × current month */
  if (step === "2") {
    if (!rest.length) return "CON Andika kaunti yako (Enter your county):";
    const county = titleCase(rest.join(" "));
    const s = climateSentinel({ county }, MONTHS[new Date().getMonth()], null);
    return toUssd(
      [
        `END ${county} - ${s.current_kenyan_season}`,
        `Hatari (risk): ${s.pre_farming_risk_level}`,
        s.climate_caution_alert,
      ].join("\n")
    );
  }

  /* 3 — Apex chat with per-phone conversation memory */
  if (step === "3") {
    if (!rest.length) return "CON Andika swali lako (Type your question):";
    const question = rest.join(" ");
    const r = await callApex({
      execution_mode: "user_chat",
      current_screen: "ussd",
      current_month: MONTHS[new Date().getMonth()],
      user_message: question,
      chat_history: recall(phoneNumber),
      market_data: liveArbitragePayload().market_data,
    });
    if (!r || r.execution_mode === "error")
      return "END Samahani, Apex haipatikani kwa sasa. Jaribu tena baadaye. (Apex is unavailable - try again later.)";
    remember(phoneNumber, "user", question);
    remember(phoneNumber, "apex", r.chat_response);
    return toUssd(`END ${r.chat_response}`);
  }

  return INVALID;
}
