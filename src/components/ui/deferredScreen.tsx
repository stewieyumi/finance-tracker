import React, { lazy, Suspense, useState, type ComponentProps, type ComponentType } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';

/** Define at module scope: retain loaded form state, and retry imports without reloading the app. */
export function deferredScreen<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  label: string,
  fullPage = false,
) {
  return function DeferredScreen(props: ComponentProps<T>) {
    const [Screen, setScreen] = useState(() => lazy(load));
    const status = <p role="status" className="p-4 text-sm text-muted">Loading {label}…</p>;
    return <ErrorBoundary message={`Couldn't load ${label}. Reconnect and retry, or choose another screen.`}
      onRetry={() => setScreen(() => lazy(load))}>
      <Suspense fallback={fullPage ? <div className="min-h-screen bg-shell flex items-center justify-center">{status}</div> : status}>
        {React.createElement(Screen, props)}
      </Suspense>
    </ErrorBoundary>;
  };
}
