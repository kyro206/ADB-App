import type { ReactNode } from 'react';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="work-panel"><h3>{title}</h3>{children}</section>;
}
