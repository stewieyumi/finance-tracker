import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WalletNameInput } from './WalletNameInput';
function Harness({ save = () => {} }: { save?: () => void }) {
  const [value, setValue] = useState('');
  return <form onSubmit={event => { event.preventDefault(); save(); }}><label htmlFor="name">Account Name</label><WalletNameInput id="name" value={value} onValueChange={setValue} suggestions={['GCash', 'GoTyme', 'Maya']} /><button type="submit">Save</button></form>;
}
it('shows case-insensitive prefix matches and allows selection without submitting', () => {
  const save = vi.fn(); render(<Harness save={save} />);
  const input = screen.getByRole('combobox', { name: 'Account Name' });
  fireEvent.change(input, { target: { value: 'g' } });
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['GCash', 'GoTyme']);
  fireEvent.click(screen.getByRole('option', { name: 'GCash' }));
  expect(input).toHaveValue('GCash'); expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); expect(save).not.toHaveBeenCalled();
});
it('supports arrow keys, Enter selection, Escape dismissal and custom names', () => {
  const save = vi.fn(); render(<Harness save={save} />); const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'G' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'GoTyme' }).id);
  fireEvent.keyDown(input, { key: 'Enter' }); expect(input).toHaveValue('GoTyme'); expect(save).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'G' } }); fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveValue('G'); expect(input).toHaveAttribute('aria-expanded', 'false');
  fireEvent.change(input, { target: { value: 'Travel jar' } }); expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); expect(input).toHaveValue('Travel jar');
});
