// Split streamed text into complete sentences for TTS.
const ABBREV = /(?:^|\s)(?:ca|t\.ex|bl\.a|kr|st|nr|mm|osv|dvs|resp|inkl|exkl|ev|jfr|s\.k)\.$/i;

export function splitSentences(buffer) {
  const sentences = [];
  let start = 0;
  const re = /[.?!…]+(?=\s)/g;
  let m;
  while ((m = re.exec(buffer))) {
    const end = m.index + m[0].length;
    const candidate = buffer.slice(start, end).trim();
    if (m[0] === '.' && ABBREV.test(candidate)) continue;
    // next char after whitespace should start a new sentence (capital, digit or quote)
    const after = buffer.slice(end).trimStart();
    if (after && !/^[A-ZÅÄÖ0-9"”«(–-]/.test(after)) continue;
    if (!after) break; // can't be sure until more text arrives
    if (candidate) sentences.push(candidate);
    start = end;
  }
  return { sentences, rest: buffer.slice(start).trimStart() };
}
