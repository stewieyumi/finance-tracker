import React, { forwardRef, useId, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> & {
  value: string;
  suggestions: readonly string[];
  onValueChange: (value: string) => void;
};

export const WalletNameInput = forwardRef<HTMLInputElement, Props>(function WalletNameInput({ value, suggestions, onValueChange, ...props }, ref) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLocaleLowerCase();
  const matches = query ? suggestions.filter(name => name.toLocaleLowerCase().startsWith(query)) : [];
  const visible = open && matches.length > 0;
  const choose = (name: string) => { onValueChange(name); setOpen(false); setActive(-1); };
  return <div>
    <input {...props} ref={ref} value={value} role="combobox" autoComplete="off" aria-autocomplete="list"
      aria-expanded={visible} aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && active >= 0 && active < matches.length ? `${listId}-${active}` : undefined}
      onChange={event => { onValueChange(event.target.value); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onKeyDown={event => {
        if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault(); setOpen(true);
          setActive(current => event.key === 'ArrowDown' ? (current + 1) % matches.length : current <= 0 ? matches.length - 1 : current - 1);
        } else if (visible && event.key === 'Enter' && active >= 0) {
          event.preventDefault(); choose(matches[active]);
        } else if (visible && event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
        }
      }} />
    {visible && <div id={listId} role="listbox" aria-label="Wallet name suggestions" className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-strong bg-surface-high p-1 shadow-lg">
      {matches.map((name, index) => <button key={name} id={`${listId}-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(name)}
        className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-primary ${active === index ? 'bg-fill-strong' : 'hover:bg-fill'}`}>{name}</button>)}
    </div>}
  </div>;
});
