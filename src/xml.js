/** Zero-dependency XML reader for jXchange SOAP bodies. Namespace prefixes are ignored on purpose. */
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>/g;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const decode = (text) =>
  String(text).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === "#") {
      const hex = code[1] === "x" || code[1] === "X";
      return String.fromCodePoint(parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10));
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

const escapeXml = (value) =>
  String(value ?? "").replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));

const local = (name) => name.split(":").pop();

/** Parses a document into { name, local, attrs, children, text }. Never throws on unknown markup. */
function parse(xml) {
  const root = { name: "#document", local: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let last = 0;
  let match;
  TAG.lastIndex = 0;
  while ((match = TAG.exec(String(xml)))) {
    const text = String(xml).slice(last, match.index);
    if (text.trim()) stack[stack.length - 1].text += text;
    last = TAG.lastIndex;
    if (match[5] !== undefined) {
      stack[stack.length - 1].text += match[5];
      continue;
    }
    if (!match[2]) continue;
    if (match[1] === "/") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    for (const attr of match[3].matchAll(ATTR)) attrs[local(attr[1])] = decode(attr[2] ?? attr[3] ?? "");
    const node = { name: match[2], local: local(match[2]), attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!match[4]) stack.push(node);
  }
  return root;
}

const findAll = (node, name, out = []) => {
  for (const child of node?.children || []) {
    if (child.local === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
};
const first = (node, name) => findAll(node, name)[0] || null;
/** Trimmed, entity-decoded text of a node itself (not its descendants). */
const text = (node) => (node ? decode(node.text).trim() || null : null);
const value = (node, name) => text(first(node, name));

module.exports = { parse, findAll, first, text, value, escapeXml, decode };
