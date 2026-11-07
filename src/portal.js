/** Invite portal: one page, no build step, no external assets. */
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const ROWS = [
  ["Account status and balances", "accountId, accountType, coreType, status, balances.current, balances.available, currency"],
  ["Transaction history", "accountId, transactions[].transactionId, postDate, amount, description, type"],
  ["Customer on file", "customerId, customerType, name.first, name.last, name.full, address.street, city, state, zip"]
].map(([need, paths]) => `<tr><td>${need}</td><td><code>${paths}</code></td></tr>`).join("");

const PERSONAS = [
  ["Account verification", "Balances, account status, customer name and address"],
  ["Lending partner", "Everything above plus posted transaction history"],
  ["Data aggregator", "Balances, status and transaction history, no customer name or address"]
].map(([label, sees]) => `<tr><td>${label}</td><td>${sees}</td></tr>`).join("");

const OPERATIONS = [
  ["GET", "/v1/accounts/{accountId}?type=D", "AcctInq"],
  ["GET", "/v1/accounts/{accountId}/transactions?type=D&limit=25", "AcctHistSrch"],
  ["GET", "/v1/customers/{customerId}", "CustInq"],
  ["GET", "/v1/operations", "catalog"]
].map(([method, path, core]) => `<tr><td><code>${method}</code></td><td class="path">${path}</td><td><code>${core}</code></td></tr>`).join("");

// Kept as separate templates (never nested inside the page template) so the
// dependency-free bundler can tokenize the page template correctly.
const errorBlock = (error) => (error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : "");

const inviteBlock = (role) =>
  role
    ? `<section class="invite">
         <span class="badge">${escapeHtml(role.label)}</span>
         <p class="hint">Persona locked to <code>${escapeHtml(role.persona)}</code> server-side. Every response is masked to it.</p>
       </section>
       <form id="form">
         <label for="tenantName">Company name</label>
         <input id="tenantName" type="text" maxlength="100" placeholder="e.g. Acme Verification" required>
         <label for="email">Developer email</label>
         <input id="email" type="email" maxlength="254" placeholder="dev@acme.test" required>
         <button id="submit" type="submit">Generate API key</button>
       </form>`
    : `<div class="notice"><strong>Invite link required.</strong> Ask the bank for a role-scoped link such as <code>/portal?role=lending&amp;code=…</code>. The link fixes your persona and permissions.</div>`;

