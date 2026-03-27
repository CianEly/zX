import { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'

export function ConnectionViz() {
  const [env, setEnv] = useState<'local' | 'remote'>('local')
  const [sshHosts, setSshHosts] = useState<string[]>([])
  const [selectedHost, setSelectedHost] = useState('')
  const [tunnelPort, setTunnelPort] = useState('18432')
  const [user, setUser] = useState('')
  const [identityFile, setIdentityFile] = useState('~/.ssh/id_ed25519')
  const [projectDir, setProjectDir] = useState('~/zX-project')
  const [isConnecting, setIsConnecting] = useState(false)
  const [steps, setSteps] = useState<Record<number, { status: string; sub?: string }>>({})

  useEffect(() => {
    window.ipcRenderer.getSshHosts().then(hosts => {
      setSshHosts(hosts)
      if (hosts.length > 0) setSelectedHost(hosts[0])
    })

    const cleanup = window.ipcRenderer.onConnectionProgress((data) => {
      setSteps(prev => ({
        ...prev,
        [data.step]: {
          ...prev[data.step],
          status: data.status,
          sub: data.sub
        }
      }))
    })

    return cleanup
  }, [])

  const handleConnect = async () => {
    setIsConnecting(true)
    setSteps({
      1: { status: 'active', sub: 'connecting...' }
    })
    try {
      if (env === 'local') {
        const res = await window.ipcRenderer.spawnLocalBackend()
        if (res.success) {
          setSteps({ 1: { status: 'done', sub: 'local process running' }, 2: { status: 'done', sub: 'token auth ok' } })
        }
      } else {
        await window.ipcRenderer.connectSsh({
          host: selectedHost,
          tunnelPort: parseInt(tunnelPort)
        })
      }
    } catch (e) {
      console.error('Connection error:', e)
    } finally {
      setIsConnecting(false)
    }
  }

  const getStepStatus = (id: number) => steps[id]?.status || 'wait'
  const getStepSub = (id: number) => steps[id]?.sub || ''

  useEffect(() => {
    console.log('STEP 1 STATE:', steps[1])
  }, [steps])

  return (
    <div className="layout">
      <div className="left-pane">
        <div>
          <div className="pane-title">connection</div>
          <div className="seg-ctrl">
            <div
              className={`seg ${env === 'local' ? 'active' : ''}`}
              onClick={() => setEnv('local')}
            >local</div>
            <div
              className={`seg ${env === 'remote' ? 'active' : ''}`}
              onClick={() => setEnv('remote')}
            >remote</div>
          </div>

          {env === 'remote' && (
            <>
              <div className="label">ssh host</div>
              <select
                className="field"
                value={selectedHost}
                onChange={(e) => setSelectedHost(e.target.value)}
              >
                {sshHosts.length > 0 ? (
                  sshHosts.map(host => <option key={host}>{host}</option>)
                ) : (
                  <option disabled>No hosts found in ~/.ssh/config</option>
                )}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div className="label">tunnel port</div>
                  <input
                    className="field"
                    value={tunnelPort}
                    onChange={(e) => setTunnelPort(e.target.value)}
                    type="text"
                  />
                </div>
                <div>
                  <div className="label">user</div>
                  <input
                    className="field"
                    placeholder="optional"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    type="text"
                  />
                </div>
              </div>
              <div className="label">identity file</div>
              <input
                className="field"
                value={identityFile}
                onChange={(e) => setIdentityFile(e.target.value)}
                type="text"
              />
            </>
          )}

          {env === 'local' && (
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 4 }}>
              Local backend is managed automatically by the Electron process.
            </div>
          )}
        </div>

        <div>
          <div className="pane-title">bootstrap status</div>
          <div className="step-list">

            <div className="step">
              <div className={`step-num sn-${getStepStatus(1)}`}>
                {getStepStatus(1) === 'done' ? '✓' : '1'}
              </div>

              <div>
                <div className="step-text"><b>{env === 'local' ? 'local process' : 'ssh handshake'}</b></div>
                <div className="step-sub">{getStepSub(1) || (env === 'local' ? 'idle' : 'waiting...')}</div>

              </div>
            </div>
            {env === 'remote' && (
              <>
                <div className="step">
                  <div className={`step-num sn-${getStepStatus(2)}`}>{getStepStatus(2) === 'done' ? '✓' : '2'}</div>
                  <div><div className="step-text"><b>uv installed</b></div><div className="step-sub">{getStepSub(2)}</div></div>
                </div>
                <div className="step">
                  <div className={`step-num sn-${getStepStatus(3)}`}>{getStepStatus(3) === 'done' ? '✓' : '3'}</div>
                  <div><div className="step-text"><b>backend deployed</b></div><div className="step-sub">{getStepSub(3)}</div></div>
                </div>
                <div className="step">
                  <div className={`step-num sn-${getStepStatus(4)}`}>{getStepStatus(4) === 'done' ? '✓' : '4'}</div>
                  <div><div className="step-text"><b>port forward</b></div><div className="step-sub">{getStepSub(4)}</div></div>
                </div>
              </>
            )}
            <div className="step">
              <div className={`step-num sn-${getStepStatus(5)}`}>
                {getStepStatus(5) === 'done' ? '✓' : (env === 'remote' ? '5' : '2')}
              </div>
              <div><div className="step-text" style={{ color: getStepStatus(5) === 'done' ? 'var(--text1)' : 'var(--text3)' }}>token auth</div><div className="step-sub">{getStepSub(5)}</div></div>
            </div>
          </div>
        </div>

        <div>
          <div className="label">project directory ({env})</div>
          <input
            className="field"
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            type="text"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className={`btn btn-accent btn-full ${isConnecting ? 'loading' : ''}`}
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      <div className="right-pane">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>visualization</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            {env} exploration · metrics visualization
          </div>
        </div>

        <div className="viz-placeholder" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
          <div style={{ textAlign: 'center' }}>
            <Activity size={48} opacity={0.2} style={{ marginBottom: 12 }} />
            <div>connect to a backend to see exploration results</div>
          </div>
        </div>
      </div>
    </div>
  )
}
