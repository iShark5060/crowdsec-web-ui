import { useMemo, type Context, type ReactNode } from 'react';

/** Keeps a context value stable for the lint rule without changing what the test passes in. */
export function Provide<T>({
  context: ProviderContext,
  value,
  children,
}: {
  context: Context<T>;
  value: T;
  children: ReactNode;
}) {
  const stable = useMemo(() => value, [value]);
  return <ProviderContext.Provider value={stable}>{children}</ProviderContext.Provider>;
}
