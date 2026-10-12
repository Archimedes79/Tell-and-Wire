import { describe, it, expect } from 'vitest';
import { useGraphStore } from './graphStore';
import { NEW, rerouteEdges } from './scheduleActions';
import type { Graph, GraphNode } from '../graph';
import { baseNodeConfig } from '../model/baseNodeConfig';
import { gridOf } from '../model/scheduleLayout';
import { derivedNodePorts } from '../model/ports';
import { placesOf, tableLines } from '../../../../graph/schedule.ts';
import { readingWires } from '../../../../graph/order.ts';
import { registry } from '../../../../graph/nodes/registry.ts';

const node = (id: string, type: GraphNode['node_type'] = 'code'): GraphNode => ({
  id, node_type: type, label: id, description: '', position: { x: 0, y: 0 },
  inputs: [{ id: 'in', name: 'in', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }],
  outputs: [{ id: 'out', name: 'out', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }],
  config: baseNodeConfig(),
});
/** A data node holding the field n: its ports follow it. */
const memory = (id: string): GraphNode => {
  const held = node(id, 'data');
  held.config = { ...held.config, data_value: { n: 0 } } as never;
  return { ...held, ...derivedNodePorts(held) };
};
const wire = (from: string, to: string) => ({ id: `${from}.out -> ${to}.in`, source_node_id: from, source_port_id: 'out', target_node_id: to, target_port_id: 'in' });
const store = () => useGraphStore.getState();
const rows = () => tableLines(store().table);
const at = (id: string) => store().rfNodes.find((n) => n.id === id)!.position;
/** The wires that read a memory as it was when the round began, as the editor would save the graph. */
const reads = () => {
  const saved = store().exportGraph();
  return [...readingWires(saved.nodes, saved.edges, registry, placesOf(saved))];
};
const via = (id: string) => store().exportGraph().edges.find((edge) => edge.id === id)?.via;

/** a, then b and d beside each other, then c: a -> b -> c and a -> d -> c. */
function open(): void {
  store().loadGraph({
    metadata: { name: 'T', description: '', gui_scheme: 'night' },
    nodes: ['a', 'b', 'c', 'd'].map((id) => node(id)),
    edges: [wire('a', 'b'), wire('b', 'c'), wire('a', 'd'), wire('d', 'c')],
    schedule: ['a b c', '. d .'],
  } as Graph);
}

