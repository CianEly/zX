import { FileUp, Square, Play } from 'lucide-react';

interface TopbarProps {
  title: string;
  breadcrumb: string;
  onImport?: () => void;
  compact?: boolean;
}

export function Topbar({ title, breadcrumb, compact, onImport }: TopbarProps) {
  return (
    <div className={`topbar ${compact ? 'compact' : ''}`}>
      {compact ? (
        <>
          <div className="logo-mark-small logo-mark">zX</div>
          <span style={{color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-mono)'}}>{breadcrumb} / </span>
          <span style={{color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)'}}>{title}</span>
        </>
      ) : (
        <>
          <div className="project-pill">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4 L2 13 L14 13 L14 4 L8 2 L2 4Z" stroke="currentColor" strokeWidth="1.3"/></svg>
            {title}
          </div>
          <span className="breadcrumb">/ <span>{breadcrumb}</span></span>
        </>
      )}

      <div className="topbar-right">
        {compact ? (
          <>
            <button className="btn" onClick={onImport}>
              <FileUp size={12} strokeWidth={1.4} />
              Upload
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onImport}>
              <FileUp size={13} strokeWidth={1.5} />
              Import CSV
            </button>
          </>
        )}
      </div>
    </div>
  );
}
