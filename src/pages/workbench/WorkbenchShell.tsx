import type { ReactNode } from 'react';
import '@material/web/progress/circular-progress.js';

export function WorkbenchShell({ title, busy, status, children }: { title: string; busy: boolean; status: string; children: ReactNode }) {
  return (
    <div className="workbench">
      <header className="page-header">
        <h2>{title}</h2>
        <span className={busy ? 'status busy' : 'status'} style={{ display: 'flex', alignItems: 'center', padding:0}}>
          {busy ? (
            <>
              <md-circular-progress 
                indeterminate 
                style={{ '--md-circular-progress-size': '30px' } as React.CSSProperties}
              ></md-circular-progress>
            </>
          ) : (
            status
          )}
        </span>
      </header>
      <div className="workbench-content">{children}</div>
    </div>
  );
}