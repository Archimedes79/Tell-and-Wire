function run(inputs) {
  const lines = String(inputs.sales ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) => line.split(',')).map(([month, region, orders, revenue]) => ({ month, region, orders: Number(orders), revenue: Number(revenue) }));
  if (!rows.length) return { kpis: [] };
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const last = months[months.length - 1], before = months[months.length - 2];
  const sum = (list, key) => list.reduce((total, row) => total + row[key], 0);
  const percent = (now, then) => (then ? (now >= then ? '+' : '') + ((now / then - 1) * 100).toFixed(1) + ' %' : '-');
  const line = (name, mine) => {
    const orders = sum(mine, 'orders'), revenue = sum(mine, 'revenue');
    return { Region: name, Revenue: Math.round(revenue), Orders: orders, 'Average order': Math.round((revenue / orders) * 100) / 100, 'Growth on previous month': percent(sum(mine.filter((row) => row.month === last), 'revenue'), sum(mine.filter((row) => row.month === before), 'revenue')) };
  };
  const regions = [...new Set(rows.map((row) => row.region))];
  return { kpis: [...regions.map((name) => line(name, rows.filter((row) => row.region === name))), line('Total', rows)] };
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
