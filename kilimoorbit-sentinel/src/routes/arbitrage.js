/** Route test — Route A · arbitrage_compile */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callApex, engineMode } from "../apex_client.js";

const here = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(join(here, "../../payloads/arbitrage_payload.json"), "utf8")
);

const result = await callApex(payload);
console.log(`[${engineMode()}] Route A · arbitrage_compile →`);
console.log(JSON.stringify(result, null, 2));
