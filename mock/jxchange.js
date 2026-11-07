/** Local fake jXchange ServiceGateway. SOAP in, fixture SOAP out. Never deploy this. */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const FIXTURES = path.join(__dirname, "..", "fixtures");
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const envelope = (body) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${body}</s:Body></s:Envelope>`;
const fault = (message, code = "AcctInq.NotFound") =>
  envelope(
    `<s:Fault><faultcode>s:Client</faultcode><faultstring>${message}</faultstring><detail><jx:ErrRec xmlns:jx="http://jackhenry.com/jxchange/TPG/2008"><jx:ErrCode>${code}</jx:ErrCode></jx:ErrRec></detail></s:Fault>`
  );
const fill = (xml, values) => xml.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match);

/** Accounts: 123456789 (normal), 0002235555550015 (normal), 987654321 (empty balances), 000000000 (fault). */
function createMockJxchange() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const operation = /<(?:[a-z]+:)?(AcctInq|AcctHistSrch|CustInq)\b/.exec(body)?.[1];
      const acctId = /<(?:[a-z]+:)?AcctId>([^<]*)</.exec(body)?.[1] || "";
      const acctType = /<(?:[a-z]+:)?AcctType>([^<]*)</.exec(body)?.[1] || "D";
      const custId = /<(?:[a-z]+:)?CustId>([^<]*)</.exec(body)?.[1] || "";
      requests.push({ operation, acctId, acctType, custId, body });

      const send = (status, xml) => {
        res.writeHead(status, { "Content-Type": "text/xml; charset=utf-8" });
        res.end(xml);
      };

      if (operation === "AcctInq") {
        if (acctId === "000000000") return send(500, fault(`No account found for AcctId ${acctId}.`));
        if (acctId === "ERROR500") return send(500, "upstream failure");
        const empty = acctId === "987654321";
        return send(
          200,
          envelope(
            fill(fixture("acctinq.xml"), {
              ACCT_ID: acctId || "123456789",
              ACCT_TYPE: acctType,
              CUR_BAL: empty ? "" : "5420.50",
              AVL_BAL: empty ? "" : "5310.25"
            })
          )
        );
      }
      if (operation === "AcctHistSrch") {
        if (acctId === "000000000") return send(500, fault("No account found.", "AcctHistSrch.NotFound"));
        return send(200, envelope(fill(fixture("accthist.xml"), { ACCT_ID: acctId })));
      }
      if (operation === "CustInq") {
        if (custId.startsWith("NONE")) return send(500, fault("No customer record found.", "CustInq.NotFound"));
        return send(200, envelope(fill(fixture("custinq.xml"), { CUST_ID: custId })));
      }
      return send(500, fault("Unsupported operation.", "Gateway.Unsupported"));
    });
  });

  return {
    requests,
    listen: (port = 0) =>
      new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}` }))),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

module.exports = { createMockJxchange };
