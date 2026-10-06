#!/usr/bin/env node
/**
 * Runs an npm command inside one of the projects: `node scripts/in.js kilimoorbit-mobile start`.
 *
 * The root scripts used `npm --prefix <folder> …`, which inside an npm
 * lifecycle (postinstall, start) on Windows re-ran the root package's own
 * script instead of the folder's, recursing until the PATH overflowed. This
 * spawns npm with the folder as its working directory and none of the
 * npm_* variables the parent npm puts in the environment, so the child only
 * ever sees the folder's package.json.
 */
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { existsSync } = require("node:fs");

const [folder, ...args] = process.argv.slice(2);
const cwd = folder ? join(__dirname, "..", folder) : null;
if (!cwd || !existsSync(join(cwd, "package.json")) || !args.length) {
  console.error("usage: node scripts/in.js <kilimoorbit-sentinel|kilimoorbit-mobile|soko-mobile> <npm args…>");
  process.exit(2);
}
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k)));
const win = process.platform === "win32";
const result = spawnSync(win ? "npm.cmd" : "npm", args, { cwd, env, stdio: "inherit", shell: win });
process.exit(result.status === null ? 1 : result.status);