function renderPortal({ role, error, repo = "https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jXchange Gateway Portal</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: #0b1220; color: #e2e8f0; font: 15px/1.55 system-ui, sans-serif; }
  main { max-width: 880px; margin: auto; padding: 24px; background: #111c2e; border: 1px solid #1f3350; border-radius: 12px; }
  h1 { margin: 0; font-size: 21px; }
  h2 { margin: 22px 0 8px; font-size: 15px; }
  p.sub, .hint { margin: 6px 0 16px; color: #93a5bf; font-size: 13px; }
  label { display: block; margin: 14px 0 6px; font-size: 11px; text-transform: uppercase; color: #93a5bf; }
  input { width: 100%; padding: 9px 10px; border: 1px solid #1f3350; border-radius: 8px; background: #0b1220; color: #f8fafc; font: inherit; }
  button { margin-top: 14px; padding: 9px 12px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .hidden { display: none; }
  .error { margin-top: 14px; padding: 9px 11px; border-radius: 8px; background: #450a0a; color: #fecaca; font-size: 13px; }
  .notice, .ok, .invite { margin: 14px 0; padding: 12px; background: #0b1220; border: 1px solid #1f3350; border-radius: 8px; font-size: 13px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #1e3a8a; color: #bfdbfe; font-size: 11px; text-transform: uppercase; }
  .keyrow { display: flex; gap: 8px; margin-bottom: 12px; }
  .keyrow button { width: auto; margin: 0; }
  pre { margin: 0 0 4px; padding: 10px; overflow-x: auto; background: #020617; border-radius: 8px; font-size: 12px; }
  a { color: #93c5fd; font-size: 12px; }
  .table-wrap { overflow-x: auto; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 7px 9px; text-align: left; border-bottom: 1px solid #1b2b45; }
  th { color: #93a5bf; font-size: 11px; text-transform: uppercase; }
  td.path, code, pre { font-family: ui-monospace, Menlo, monospace; }
  code { padding: 1px 4px; background: #020617; border-radius: 4px; color: #c7d2fe; }
</style>
</head>
<body>
<main>
  <h1>jXchange Gateway</h1>
  <p class="sub">JSON REST access to a Jack Henry core. Your invite link fixes your persona and the data your key can return.</p>
  ${errorBlock(error)}
  ${inviteBlock(role)}
  <div id="error" class="error hidden" role="alert"></div>
  <section id="result" class="ok hidden">
    <h2>Key provisioned successfully</h2>
    <p class="hint">Copy this key now. It is not stored in plaintext and will not be shown again.</p>
    <div class="keyrow"><input id="apiKey" readonly><button id="copy" type="button">Copy</button></div>
    <label>Endpoints</label>
    <pre id="endpoints"></pre>
    <label for="curl">Verification cURL</label>
    <pre id="curl"></pre>
    <p><a href="#" id="again">Generate another key with this invite</a></p>
  </section>
  <section>
    <h2>Endpoints for this deployment</h2>
    <div class="table-wrap"><table><thead><tr><th>Method</th><th>Path</th><th>jXchange operation</th></tr></thead><tbody>${OPERATIONS}</tbody></table></div>
    <p class="hint">Send <code>x-api-key</code>. Responses are normalized JSON; nothing is stored at rest. This gateway is read-only.</p>
    <h2>Response fields</h2>
    <div class="table-wrap"><table><thead><tr><th>Need</th><th>JSON paths</th></tr></thead><tbody>${ROWS}</tbody></table></div>
    <h2>Personas</h2>
    <div class="table-wrap"><table><thead><tr><th>Role</th><th>Sees</th></tr></thead><tbody>${PERSONAS}</tbody></table></div>
    <p class="hint">Unknown core status codes are returned as-is. Resolve them with jXchange <code>SvcDictSrch</code>; the gateway does not translate core dictionaries. Found a gap? <a href="${escapeHtml(repo)}/issues/new?template=bug_report.yml">Open an issue</a> or <a href="${escapeHtml(repo)}/pulls">send a pull request</a>.</p>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove("hidden");
  const hide = (id) => $(id).classList.add("hidden");
  const form = $("form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hide("error");
      const params = new URLSearchParams(location.search);
      const tenantName = $("tenantName").value.trim();
      const email = $("email").value.trim();
      if (!tenantName || !email) {
        $("error").textContent = "Company name and developer email are required.";
        return show("error");
      }
      const button = $("submit");
      button.disabled = true;
      button.textContent = "Generating...";
      try {
        const response = await fetch(location.pathname, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantName, email, role: params.get("role"), code: params.get("code") })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Provisioning failed");
        $("apiKey").value = data.apiKey;
        $("endpoints").textContent = [
          location.origin + "/v1/accounts/{accountId}?type=D",
          location.origin + "/v1/accounts/{accountId}/transactions?type=D",
          location.origin + "/v1/customers/{customerId}",
          location.origin + "/v1/operations"
        ].join(String.fromCharCode(10));
        $("curl").textContent = 'curl -s "' + location.origin + '/v1/accounts/123456789?type=D" -H "x-api-key: ' + data.apiKey + '"';
        show("result");
      } catch (err) {
        $("error").textContent = err.message;
        show("error");
      } finally {
        button.disabled = false;
        button.textContent = "Generate API key";
      }
    });
    $("copy").addEventListener("click", async () => {
      await navigator.clipboard?.writeText($("apiKey").value);
      $("copy").textContent = "Copied";
    });
    $("again").addEventListener("click", (event) => {
      event.preventDefault();
      hide("result");
      form.reset();
    });
  }
</script>
</body>
</html>`;
}

module.exports = { renderPortal };
