import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deferredScreen } from './deferredScreen';

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function Draft({ label }: { label: string }) {
  const [value, setValue] = useState('');
  return <label>{label}<input value={value} onChange={event => setValue(event.target.value)} /></label>;
}

describe('deferredScreen', () => {
  it('waits until opened, keeps navigation available while loading, and uses current props', async () => {
    const module = pending<{ default: typeof Draft }>();
    const load = vi.fn(() => module.promise);
    const Screen = deferredScreen(load, 'wallets');
    expect(load).not.toHaveBeenCalled();
    const { rerender } = render(<><button>Dashboard</button><Screen label="Initial wallet" /></>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading wallets');
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeEnabled();
    rerender(<><button>Dashboard</button><Screen label="Current wallet" /></>);
    await act(async () => { module.resolve({ default: Draft }); });
    expect(await screen.findByRole('textbox', { name: 'Current wallet' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves an open form draft when its parent rerenders', async () => {
    const load = vi.fn(async () => ({ default: Draft }));
    const Screen = deferredScreen(load, 'account');
    const { rerender } = render(<Screen label="Name" />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Unsaved draft' } });
    rerender(<Screen label="Purchase name" />);
    expect(screen.getByRole('textbox', { name: 'Purchase name' })).toHaveValue('Unsaved draft');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a rejected download without discarding a sibling draft', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn<() => Promise<{ default: typeof Draft }>>()
      .mockRejectedValueOnce(new Error('Temporary connection failure'))
      .mockResolvedValueOnce({ default: Draft });
    const Screen = deferredScreen(load, 'operations');
    try {
      render(<><Draft label="Other draft" /><Screen label="Loaded form" /></>);
      fireEvent.change(screen.getByRole('textbox', { name: 'Other draft' }), { target: { value: 'Keep this' } });
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load operations.");
      expect(load).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('textbox', { name: 'Loaded form' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Other draft' })).toHaveValue('Keep this');
      expect(load).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      log.mockRestore();
    }
  });

  it('lets navigation dismiss a pending screen before it finishes loading', async () => {
    const module = pending<{ default: typeof Draft }>();
    const Screen = deferredScreen(() => module.promise, 'setup', true);
    function Navigation() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(false)}>Dashboard</button>{open ? <Screen label="Setup form" /> : <p>Dashboard ready</p>}</>;
    }
    render(<Navigation />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading setup');
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    await act(async () => { module.resolve({ default: Draft }); });
    expect(screen.getByText('Dashboard ready')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
