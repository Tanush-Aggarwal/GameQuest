import { Component } from 'react';
import { Button } from '@/components/ui/button.jsx';

// Catches a lazily loaded part failing to load (offline, or the old hashed file is gone after a deploy) so it costs one
// section, not the whole page. A failed dynamic import is remembered by React, so Retry reloads the page, which also
// fetches the new build after a deploy.
export class SectionBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-bg/70 p-4 text-sm">
        <span>{this.props.message ?? 'Couldn’t load this section.'}</span>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }
}