describe('the schedule in the store', () => {
  it('stands each card in the cell the table says, and a card made bigger moves what is after it', () => {
    open();
    expect([at('a'), at('b'), at('c'), at('d')]).toEqual([{ x: 70, y: 175 }, { x: 490, y: 175 }, { x: 910, y: 175 }, { x: 490, y: 401 }]);
    store().resizeCard('b', { width: 400, height: 200 });
    // Snapped to the dots of the canvas; the column after it moved over by what it grew.
    expect(store().rfNodes.find((n) => n.id === 'b')!.data.graphNode).toMatchObject({ width: 396, height: 198 });
    expect(at('c').x).toBe(910 + 396 - 260);
  });

  it('opens a column for a card held in the space between two, puts it there as one undo step, and pulls it to the nearest open cell elsewhere', () => {
    open();
    const grid = gridOf(store().table, new Map(), { row: true });
    // d is fed by a and feeds c: the space between columns 2 and 3 is open to it.
    store().aimCard('d', { x: (grid.cols[1].right + grid.cols[2].left) / 2, y: grid.rows[1].centre });
    expect(store().aim).toMatchObject({ opens: 2, target: { kind: 'gap', k: 2, r: 1 } });
    store().commit();
    store().dropCard('d');
    expect(rows()).toEqual(['a b . c', '. . d .']);
    store().undo();
    expect(rows()).toEqual(['a b c', '. d .']);
    // Left of a it may not stand: pulled to the nearest cell it may, in its own column.
    store().aimCard('d', { x: -500, y: 0 });
    expect(store().aim).toMatchObject({ opens: null, target: { kind: 'cell', c: 1, r: 1 } });
    store().clearAim();
    // From the palette, nothing limits it.
    store().aimCard(NEW, { x: grid.cols[0].left - 50, y: grid.rows[0].centre });
    expect(store().aim).toMatchObject({ opens: 0, target: { kind: 'gap', k: 0, r: 0 } });
    store().clearAim();
    expect(store().aim).toBeNull();
  });

  it('adds a node in a column of its own, closes up over what is deleted, moves a card right of what a new wire feeds it from, and thins out', () => {
    open();
    const added = store().addNode('code', { kind: 'gap', k: 1, r: 1 });
    expect(rows()).toEqual(['a .    b c', `. ${added} d .`]);
    store().deleteNodes([added]);
    expect(rows()).toEqual(['a b c', '. d .']);
    store().connect({ source: 'b', sourceHandle: 'out', target: 'd', targetHandle: 'in' });
    expect(rows()).toEqual(['a b . c', '. . d .']);
    expect(store().thinOut()).toBe('Thinned out: 4 columns, 2 rows became 4 columns, 1 row.');
    expect(rows()).toEqual(['a b d c']);
    expect(store().thinOut()).toBe('Already thin: 4 columns, 1 row.');
  });

  it('routes a wire through a cell, keeps the route with the cell when columns move, and takes it off on request', () => {
    open();
    const edge = 'a.out -> c.in';
    store().connect({ source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in' });
    const grid = gridOf(store().table, new Map(), { row: true });
    // Pulled to the row below the table, in the column between a and c.
    store().pullWire(edge, { x: grid.cols[1].centre, y: 1000 });
    expect(store().pulling).toEqual({ edge, cell: { column: 1, row: 2 } });
    store().endPull(true);
    expect(via(edge)).toEqual(['B3']);
    // d goes up into a column of its own: the table is one row high now, and the route stays just below it.
    store().aimCard('d', { x: grid.cols[1].right + 100, y: 0 });
    store().dropCard('d');
    expect(rows()).toEqual(['a b d c']);
    expect(via(edge)).toEqual(['B2']);
    store().routeWire(edge, null);
    expect(via(edge)).toBeUndefined();
  });

  it('adds no undo step for what changes nothing -- a card let go in its own cell, a click on the grip, a route set where it is -- and thins out nothing round a loop', () => {
    open();
    const steps = () => store().past.length;
    const grid = gridOf(store().table, new Map(), { row: true });
    const start = steps();
    store().aimCard('d', { x: grid.cols[1].centre, y: grid.rows[1].centre });
    store().dropCard('d');
    expect(steps()).toBe(start);
    // A click on the grip ends at the size it began with: not a resize.
    store().resizeCard('b', { width: 400, height: 200 });
    store().resizeCard('b', { width: 396, height: 198 });
    expect(steps()).toBe(start + 1);

    store().connect({ source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in' });
    const edge = 'a.out -> c.in';
    const wired = steps();
    store().routeWire(edge, { column: 1, row: 2 });
    store().routeWire(edge, { column: 1, row: 2 });
    expect(steps()).toBe(wired + 1);

    // A wire back that no memory closes goes round: nothing to thin out to, and the table is left as it is.
    store().connect({ source: 'c', sourceHandle: 'out', target: 'a', targetHandle: 'in' });
    const table = rows();
    expect(store().thinOut()).toMatch(/^Cannot thin out/);
    expect(rows()).toEqual(table);
  });

  it('keeps a route only in a column between the ends of its wire: a card moved past it leaves it behind', () => {
    const table = [['b', 'x', 'd', 'c'], [null, null, null, null], [null, null, null, null]];
    const moved = { table, column: (c: number) => c, row: (r: number) => r };
    const wire = (via: string[]) => ({ id: 'e', source: 'x', target: 'c', data: { via } });
    expect(rerouteEdges([wire(['C3'])], moved)[0].data).toEqual({ via: ['C3'] });
    // B3 is x's own column, and A3 left of it: neither is between x and c.
    expect(rerouteEdges([wire(['B3'])], moved)[0].data).toBeUndefined();
    expect(rerouteEdges([wire(['A3'])], moved)[0].data).toBeUndefined();
  });

  it('lets where a card stands decide what a wire from a memory carries: before the memory it reads it as the round began, after it what it holds then', () => {
    const edges = [
      { id: 'm.n -> add.in', source_node_id: 'm', source_port_id: 'n', target_node_id: 'add', target_port_id: 'in' },
      { id: 'add.out -> m.n', source_node_id: 'add', source_port_id: 'out', target_node_id: 'm', target_port_id: 'n' },
    ];
    store().loadGraph({ metadata: { name: 'T', description: '', gui_scheme: 'night' }, nodes: [node('add'), memory('m')], edges } as Graph);
    // The loop closes by the wire back to what writes the memory, which stands before it.
    expect(rows()).toEqual(['add m']);
    expect(reads()).toEqual(['m.n -> add.in']);
    // A wire to a card left of the memory is a read too, and moves nothing.
    const peek = store().addNode('code', { kind: 'gap', k: 0, r: 0 });
    store().connect({ source: 'm', sourceHandle: 'n', target: peek, targetHandle: 'in' });
    expect(rows()).toEqual([`${peek} add m`]);
    expect(reads()).toEqual(['m.n -> add.in', `m.n -> ${peek}.in`]);
    // Thinning out puts the two that only read side by side -- and both stay before the memory, reading it as the round began.
    expect(store().thinOut()).toMatch(/^Thinned out: /);
    expect(reads()).toEqual(['m.n -> add.in', `m.n -> ${peek}.in`]);
    store().undo();
    expect(rows()).toEqual([`${peek} add m`]);
    // The card that only reads may be pulled right of the memory: the same wire then carries what the memory holds after the round's writes.
    const grid = gridOf(store().table, new Map(), { row: true });
    store().commit();
    store().aimCard(peek, { x: grid.cols[2].right + 500, y: grid.rows[0].centre });
    store().dropCard(peek);
    expect(rows()).toEqual(['add m ' + peek]);
    expect(reads()).toEqual(['m.n -> add.in']);
    // Not into the memory's own column, which is neither before it nor after it: pulled to the nearest cell that is.
    store().aimCard(peek, { x: grid.cols[1].centre, y: grid.rows[0].centre });
    expect(store().aim?.target).not.toMatchObject({ kind: 'cell', c: 1 });
    store().clearAim();
    // And back before it: the wire reads the memory again.
    store().commit();
    store().aimCard(peek, { x: grid.cols[0].left - 300, y: grid.rows[0].centre });
    store().dropCard(peek);
    expect(rows()).toEqual([`${peek} add m`]);
    expect(reads()).toEqual(['m.n -> add.in', `m.n -> ${peek}.in`]);
    store().aimCard(peek, { x: grid.cols[2].right + 500, y: grid.rows[0].centre });
    store().dropCard(peek);
    // The card that writes it may not: it stays before it.
    store().aimCard('add', { x: grid.cols[2].right + 500, y: grid.rows[0].centre });
    store().dropCard('add');
    expect(rows()).toEqual(['add m ' + peek]);
  });
});
