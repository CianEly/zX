export function StatusBar() {
  const connected = true; // Hardcoded for now
  return (
    <div className="status-bar">
      <span className={`status-dot ${!connected ? 'disconnected' : ''}`}></span>
      <span style={{color: connected ? 'var(--green)' : 'var(--text3)'}}>
        {connected ? 'connected' : 'disconnected'}
      </span>
      <div style={{color: 'var(--text3)', marginTop: 3, fontSize: 10}}>
        local · pid 48201
      </div>
    </div>
  );
}
