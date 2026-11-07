const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parse, first, findAll, text, value, escapeXml } = require("../src/xml");

const DOC = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <AcctInqResponse xmlns="http://jackhenry.com/jxchange/TPG/2008">
      <MsgRsHdr><SentRec>1</SentRec></MsgRsHdr>
      <Rec id="7">
        <AcctId>123456789</AcctId>
        <CurBal>1,250.75</CurBal>
        <Empty></Empty>
        <Note><![CDATA[Fee &amp; interest]]></Note>
        <SelfClosing/>
        <Label>AT&amp;T</Label>
      </Rec>
      <Rec><AcctId>987</AcctId></Rec>
    </AcctInqResponse>
  </s:Body>
</s:Envelope>`;

test("parses namespaced documents and ignores the prolog", () => {
  const root = parse(DOC);
  assert.equal(value(root, "AcctId"), "123456789");
  assert.equal(root.children[0].local, "Envelope");
});

test("finds repeated nodes and reads attributes", () => {
  const records = findAll(parse(DOC), "Rec");
  assert.equal(records.length, 2);
  assert.equal(records[0].attrs.id, "7");
  assert.equal(value(records[1], "AcctId"), "987");
});

test("decodes entities, CDATA, and empty elements", () => {
  const root = parse(DOC);
  assert.equal(value(root, "Label"), "AT&T");
  assert.equal(text(first(root, "Note")), "Fee & interest");
  assert.equal(value(root, "Empty"), null);
  assert.equal(first(root, "Missing"), null);
});

test("escapes every XML-significant character", () => {
  assert.equal(escapeXml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
});
