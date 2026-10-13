function run(inputs) {
  const text = String(inputs.text ?? '');
  const words = text.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim()).length;
  const counts = {};
  for (const word of words) if (word.length > 3) counts[word] = (counts[word] || 0) + 1;
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([word, n]) => word + ' (' + n + ')').join(', ');
  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), '');
  return { statistics: [
    { Measure: 'Words', Value: words.length },
    { Measure: 'Sentences', Value: sentences },
    { Measure: 'Characters', Value: text.length },
    { Measure: 'Words per sentence', Value: sentences ? Math.round((words.length / sentences) * 10) / 10 : 0 },
    { Measure: 'Longest word', Value: longest || '-' },
    { Measure: 'Most used (4+ letters)', Value: common || '-' },
  ] };
}

// ── Run on its own ─────────────────────────────────────────────────────────
// "node code.js" runs this node on the example in input.js and prints what
// comes out. In a graph Tell & Wire runs this node, and this part is left out.
if (/^code(\.js)?$/.test(process.getBuiltinModule('node:path').basename(process.argv[1] ?? ''))) {
  const input = { exports: null };
  const file = process.getBuiltinModule('node:path').join(process.argv[1], '..', 'input.js');
  process.getBuiltinModule('node:vm').runInNewContext(process.getBuiltinModule('node:fs').readFileSync(file, 'utf8'), { module: input });
  const example = input.exports;
  if (!example || typeof example !== 'object' || Array.isArray(example)) throw new Error('input.js has no example yet -- an object keyed by input, written by ✨ Input.');
  const node = { llm: async () => { throw new Error('node.llm needs Tell & Wire: node backend/cli/main.ts run-node <project> <node id>'); } };
  Promise.resolve(run(example, node)).then((out) => console.log(JSON.stringify(out, null, 2)));
}
