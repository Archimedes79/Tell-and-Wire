import { describe, expect, it } from 'vitest';
import type { ExecutionResult } from '../document/graph';
import { explain, reportText, runReport } from './runReport';

const nodes = [{ id: 'read', label: 'Read file' }, { id: 'ask', label: 'Summarize' }, { id: 'end', label: 'Result' }];

const failedRun: ExecutionResult = {
  status: 'error',
  outputs: {},
  node_results: [
    { node_id: 'read', status: 'success', inputs: {}, outputs: { text: 'A long story about a lighthouse keeper.' } },
    { node_id: 'ask', status: 'error', inputs: { text: 'A long story' }, outputs: {}, error: 'fetch failed: connect ECONNREFUSED 127.0.0.1:11434' },
    { node_id: 'end', status: 'skipped', inputs: {}, outputs: {}, messages: ['Summarize failed, so there was nothing to show.'] },
  ],
};

describe('what an error comes to', () => {
  it('says what to look at for the errors people meet, and that it is the node for the rest', () => {
    expect(explain('Ollama is not running at http://localhost:11434')).toContain('could not be reached');
    expect(explain('Could not reach localhost:11434. Is the server running?')).toContain('could not be reached');
    expect(explain('Request failed with status 401 Unauthorized')).toContain('key');
    expect(explain('429 Too Many Requests')).toContain('too many requests');
    expect(explain('ENOENT: no such file or directory, open x.txt')).toContain('not found');
    expect(explain('Unexpected end of JSON input')).toContain('JSON');
    expect(explain('x is not defined')).toContain('mistake');
    expect(explain('something odd')).toContain('The node reported an error');
  });
});

describe('the report of a run', () => {
  it('names where it stopped, in words, and the nodes after it as not having run', () => {
    const report = runReport(failedRun, nodes);
    expect(report.failed).toMatchObject({ id: 'ask', label: 'Summarize', status: 'error' });
    expect(report.summary).toContain('"Summarize" failed');
    expect(report.summary).toContain('could not be reached');
    expect(report.nodes.map((node) => node.status)).toEqual(['success', 'error', 'skipped']);
    expect(report.nodes[2].plain).toBe('Summarize failed, so there was nothing to show.');
  });

  it('says a run that went well, and one that was stopped', () => {
    const well = runReport({ status: 'success', outputs: {}, node_results: [{ node_id: 'read', status: 'success', inputs: {}, outputs: {} }] }, nodes);
    expect(well.summary).toBe('It went well: 1 of 1 nodes ran.');
    expect(runReport({ status: 'cancelled', outputs: {}, node_results: [] }, nodes).summary).toContain('stopped');
  });

  it('is plain text that carries no data of the person unless asked to', () => {
    const report = runReport(failedRun, nodes);
    const without = reportText(report, { tool: 'Summarizer', ai: 'ollama / llama3', withData: false });
    expect(without).toContain('Tool: Summarizer');
    expect(without).toContain('2. [FAILED] Summarize');
    expect(without).toContain('ECONNREFUSED');
    expect(without).not.toContain('lighthouse');
    const withData = reportText(report, { tool: 'Summarizer', ai: 'ollama / llama3', withData: true });
    expect(withData).toContain('text: A long story about a lighthouse keeper.');
  });

  it('cuts what is very long, and says how much it left out', () => {
    const long = runReport({ status: 'error', outputs: {}, node_results: [{ node_id: 'ask', status: 'error', inputs: {}, outputs: {}, error: 'x'.repeat(5000) }] }, nodes);
    expect(long.failed?.error).toContain('3500 more characters');
  });
});
