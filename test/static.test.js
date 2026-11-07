const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const canonical = "https://spuds0588.github.io/jXchange-API-Passthrough-Middleware-Gateway/";

test("the landing page has the search and answer-engine metadata", () => {
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`));
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="twitter:card"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, "exactly one h1");
  const description = /<meta name="description" content="([^"]+)"/.exec(html)?.[1] || "";
  assert.ok(description.length >= 80 && description.length <= 320, `description is ${description.length} chars`);
});

test("the page publishes valid SoftwareApplication and FAQPage structured data", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const types = blocks.map((block) => block["@type"]);
  assert.ok(types.includes("SoftwareApplication"));
  assert.ok(types.includes("FAQPage"));
  const faq = blocks.find((block) => block["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5, "at least five FAQ answers");
  for (const entry of faq.mainEntity) {
    assert.ok(entry.name && entry.acceptedAnswer.text);
  }
});

test("the page states the read-only scope, the non-affiliation, and the verification limits", () => {
  assert.match(html, /read-only/);
  assert.match(html, /not affiliated with or endorsed by Jack Henry/);
  assert.match(html, /no Jack Henry access/);
  assert.match(html, /MIT/);
});

test("the page drives contributors to issues and pull requests", () => {
  assert.match(html, /issues\/new\?template=bug_report\.yml/);
  assert.match(html, /issues\/new\?template=feature_improvement\.yml/);
  assert.match(html, /\/pulls/);
  assert.match(html, /CONTRIBUTING\.md/);
});

test("the page is self-contained and leaks nothing", () => {
  assert.ok(!/src="https?:\/\//.test(html), "no third-party scripts");
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(html), "no AWS access key");
  assert.ok(!/invite-.*[0-9a-f]{16}/i.test(html), "no invite code");
  assert.ok(!html.includes("clientKeyBase64"));
});

test("robots.txt points crawlers at the sitemap", () => {
  const robots = read("robots.txt");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, new RegExp(`Sitemap: ${canonical}sitemap\\.xml`));
});

test("sitemap.xml lists the canonical page", () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test("llms.txt gives agents the entry points and the contribution contract", () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# jXchange API Passthrough/s);
  assert.ok(llms.includes(canonical));
  assert.match(llms, /issues/);
  assert.match(llms, /[Pp]ull request/);
  assert.match(llms, /AGENTS\.md/);
  assert.match(llms, /read-only/i);
  assert.match(llms, /not affiliated/i);
});
