// What the model is told before it designs a whole graph.
//
// Its own file because it is prose, not logic, and prose has to be readable to
// be corrected.
//
// The shape of the document alone gets a graph that parses and does nothing:
// code in a key no element reads, edges wired to port names a folder node
// never emits, because some ports are derived by the engine rather than taken
// from the document. So the facts below are the ones a graph is *wrong* without.

import { registry } from '../../elements/registry.ts';
import { pageAuthorNote } from '../../elements/page.ts';

/**
 * The kinds a generated graph may use, each with what its own class says about
 * its settings (`NodeRunner.graphAuthorNote`). A kind that says nothing is left
 * out -- a subgraph is built by hand -- and a new one appears here by being written.
 */
const AUTHORED = registry.nodeTypes()
  .map((type) => [type, registry.node(type)?.graphAuthorNote()] as const)
  .filter((entry): entry is readonly [string, string] => !!entry[1]);
const NODE_TYPES = AUTHORED.map(([type]) => type).join(', ');

const SHAPE = `You are an expert at authoring Graph DSL documents for a visual node-based AI workflow tool. When asked to design a graph, output ONLY a fenced \`\`\`json code block containing a complete Graph DSL document, followed by a brief explanation outside the block. Do not add extra prose before the code block.

The JSON document must have this exact shape:
{
  "metadata": {"name": str, "description": str},
  "nodes": [
    {
      "id": str, "node_type": str, "label": str, "description": str,
      "position": {"x": number, "y": number},
      "inputs": [{"id": str, "name": str, "kind": "input", "data_type": str, "multi": bool, "required": bool, "field": str (optional)}, ...],
      "outputs": [{"id": str, "name": str, "kind": "output", "data_type": str, "multi": bool, "required": bool}, ...],
      "config": {...}
    }, ...
  ],
  "edges": [{"id": str, "source_node_id": str, "source_port_id": str, "target_node_id": str, "target_port_id": str}, ...],
  "page": {"blocks": [...]}
}
"page" is left out for a graph nobody uses through a page.

Valid node_type values: ${NODE_TYPES}. What each one keeps in its config is said below. There is no dedicated merge/split node type: fan-in (multiple edges into one multi input port) and fan-out (one output wired to many inputs) are pure edge wiring, and any merge/split-style aggregation (concat/sum/count/json_list a set of inputs, or splitting text into a list) should be written as a "code" node. Every node must declare its own inputs and outputs port arrays, even if empty, and every port id must be unique within its node. Edges must reference existing node ids and port ids declared on those nodes.`;

/**
 * What a node is before anything else: a heading and a sentence. The rest of
 * a code, ai or data node is written from that sentence, so a node without one
 * is a node nobody can finish.
 */
const NODE_WORDS = `Every node is its label and its description: the label a short heading, the description one or two sentences saying in plain words what the node does. A person reads them on the canvas, and a code, ai or data node has what it holds or runs written from its description.`;

/**
 * Where a round starts and what it is started with: one package, read by the
 * node it reaches. Without this a generated tool wires a block's field
 * straight to a node, which no wire can carry, and the node is handed nothing.
 */
const EVENTS = `A graph starts at its start points. A "start" node is one: it starts the graph AT THE NODES ITS "data" IS WIRED TO, and runs what follows from them plus what they need -- started by the page (a block whose "fires" names it), by a call, or by itself on a clock. Its "data" is ONE package for everything the round is started with: {"event": {"name": the start point's id, "by": the block that fired it} or null, "values": {"<block id>": what that block sends, ...}} -- the data of every block whose "sends_to" names the start point; a call sends values under names of its own. A start point is the ONE way into a graph: there is no input node, a constant the graph holds is a "data" node, and whatever a person or a caller gives arrives in a start point's package. Blocks never add wires: wire "data" into each input that needs something of the package, and let the INPUT say what it takes: "field": "<block id>" hands it that block's value alone -- or a path inside it, "file.content" -- so a code node reads it as inputs.<port> and an ai node is shown only it. An input without a field is handed the whole package. Every node also accepts edges into the special target port "__run", its GATE: a node with a wired "__run" runs only in a round that opens it, and keeps its last outputs otherwise; wired from a start point's "data", it opens in the rounds that start point begins. Several edges into "__run" are OR-ed. To decide with code what runs, return booleans from a code node and wire them into other nodes' "__run": only the value true opens a gate. "__run" is NOT declared in the node's inputs, and what arrives on it is never passed to the node.`;

