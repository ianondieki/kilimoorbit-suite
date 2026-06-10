/** Route test — Route D · onboarding_intake */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "../apex_client.js";

const here = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(join(here, "../../payloads/onboarding_payload.json"), "utf8")
);

const result = await callApex(payload);
console.log(`[${engineMode()}] Route D · onboarding_intake →`);
console.log(JSON.stringify(result, null, 2));
