import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import { DatePicker } from './DatePicker.jsx';

function Harness({ initial, onValue, ...props }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <label htmlFor="d">When</label>
      <DatePicker id="d" value={v} onChange={(x) => (setV(x), onValue?.(x))} {...props} />
    </>
  );
}

describe('DatePicker', () => {
  it('shows the chosen date and time in words, and opens a calendar with time slots', async () => {
    render(<Harness initial="2099-03-14T20:00" withTime />);
    const trigger = screen.getByLabelText('When');
    expect(trigger).toHaveTextContent('2099');
    expect(trigger).toHaveTextContent(/8:00/);
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Choose date and time' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { selected: true })).toHaveTextContent('14');
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(/8:00/);
  });

  it('picks a day (keeping the time) and a time slot', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2099-03-14T20:00" withTime onValue={onValue} />);
    await userEvent.click(screen.getByLabelText('When'));
    await userEvent.click(screen.getByRole('gridcell', { name: /20 March 2099|March 20, 2099/ }));
    expect(onValue).toHaveBeenLastCalledWith('2099-03-20T20:00');
    await userEvent.click(screen.getByRole('option', { name: /^9:30\sPM$/i }));
    expect(onValue).toHaveBeenLastCalledWith('2099-03-20T21:30');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves with the keyboard and closes on Escape', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2099-03-14" onValue={onValue} />);
    await userEvent.click(screen.getByLabelText('When'));
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(onValue).toHaveBeenLastCalledWith('2099-03-22');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // a date-only pick closes it
    await userEvent.click(screen.getByLabelText('When'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not allow days outside min / max', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2099-03-14" max="2099-03-15" onValue={onValue} />);
    await userEvent.click(screen.getByLabelText('When'));
    const late = screen.getByRole('gridcell', { name: /16 March 2099|March 16, 2099/ });
    expect(late).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(late);
    expect(onValue).not.toHaveBeenCalled();
  });
});
