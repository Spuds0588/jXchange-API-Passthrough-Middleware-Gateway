/** Vendor-facing routes. API-Gateway-shaped events; tenant identity comes only from apiKeyId. */
const { log } = require("./log");
const { mask, ALLOWLISTS } = require("./mask");
const { roleFor, safeEqual } = require("./roles");
const { renderPortal } = require("./portal");
const { faultOf, parseAccount, parseHistory, parseCustomer } = require("./jxchange");

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ID = /^[A-Za-z0-9._:-]{1,40}$/;
const ACCT_TYPE = /^[A-Za-z]{1,4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REPO = "https://github.com/Spuds0588/jXchange-API-Passthrough-Middleware-Gateway";

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  body: JSON.stringify(body)
});
const error = (statusCode, message, extra = {}) => json(statusCode, { error: message, ...extra });
const html = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY"
  },
  body
});

const OPERATIONS = [
  { method: "GET", path: "/v1/accounts/{accountId}?type=D", jxchange: "AcctInq", description: "Account status and balances" },
  { method: "GET", path: "/v1/accounts/{accountId}/transactions?type=D&limit=25", jxchange: "AcctHistSrch", description: "Posted transaction history" },
  { method: "GET", path: "/v1/customers/{customerId}", jxchange: "CustInq", description: "Customer name and address on file" }
];

const ref = (id) => (String(id).length > 4 ? `***${String(id).slice(-4)}` : "***");
const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Core faults are logged verbatim and returned generically: they can carry internal host detail. */
const coreFault = (fault, details) => {
  log("WARN", "SOAP_FAULT_INTERCEPTED", { ...details, code: fault.code, message: fault.message });
  if (/not found|no account|no customer|does not exist|invalid account/i.test(fault.message)) return error(404, "Record not found");
  if (/consumer|credential|authoriz|authentic|validconsm/i.test(fault.message)) return error(502, "Core rejected gateway credentials", { code: fault.code });
  return error(400, "Core rejected the request", { code: fault.code });
};

