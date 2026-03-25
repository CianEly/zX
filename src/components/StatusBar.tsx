interface StatusBarProps {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  port?: string;
}

export function StatusBar({ connectionStatus, port }: StatusBarProps) {
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  
  return (
    <div className="status-bar">
      <span className={`status-dot ${!isConnected ? (isConnecting ? 'connecting' : 'disconnected') : ''}`}></span>
      <span style={{
        color: isConnected ? 'var(--green)' : (isConnecting ? 'var(--orange)' : 'var(--red)')
      }}>
        {connectionStatus}
      </span>
      <div style={{color: 'var(--text3)', marginTop: 3, fontSize: 10}}>
        local {port ? `· port ${port}` : ''}
      </div>
    </div>
  );
}
