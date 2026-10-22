/**
 * Net pay from gross pay. The tax rule is in tax.js and the bonus in rates.json: both stand beside this file.
 * @param {import('./input_example.js').Input} inputs
 * @returns {import('./output.js').Output}
 */
function run(inputs) {
  const tax = require('./tax.js');
  const rates = require('./rates.json');
  return { net: tax.net(Number(inputs.gross)) + rates.bonus };
}

// ── Run on its own ─────────────────────────────────────────────────────────
// "node code.js" runs this node on the example in input_example.js and prints what
// comes out. In a graph Tell & Wire runs this node, and this part is left out.
if (/^code(\.js)?$/.test(process.getBuiltinModule('node:path').basename(process.argv[1] ?? ''))) {
  const input = { exports: null };
  const file = process.getBuiltinModule('node:path').join(process.argv[1], '..', 'input_example.js');
  process.getBuiltinModule('node:vm').runInNewContext(process.getBuiltinModule('node:fs').readFileSync(file, 'utf8'), { module: input });
  const example = input.exports;
  if (!example || typeof example !== 'object' || Array.isArray(example)) throw new Error('input_example.js has no example yet -- an object keyed by input, written by ✨ Input.');
  const node = { windows: [], llm: async () => { throw new Error('node.llm needs Tell & Wire: node backend/cli/main.ts run-node <project> <node id>'); } };
  Promise.resolve(run(example, node)).then((out) => console.log(JSON.stringify(out, null, 2)));
}
