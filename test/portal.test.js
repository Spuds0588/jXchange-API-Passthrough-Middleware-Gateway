const assert = require("node:assert/strict");
const { test } = require("node:test");
const { renderPortal } = require("../src/portal");

const ROLE = { role: "lending", label: "Lending partner", persona: "LENDING_PARTNER", code: "secret-invite-code-value" };

test("the portal without an invite explains how to get one", () => {
  const html = renderPortal();
  assert.match(html, /Invite link required/);
  assert.ok(!html.includes("<form"));
});

test("an invited role renders the provisioning form and locks the persona", () => {
  const html = renderPortal({ role: ROLE });
  assert.match(html, /Lending partner/);
  assert.match(html, /LENDING_PARTNER/);
  assert.match(html, /<form id="form">/);
  assert.match(html, /AcctInq/);
  assert.match(html, /AcctHistSrch/);
  assert.match(html, /CustInq/);
});

test("the portal never renders the invite code", () => {
  assert.ok(!renderPortal({ role: ROLE }).includes(ROLE.code));
});

test("errors are escaped", () => {
  const html = renderPortal({ error: `<img src=x onerror="alert(1)">` });
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x/);
});

test("the portal points contributors at issues and pull requests", () => {
  const html = renderPortal();
  assert.match(html, /issues\/new\?template=bug_report\.yml/);
  assert.match(html, /\/pulls/);
});

test("the portal is self-contained and sets no external asset origins", () => {
  const html = renderPortal({ role: ROLE });
  assert.ok(!/src="https?:\/\//.test(html));
  assert.ok(!html.includes("cdn."));
});
