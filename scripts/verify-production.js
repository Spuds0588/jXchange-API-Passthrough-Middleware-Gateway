#!/usr/bin/env node
"use strict";

/**
 * Production check for the GitHub Pages site. Opt-in (`npm run verify:production`)
 * so the offline suite never depends on the network.
 *
 * Fetches the live page through Pages deploy lag, then requires the served HTML
 * to byte-match index.html (SHA-256) and the crawler files to be reachable.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SITE = process.env.SITE_URL || "https://spuds0588.github.io/jXchange-API-Passthrough-Middleware-Gateway/";
const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS) || 20;
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS) || 15000;
const root = path.resolve(__dirname, "..");
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "cache-control": "no-cache" } });
  return { status: response.status, text: await response.text() };
}

async function main() {
  const expected = sha(fs.readFileSync(path.join(root, "index.html")));
  console.log(`Expected index.html sha256: ${expected}`);
  console.log(`Site: ${SITE}`);

  let html = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchText(`${SITE}?v=${Date.now()}`);
      const digest = sha(Buffer.from(response.text));
      console.log(`Attempt ${attempt}/${ATTEMPTS}: HTTP ${response.status}, sha256 ${digest}`);
      if (response.status === 200 && digest === expected) {
        html = response.text;
        break;
      }
    } catch (err) {
      console.log(`Attempt ${attempt}/${ATTEMPTS}: ${err.message}`);
    }
    if (attempt < ATTEMPTS) await sleep(DELAY_MS);
  }

  assert.ok(html, `live index.html did not match ${expected} after ${ATTEMPTS} attempts`);
  console.log("index.html matches the committed file.");

  const robots = await fetchText(`${SITE}robots.txt`);
  assert.equal(robots.status, 200, "robots.txt must be served");
  assert.match(robots.text, /Sitemap: .*\/sitemap\.xml/);

  const sitemap = await fetchText(`${SITE}sitemap.xml`);
  assert.equal(sitemap.status, 200, "sitemap.xml must be served");
  assert.ok(sitemap.text.includes(SITE), "sitemap must point at the live page");

  const llms = await fetchText(`${SITE}llms.txt`);
  assert.equal(llms.status, 200, "llms.txt must be served");
  assert.match(llms.text, /pull requests|Pull requests/);

  console.log("robots.txt, sitemap.xml, and llms.txt are served and consistent.");
  console.log("Note: this verifies the static site only. The AWS API is not deployed from this environment.");
}

main().catch((err) => {
  console.error(`Production verification failed: ${err.message}`);
  process.exit(1);
});
