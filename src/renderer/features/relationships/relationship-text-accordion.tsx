import type { ReactNode } from 'react';

export function RelationshipTextAccordion({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <details
      className="mt-6 rounded-xl border semantic-border semantic-surface"
      data-testid="neighborhood-text-list"
    >
      <summary className="cursor-pointer rounded-xl px-4 py-3 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline">
        Lista textual acessível
      </summary>
      <div className="border-t semantic-border px-4 pt-3 pb-4">{children}</div>
    </details>
  );
}