/** Where each node type keeps the thing it actually does: one line from every kind, and what only two of them share. */
const FILE_WORK = `- code and ai, working on FILES: a file picker on the page sends the chosen file as {"path", "content"}, the content already read. The node that works on the text takes it with an input whose "field" is "<picker id>.content", whatever the input is called, typed "text"; a node that needs where the file is -- to name it, copy it or write beside it -- takes "<picker id>.path". A directory picker sends the paths of the folder's files, a list. An input typed "file_path" is handed each file's TEXT instead of its path: the path, or each path of a list, is read before the node runs. So "do X to every file of a folder" is ONE code or ai node whose input has "field": "<picker id>", is typed "file_path" and marked "multi", with config.batch_mode = "per_item": it runs ONCE PER FILE, its results collected into a list; with batch_mode = "whole_list" it runs once and gets the whole list. The same holds for a folder node's "files". Never add a second node to read the files, and never read files yourself in code.`;

const CONFIG_KEYS = `Where each node type keeps what it does. Put it anywhere else and the node will run and produce nothing:
${[...AUTHORED.map(([type, note]) => `- ${type}: ${note}`), FILE_WORK].join('\n')}`;

/** The page: blocks that connect themselves by name, every kind with what it says of itself. */
const PAGE = pageAuthorNote();

/**
 * The rule a graph is useless without.
 *
 * A generated graph that computes correctly and ends in nothing shows the
 * person who ran it a blank screen, and reads as "the tool does not work".
 */
const MUST_SHOW = `Every graph must end in something a person can see. A run computes values and then stops; unless a node hands them on, the answer exists only inside the run and the tool looks broken. So the last node of every branch must be an "end" node, an end point: what arrives there is the run's result, shown to whoever ran the graph under the node's label -- and on the page, on the block whose "shows" names it. Give each end point a label of its own; with config.write_mode = "file" or "directory" it is also written to a file. Never leave a code or ai node as the end of a branch: its result would go nowhere.`;

/**
 * The ports the engine derives rather than reads.
 *
 * These names are not a convention a graph may choose: the kinds that derive
 * their ports say which above, from the code that derives them, and an edge
 * naming anything else is attached to a port that will never carry a value.
 */
const DERIVED_PORTS = `Where a node type's ports are DERIVED by the engine from its settings -- as said above for the ones that do -- declare exactly those ports, or the edges will carry nothing. Every other node type names its own ports, and a code node's returned keys must match its output port ids exactly.`;

/**
 * One worked document.
 *
 * A small local model follows an example it can copy far better than a
 * paragraph of rules it has to apply -- and this one exercises what goes
 * wrong most: a derived port name, an input that takes one value of the
 * package by its field, code whose returned key matches the port it is wired
 * from, and a page whose blocks connect by name.
 */
const EXAMPLE = `A complete, working example:
\`\`\`json
{
  "metadata": {"name": "Count rows", "description": ""},
  "nodes": [
    {"id": "count", "node_type": "start", "label": "Count", "description": "The page's Count button starts it.",
     "position": {"x": 80, "y": 120},
     "inputs": [],
     "outputs": [{"id": "data", "name": "Data", "kind": "output", "data_type": "json", "multi": false, "required": false}],
     "config": {"started_by": "page"}},
    {"id": "rows", "node_type": "code", "label": "Count rows", "description": "Count the lines of the text.",
     "position": {"x": 420, "y": 120},
     "inputs": [{"id": "csv", "name": "CSV", "kind": "input", "data_type": "text", "multi": false, "required": false, "field": "csv"}],
     "outputs": [{"id": "rows", "name": "Rows", "kind": "output", "data_type": "number", "multi": false, "required": false}],
     "config": {"code": "function run(inputs) { const text = String(inputs.csv ?? '').trim(); return { rows: text ? text.split('\\\\n').length : 0 }; }"}},
    {"id": "shown", "node_type": "end", "label": "Rows", "description": "",
     "position": {"x": 760, "y": 120},
     "inputs": [{"id": "value", "name": "Value", "kind": "input", "data_type": "any", "multi": false, "required": false}],
     "outputs": [],
     "config": {}}
  ],
  "edges": [
    {"id": "e1", "source_node_id": "count", "source_port_id": "data", "target_node_id": "rows", "target_port_id": "csv"},
    {"id": "e2", "source_node_id": "rows", "source_port_id": "rows", "target_node_id": "shown", "target_port_id": "value"}
  ],
  "page": {"blocks": [
    {"id": "csv", "kind": "text_io", "label": "CSV", "mode": "input", "w": 16, "h": 6, "sends_to": ["count"]},
    {"id": "go", "kind": "button", "label": "Count", "w": 4, "h": 2, "fires": "count"},
    {"id": "result", "kind": "text_io", "label": "Rows", "mode": "output", "w": 16, "h": 2, "shows": "shown"}
  ]}
}
\`\`\``;

export const GRAPH_SYSTEM = [SHAPE, NODE_WORDS, EVENTS, CONFIG_KEYS, PAGE, MUST_SHOW, DERIVED_PORTS, EXAMPLE].join('\n\n');
