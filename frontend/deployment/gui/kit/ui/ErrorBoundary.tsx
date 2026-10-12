import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from './Button';
import { DIM, SUNKEN, TEXT } from './theme';

/**
 * A module of the page that did not load: the page is older than the server it
 * talks to -- a tab left open across an update, whose chunks are gone. Every
 * browser words it its own way.
 */
const STALE_PAGE = /dynamically imported module|importing a module script|error loading dynamically|ChunkLoadError|Unable to preload CSS/i;

/**
 * Tells the person when the page crashed, instead of leaving them a blank
 * one: "Something went wrong" and a Reload. Around the editor and around the
 * delivered tool alike (their entry files). A render that throws -- a lazy
 * panel that failed to load among them -- is caught here; what a handler
 * throws is not, and is said where it happens. `inline` is for a part of the
 * page (a node's panel): it says so in its own place and leaves the rest, and
 * the graph, standing.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = STALE_PAGE.test(error.message);
    if (this.props.inline) {
      return (
        <p className="text-sm" style={{ color: DIM }} role="alert">
          {stale ? 'This part did not load: the page is out of date. Save, then reload it.' : `This part broke: ${error.message}`}
        </p>
      );
    }
    return (
      <div className="flex h-screen items-center justify-center p-6" style={{ background: SUNKEN }} role="alert">
        <div className="flex max-w-md flex-col items-start gap-3">
          <p className="text-base font-semibold" style={{ color: TEXT }}>
            {stale ? 'This page is out of date.' : 'Something went wrong.'}
          </p>
          <p className="text-sm" style={{ color: DIM }}>
            {stale ? 'It was updated since it was opened. Reload it to go on.' : 'Reload the page to go on.'}
          </p>
          {!stale && <p className="break-words font-mono text-xs" style={{ color: DIM }}>{error.message}</p>}
          <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
