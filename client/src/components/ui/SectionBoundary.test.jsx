import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SectionBoundary } from './SectionBoundary.jsx';

function Boom() {
  throw new Error('chunk failed');
}

describe('SectionBoundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('shows its children when nothing fails', () => {
    render(
      <SectionBoundary>
        <p>chart</p>
      </SectionBoundary>,
    );
    expect(screen.getByText('chart')).toBeInTheDocument();
  });

  it('turns a failure into a scoped alert with a Retry that reloads the page, and leaves siblings alone', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <div>
        <p>the rest of the page</p>
        <SectionBoundary message="Couldn’t load the chart.">
          <Boom />
        </SectionBoundary>
      </div>,
    );
    expect(screen.getByText('the rest of the page')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the chart.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});