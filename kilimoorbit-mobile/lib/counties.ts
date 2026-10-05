/**
 * Kenya's 47 counties, for the farm profile picker. Kept in step with the
 * server's list in kilimoorbit-sentinel/src/agro/weather.js (which also holds
 * the coordinates used for weather). Static so the picker works offline.
 */
export const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay",
  "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii",
  "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera",
  "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi",
  "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River",
  "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
] as const;

/** The county used before the farmer picks one: the demo farm's (Meru). */
export const DEMO_COUNTY = "Meru";

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

/** Forgiving search: "muranga", "uasin", "taita taveta" all match. */
export function searchCounties(q: string): string[] {
  const s = slug(q);
  if (!s) return [...COUNTIES];
  const starts = COUNTIES.filter((c) => slug(c).startsWith(s));
  const contains = COUNTIES.filter((c) => !slug(c).startsWith(s) && slug(c).includes(s));
  return [...starts, ...contains];
}
