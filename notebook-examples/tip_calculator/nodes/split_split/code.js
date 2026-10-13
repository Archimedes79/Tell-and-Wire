function run(inputs) {
  const bill = Number(inputs.bill) || 0, share = Number(String(inputs.tip).replace('%', '')) || 0, people = Math.max(1, Math.round(Number(inputs.people) || 1));
  const tip = Math.round(bill * share) / 100, total = Math.round((bill + tip) * 100) / 100;
  return { split: [
    { Item: 'Bill', Amount: bill },
    { Item: 'Tip (' + share + ' %)', Amount: tip },
    { Item: 'Total', Amount: total },
    { Item: 'Each of ' + people, Amount: Math.round((total / people) * 100) / 100 },
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
