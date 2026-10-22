function run(inputs, node) {
  const palette = { Blue: ['#2563eb', '#dbeafe'], Green: ['#15803d', '#dcfce7'], Orange: ['#c2410c', '#ffedd5'] };
  const [strong, soft] = palette[inputs.colour] ?? palette.Blue;
  const room = node.window.shows[0];
  const W = Math.max(240, room.width), H = Math.max(120, room.height);
  const name = String(inputs.name || 'Your name').slice(0, 24).replace(/[<&>]/g, '');
  const level = Math.max(1, Math.min(5, Math.round(Number(inputs.level) || 3)));
  const stars = Array.from({ length: 5 }, (_, i) => '<text x="' + (W / 2 - 60 + i * 30) + '" y="' + (H - 22) + '" font-size="26" text-anchor="middle" fill="' + (i < level ? strong : '#cbd5e1') + '">&#9733;</text>').join('');
  return { badge: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" font-family="Segoe UI, Arial, sans-serif">'
    + '<rect width="' + W + '" height="' + H + '" rx="18" fill="' + soft + '"/>'
    + '<rect x="0" y="0" width="' + W + '" height="34" rx="18" fill="' + strong + '"/><rect x="0" y="16" width="' + W + '" height="18" fill="' + strong + '"/>'
    + '<text font-family="sans-serif" x="' + (W / 2) + '" y="23" font-size="15" font-weight="700" text-anchor="middle" fill="#ffffff">MEMBER</text>'
    + '<text x="' + (W / 2) + '" y="' + (H / 2 + 14) + '" font-size="30" font-weight="700" text-anchor="middle" fill="#0f172a">' + name + '</text>'
    + stars + '</svg>' };
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