function createApp({ store, core, env = process.env, now = () => Date.now() }) {
  if (!store) throw new Error("createApp requires a store");
  if (!core) throw new Error("createApp requires a core client");

  const tenantFor = async (apiKeyId) => (apiKeyId ? (await store.getTenant(apiKeyId)) || null : null);
  const can = (persona, path) => Boolean(ALLOWLISTS[persona]?.includes(path));
  const accountTypeOf = (event) => {
    const type = String(event.queryStringParameters?.type || env.DEFAULT_ACCT_TYPE || "D").trim();
    return ACCT_TYPE.test(type) ? type : null;
  };

  const upstreamFailure = (err, operation, id) => {
    log("ERROR", "JXCHANGE_READ_FAILED", { operation, ref: ref(id), message: err.message, code: err.code || err.name });
    return error(err.name === "TimeoutError" || err.code === "ETIMEDOUT" ? 504 : 502, "Core banking request failed");
  };

  async function readAccount(event, apiKeyId, accountId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    const accountType = accountTypeOf(event);
    if (!accountType) return error(400, "query type must be a jXchange AcctType code (max 4 letters)");

    let upstream;
    try {
      upstream = await core.accountInquiry({ accountId, accountType });
    } catch (err) {
      return upstreamFailure(err, "AcctInq", accountId);
    }

    const fault = faultOf(upstream.body);
    if (fault) return coreFault(fault, { operation: "AcctInq", ref: ref(accountId) });
    if (upstream.statusCode >= 300) {
      log("ERROR", "JXCHANGE_HTTP_ERROR", { operation: "AcctInq", statusCode: upstream.statusCode });
      return error(502, "Core banking request failed");
    }

    const masked = mask(parseAccount(upstream.body, { accountId, accountType, coreType: env.CORE_TYPE || "UNKNOWN" }), tenant.persona);
    if (!masked) return error(403, `Persona ${tenant.persona} has no schema allowlist`);
    log("INFO", "SCHEMA_MASKING_APPLIED", { operation: "AcctInq", ref: ref(accountId), persona: tenant.persona });
    return json(200, masked);
  }

  async function readHistory(event, apiKeyId, accountId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    if (!can(tenant.persona, "transactions")) return error(403, `Persona ${tenant.persona} cannot read transactions`);
    const accountType = accountTypeOf(event);
    if (!accountType) return error(400, "query type must be a jXchange AcctType code (max 4 letters)");

    const rawLimit = event.queryStringParameters?.limit;
    const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return error(400, `limit must be an integer from 1 to ${MAX_LIMIT}`);

    const startDt = event.queryStringParameters?.startDate || null;
    const endDt = event.queryStringParameters?.endDate || null;
    if ((startDt && !DATE.test(startDt)) || (endDt && !DATE.test(endDt))) return error(400, "startDate and endDate must be YYYY-MM-DD");

    let upstream;
    try {
      upstream = await core.accountHistory({ accountId, accountType, limit, startDt, endDt });
    } catch (err) {
      return upstreamFailure(err, "AcctHistSrch", accountId);
    }

    const fault = faultOf(upstream.body);
    if (fault) return coreFault(fault, { operation: "AcctHistSrch", ref: ref(accountId) });
    if (upstream.statusCode >= 300) {
      log("ERROR", "JXCHANGE_HTTP_ERROR", { operation: "AcctHistSrch", statusCode: upstream.statusCode });
      return error(502, "Core banking request failed");
    }

    const masked = mask(parseHistory(upstream.body, { accountId }), tenant.persona);
    if (!masked) return error(403, `Persona ${tenant.persona} has no schema allowlist`);
    if (!Array.isArray(masked.transactions)) return error(403, `Persona ${tenant.persona} cannot read transactions`);
    log("INFO", "HISTORY_READ_COMPLETE", { ref: ref(accountId), count: masked.transactions.length, persona: tenant.persona });
    return json(200, masked);
  }

  async function readCustomer(apiKeyId, customerId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    if (!can(tenant.persona, "name")) return error(403, `Persona ${tenant.persona} cannot read customer demographics`);

    let upstream;
    try {
      upstream = await core.customerInquiry({ customerId });
    } catch (err) {
      return upstreamFailure(err, "CustInq", customerId);
    }

    const fault = faultOf(upstream.body);
    if (fault) return coreFault(fault, { operation: "CustInq", ref: ref(customerId) });
    if (upstream.statusCode >= 300) {
      log("ERROR", "JXCHANGE_HTTP_ERROR", { operation: "CustInq", statusCode: upstream.statusCode });
      return error(502, "Core banking request failed");
    }

    const masked = mask(parseCustomer(upstream.body, { customerId }), tenant.persona);
    if (!masked) return error(403, `Persona ${tenant.persona} has no schema allowlist`);
    if (!masked.name?.full && !masked.name?.last && !masked.address?.street) {
      return error(403, `Persona ${tenant.persona} cannot read customer demographics`);
    }
    log("INFO", "CUSTOMER_READ_COMPLETE", { ref: ref(customerId), persona: tenant.persona });
    return json(200, masked);
  }

  async function provision(event, requestId) {
    let payload;
    try {
      payload = JSON.parse(event.body || "");
    } catch {
      return error(400, "Invalid JSON body");
    }

    const role = String(payload?.role || "").trim().toLowerCase();
    const config = roleFor(env, role);
    if (!config || !safeEqual(String(payload?.code || ""), config.code)) {
      log("WARN", "PORTAL_INVITE_REJECTED", { requestId, role: role || "unknown" });
      return error(403, "Invalid or expired invite link");
    }

    const tenantName = String(payload.tenantName || "").trim();
    const email = String(payload.email || "").trim();
    if (!tenantName || tenantName.length > 100) return error(400, "tenantName is required (max 100 chars)");
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return error(400, "A valid email is required");

    let key;
    try {
      key = await store.createApiKey({ tenantName });
      await store.putTenant({
        apiKeyId: key.id,
        tenantName,
        email,
        role,
        persona: config.persona,
        status: "ACTIVE",
        createdAt: new Date(now()).toISOString()
      });
    } catch (err) {
      log("ERROR", "TENANT_PROVISION_FAILED", { tenantName, message: err.message });
      return error(503, "Key store unavailable");
    }

    log("INFO", "TENANT_PROVISIONED", { tenantName, role, persona: config.persona, apiKeyId: key.id });
    return json(200, {
      message: "Tenant provisioned successfully",
      apiKey: key.value,
      tenantName,
      email,
      role,
      persona: config.persona
    });
  }

  async function handle(event = {}) {
    const method = String(event.httpMethod || event.requestContext?.http?.method || "GET").toUpperCase();
    const path = event.path || event.rawPath || "/";
    const requestId = event.requestContext?.requestId;
    const apiKeyId = event.requestContext?.identity?.apiKeyId;
    const started = now();

    log("INFO", "REQUEST_RECEIVED", { requestId, method, path });
    try {
      if (method === "GET" && path === "/health") return json(200, { status: "ok", system: "JXchangeGateway", mode: "read-only" });

      if (path === "/portal") {
        if (method === "POST") return await provision(event, requestId);
        if (method !== "GET") return error(405, "Method not allowed");
        const role = String(event.queryStringParameters?.role || "").trim().toLowerCase();
        const code = String(event.queryStringParameters?.code || "");
        if (!role && !code) return html(200, renderPortal({ repo: REPO }));
        const config = roleFor(env, role);
        if (!config || !safeEqual(code, config.code)) {
          log("WARN", "PORTAL_INVITE_REJECTED", { requestId, role: role || "unknown" });
          return html(403, renderPortal({ repo: REPO, error: "This invite link is invalid or has expired." }));
        }
        return html(200, renderPortal({ repo: REPO, role: config }));
      }

      let match;
      if (path === "/v1/operations") {
        if (method !== "GET") return error(405, "Method not allowed");
        if (!(await tenantFor(apiKeyId))) return error(403, "Unauthorized tenant mapping");
        return json(200, { operations: OPERATIONS, writes: "Not supported. This gateway is read-only by design." });
      }
      if ((match = /^\/v1\/accounts\/([^/]+)\/transactions$/.exec(path))) {
        if (method !== "GET") return error(405, "Method not allowed");
        return await readHistory(event, apiKeyId, decode(match[1]));
      }
      if ((match = /^\/v1\/accounts\/([^/]+)$/.exec(path))) {
        if (method !== "GET") {
          return error(method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE" ? 501 : 405, "This gateway is read-only");
        }
        return await readAccount(event, apiKeyId, decode(match[1]));
      }
      if ((match = /^\/v1\/customers\/([^/]+)$/.exec(path))) {
        if (method !== "GET") return error(405, "Method not allowed");
        return await readCustomer(apiKeyId, decode(match[1]));
      }

      return error(404, "Not found");
    } catch (err) {
      log("ERROR", "HANDLER_EXCEPTION", { requestId, method, path, message: err.message, stack: err.stack });
      return error(500, "Internal gateway error");
    } finally {
      log("INFO", "REQUEST_COMPLETE", { requestId, method, path, durationMs: now() - started });
    }
  }

  return { handle };
}

module.exports = { createApp, OPERATIONS };
