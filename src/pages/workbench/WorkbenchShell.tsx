import type { ReactNode } from 'react';

export function WorkbenchShell({ title, busy, status, children }: { title: string; busy: boolean; status: string; children: ReactNode }) {
  return <div className="workbench">
    <header className="page-header">
      <h2>{title}</h2>
      <span className={busy ? 'status busy' : 'status'}>{busy ? 'Trabajando...' : status}</span>
    </header>
    <div className="workbench-content">{children}</div>
  </div>;
}
