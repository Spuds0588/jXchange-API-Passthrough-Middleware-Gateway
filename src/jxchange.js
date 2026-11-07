/** jXchange SOAP client: builds envelopes, posts them over mTLS, normalizes the responses vendors get. */
const http = require("node:http");
const https = require("node:https");
const { escapeXml, parse, first, findAll, text, value } = require("./xml");
const { log } = require("./log");

const NS = "http://jackhenry.com/jxchange/TPG/2008";
const OPERATIONS = { AcctInq: "AcctInq", AcctHistSrch: "AcctHistSrch", CustInq: "CustInq" };
const amount = (raw) => {
  const parsed = Number.parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Secret PEMs travel base64-encoded so the Secrets Manager JSON stays valid. Keys match infra/template.yaml. */
const decodeSecret = (secret = {}) => ({
  ...secret,
  clientCertPem: secret.clientCertBase64 ? Buffer.from(secret.clientCertBase64, "base64").toString("utf8") : secret.clientCertPem,
  clientKeyPem: secret.clientKeyBase64 ? Buffer.from(secret.clientKeyBase64, "base64").toString("utf8") : secret.clientKeyPem
});

const headerXml = (config) => `<jXchangeHdr>
<JxVer/><AuditUsrId>${escapeXml(config.auditUsrId)}</AuditUsrId><AuditWsId>${escapeXml(config.auditWsId || "AWS_GATEWAY")}</AuditWsId>
<AuthenUsrId/><ConsumerName/><ConsumerProd/><Ver_1/><jXLogTrackingId/><Ver_2/>
<InstRtId>${escapeXml(config.instRtId)}</InstRtId><InstEnv>${escapeXml(config.instEnv || "PROD")}</InstEnv><Ver_3/>
<BusCorrelId/><Ver_4/><WorkflowCorrelId/><Ver_5/>
<ValidConsmName>${escapeXml(config.validConsmName)}</ValidConsmName><ValidConsmProd>${escapeXml(config.validConsmProd)}</ValidConsmProd><Ver_6/>
</jXchangeHdr>`;

/** Builds the SOAP 1.1 envelope. `extraHeader` carries search-only elements such as MaxRec. */
const buildEnvelope = (config, operation, body, headerName = "MsgRqHdr", extraHeader = "") => {
  if (!OPERATIONS[operation]) throw new Error(`Unsupported jXchange operation: ${operation}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body>
<jx:${operation} xmlns:jx="${NS}" xmlns="${NS}">
<${headerName}>${headerXml(config)}${extraHeader}</${headerName}>${body}
</jx:${operation}>
</soapenv:Body></soapenv:Envelope>`;
};

const accountBlock = (accountId, accountType) =>
  `<InAcctId><AcctId>${escapeXml(accountId)}</AcctId><AcctType>${escapeXml(accountType)}</AcctType></InAcctId>`;

const bodies = {
  AcctInq: ({ accountId, accountType }) => ({ body: accountBlock(accountId, accountType) }),
  AcctHistSrch: ({ accountId, accountType, limit, startDt, endDt }) => ({
    headerName: "SrchMsgRqHdr",
    extraHeader: `<MaxRec>${escapeXml(limit)}</MaxRec>`,
    body: `${accountBlock(accountId, accountType)}${startDt ? `<StartDt>${escapeXml(startDt)}</StartDt>` : ""}${endDt ? `<EndDt>${escapeXml(endDt)}</EndDt>` : ""}`
  }),
  CustInq: ({ customerId }) => ({ body: `<CustId>${escapeXml(customerId)}</CustId>` })
};

function post(config, agent, operation, envelope) {
  const url = new URL(config.endpointUrl);
  const secure = url.protocol === "https:";
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const request = (secure ? https : http).request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (secure ? 443 : 80),
        path: url.pathname + url.search,
        agent: secure ? agent : undefined,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"http://jackhenry.com/ws/${operation}"`,
          "Content-Length": Buffer.byteLength(envelope)
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          log("INFO", "SOAP_RESPONSE_RECEIVED", { operation, statusCode: response.statusCode, durationMs: Date.now() - started, bytes: body.length });
          resolve({ statusCode: response.statusCode, body });
        });
      }
    );
    request.setTimeout(Number(config.timeoutMs) || 8000, () => request.destroy(Object.assign(new Error("Upstream timeout"), { name: "TimeoutError" })));
    request.on("error", (err) => {
      log("WARN", err.code && /CERT|TLS|SSL/i.test(err.code) ? "MTLS_HANDSHAKE_ERROR" : "JXCHANGE_EGRESS_FAILED", { operation, code: err.code || err.name, message: err.message });
      reject(err);
    });
    log("INFO", "JXCHANGE_EGRESS_INIT", { operation, host: url.hostname });
    request.end(envelope);
  });
}

function createJxchange(config) {
  if (!config?.endpointUrl) throw new Error("createJxchange requires endpointUrl");
  const agent = config.clientCertPem
    ? new https.Agent({ cert: config.clientCertPem, key: config.clientKeyPem, keepAlive: true, rejectUnauthorized: true })
    : undefined;

  const send = async (operation, params) => {
    const draft = bodies[operation](params);
    const envelope = buildEnvelope(config, operation, draft.body, draft.headerName, draft.extraHeader);
    log("INFO", "SOAP_REQUEST_DISPATCHED", { operation, accountType: params.accountType });
    return { ...(await post(config, agent, operation, envelope)), operation };
  };

  return {
    accountInquiry: (params) => send("AcctInq", params),
    accountHistory: (params) => send("AcctHistSrch", params),
    customerInquiry: (params) => send("CustInq", params)
  };
}

/** Normalizers accept either a raw SOAP string or an already-parsed tree. */
const tree = (xml) => (typeof xml === "string" ? parse(xml) : xml);

/** Returns the SOAP fault, or null. Business faults are the only error shape jXchange guarantees. */
const faultOf = (xml) => {
  const fault = first(tree(xml), "Fault");
  if (!fault) return null;
  return {
    code: value(fault, "ErrCode") || value(fault, "faultcode") || "SOAP_FAULT",
    message: value(fault, "faultstring") || value(fault, "ErrDesc") || "jXchange fault"
  };
};

/** AcctInqResponse (deposit or loan) → vendor JSON. Field names come from the jXchange XSDs. */
const parseAccount = (xml, { accountId, accountType, coreType }) => {
  const root = tree(xml);
  const rec = first(root, "AcctInqResponse") || root;
  return {
    accountId: value(rec, "AcctId") || accountId,
    accountType: value(rec, "AcctType") || accountType,
    coreType,
    status: value(rec, "AcctStat"),
    statusDescription: value(rec, "AcctStatDesc"),
    balances: { current: amount(value(rec, "CurBal")), available: amount(value(rec, "AvlBal") ?? value(rec, "AvailBal")) },
    currency: "USD"
  };
};

/** AcctHistSrchResponse → vendor JSON. Deposit and loan history records are both supported. */
const parseHistory = (xml, { accountId }) => {
  const transactions = findAll(tree(xml), "AcctHistSrchRec").map((record) => {
    const entry = first(record, "DepHistSrchRec") || first(record, "LnHistSrchRec") || record;
    return {
      transactionId: value(entry, "HistRecId") || value(entry, "EFTTrnId") || value(entry, "SeqNum"),
      postDate: value(entry, "PostDt") || value(entry, "EffDt"),
      amount: amount(value(entry, "Amt")),
      description: value(entry, "TrnCodeDesc") || value(entry, "TrnStmtDesc") || value(entry, "SrcCodeDesc") || value(entry, "ACHCompEntryDesc"),
      type: value(entry, "TrnType")
    };
  });
  return { accountId, transactions };
};

/** CustInqResponse → vendor JSON. */
const parseCustomer = (xml, { customerId }) => {
  const root = tree(xml);
  const rec = first(root, "CustInqRec") || root;
  const person = first(rec, "PersonName");
  const addr = first(rec, "Addr") || first(rec, "AddrArray");
  const name = {
    first: value(person, "FirstName"),
    last: value(person, "LastName"),
    full: value(person, "ComName") || text(person)
  };
  return {
    customerId: value(rec, "CustId") || customerId,
    customerType: value(rec, "CustType") || (name.full ? "Business" : "Individual"),
    name: { first: name.first, last: name.last, full: name.full },
    address: {
      street: value(addr, "AddrLine1"),
      city: value(addr, "City"),
      state: value(addr, "State"),
      zip: value(addr, "PostalCode")
    }
  };
};

module.exports = { createJxchange, decodeSecret, buildEnvelope, faultOf, parseAccount, parseHistory, parseCustomer, soapAction: (op) => `http://jackhenry.com/ws/${op}` };
