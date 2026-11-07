const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { createJxchange, decodeSecret, buildEnvelope, faultOf, parseAccount, parseHistory, parseCustomer, soapAction } = require("../src/jxchange");

const CONFIG = {
  endpointUrl: "https://jxchange.example.com/jxchange/2008/ServiceGateway/ServiceGateway.svc",
  instRtId: "011001276",
  instEnv: "TEST",
  validConsmName: "BANK_PARTNER_APP",
  validConsmProd: "GATEWAY",
  auditUsrId: "API_GATEWAY",
  auditWsId: "AWS_GATEWAY"
};
const fixture = (name) => fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");

test("builds a SOAP 1.1 envelope with the required jXchange header", () => {
  const envelope = buildEnvelope(CONFIG, "AcctInq", "<InAcctId><AcctId>123</AcctId><AcctType>D</AcctType></InAcctId>");
  assert.match(envelope, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(envelope, /soapenv:Envelope/);
  assert.match(envelope, /<jx:AcctInq xmlns:jx="http:\/\/jackhenry.com\/jxchange\/TPG\/2008"/);
  assert.match(envelope, /<MsgRqHdr><jXchangeHdr>/);
  assert.match(envelope, /<InstRtId>011001276<\/InstRtId>/);
  assert.match(envelope, /<InstEnv>TEST<\/InstEnv>/);
  assert.match(envelope, /<ValidConsmName>BANK_PARTNER_APP<\/ValidConsmName>/);
  assert.match(envelope, /<ValidConsmProd>GATEWAY<\/ValidConsmProd>/);
  assert.match(envelope, /<AcctId>123<\/AcctId>/);
});

test("escapes header values instead of interpolating raw XML", () => {
  const envelope = buildEnvelope({ ...CONFIG, validConsmName: "</jx:Hdr><Injected/>" }, "AcctInq", "");
  assert.ok(!envelope.includes("<Injected/>"));
  assert.match(envelope, /&lt;\/jx:Hdr&gt;/);
});

test("uses the documented SoapAction and rejects unknown operations", () => {
  assert.equal(soapAction("AcctInq"), "http://jackhenry.com/ws/AcctInq");
  assert.equal(soapAction("AcctHistSrch"), "http://jackhenry.com/ws/AcctHistSrch");
  assert.throws(() => buildEnvelope(CONFIG, "TrnAdd", ""), /Unsupported jXchange operation/);
});

test("requires an endpoint URL", () => {
  assert.throws(() => createJxchange({}), /requires endpointUrl/);
});

test("decodes base64 PEM material from the secret", () => {
  const config = decodeSecret({ clientCertBase64: Buffer.from("CERT").toString("base64"), clientKeyBase64: Buffer.from("KEY").toString("base64") });
  assert.equal(config.clientCertPem, "CERT");
  assert.equal(config.clientKeyPem, "KEY");
});

test("normalizes AcctInqResponse including balances and status", () => {
  const xml = fixture("acctinq.xml").replace(/\{\{(\w+)\}\}/g, (match, key) => ({ ACCT_ID: "123456789", ACCT_TYPE: "D", CUR_BAL: "5420.50", AVL_BAL: "5310.25" }[key] ?? match));
  const account = parseAccount(xml, { accountId: "123456789", accountType: "D", coreType: "SILVERLAKE" });
  assert.deepEqual(account, {
    accountId: "123456789",
    accountType: "D",
    coreType: "SILVERLAKE",
    status: "1",
    statusDescription: "Active",
    balances: { current: 5420.5, available: 5310.25 },
    currency: "USD"
  });
});

test("normalizes AcctHistSrchResponse transactions", () => {
  const { transactions } = parseHistory(fixture("accthist.xml"), { accountId: "123456789" });
  assert.equal(transactions.length, 3);
  assert.deepEqual(transactions[0], {
    transactionId: "TX-998811",
    postDate: "2026-10-28",
    amount: -45.2,
    description: "ACH DEBIT UTILITY CO",
    type: "D"
  });
  assert.equal(transactions[2].description, "DEBIT CARD PURCHASE");
});

test("normalizes CustInqResponse name and address", () => {
  const customer = parseCustomer(fixture("custinq.xml").replace("{{CUST_ID}}", "CUST-443322"), { customerId: "CUST-443322" });
  assert.equal(customer.customerId, "CUST-443322");
  assert.equal(customer.customerType, "Individual");
  assert.deepEqual(customer.name, { first: "Jane", last: "Doe", full: null });
  assert.deepEqual(customer.address, { street: "456 Oak Ave", city: "Austin", state: "TX", zip: "78701" });
});

test("detects SOAP faults and prefers the jXchange error code", () => {
  const fault = faultOf(`<s:Envelope><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>No account found.</faultstring>
    <detail><jx:ErrRec><jx:ErrCode>AcctInq.NotFound</jx:ErrCode></jx:ErrRec></detail></s:Fault></s:Body></s:Envelope>`);
  assert.deepEqual(fault, { code: "AcctInq.NotFound", message: "No account found." });
  assert.equal(faultOf(fixture("acctinq.xml")), null);
});
