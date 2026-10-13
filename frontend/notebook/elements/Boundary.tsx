import { Component, type ReactNode } from 'react';

/**
 * A box that shows something a step made, and cannot be taken down by it. What arrives in an output is whatever a cell wrote -- a code step may
 * hand on anything -- so drawing it can fail; without this a render that throws takes the whole page with it, and what was typed and not yet saved.
 * It says so in the place of the output, and draws again when the value changes.
 */
export default class Boundary extends Component<{ children?: ReactNode; value?: unknown }, { failed: string | null; seen: unknown }> {
  state = { failed: null as string | null, seen: this.props.value };

  static getDerivedStateFromError(error: unknown): { failed: string } {
    return { failed: error instanceof Error ? error.message : String(error) };
  }

  static getDerivedStateFromProps(props: { value?: unknown }, state: { failed: string | null; seen: unknown }): { failed: string | null; seen: unknown } | null {
    return props.value === state.seen ? null : { failed: null, seen: props.value };
  }

  render(): ReactNode {
    return this.state.failed === null
      ? this.props.children
      : <div className="nb-out msg failed" role="alert" style={{ minHeight: 0 }}>This result could not be shown: {this.state.failed}</div>;
  }
}
