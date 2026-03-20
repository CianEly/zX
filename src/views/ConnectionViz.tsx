export function ConnectionViz() {
  return (
    <div className="layout">
      <div className="left-pane">
        <div>
          <div className="pane-title">connection</div>
          <div className="seg-ctrl">
            <div className="seg">local</div>
            <div className="seg active">remote</div>
          </div>
          <div className="label">ssh host</div>
          <select className="field">
            <option>gpu-cluster.lab.ac.uk</option>
            <option>hpc-login.university.edu</option>
            <option>dev-box.internal</option>
          </select>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
            <div>
              <div className="label">tunnel port</div>
              <input className="field" defaultValue="18432" type="text" />
            </div>
            <div>
              <div className="label">user</div>
              <input className="field" defaultValue="jsmith" type="text" />
            </div>
          </div>
          <div className="label">identity file</div>
          <input className="field" defaultValue="~/.ssh/id_ed25519" type="text" />
        </div>

        <div>
          <div className="pane-title">bootstrap status</div>
          <div className="step-list">
            <div className="step">
              <div className="step-num sn-done">✓</div>
              <div><div className="step-text"><b>ssh handshake</b></div><div className="step-sub">gpu-cluster.lab.ac.uk · 42ms</div></div>
            </div>
            <div className="step">
              <div className="step-num sn-done">✓</div>
              <div><div className="step-text"><b>uv installed</b></div><div className="step-sub">~/.zx/python · uv 0.4.2</div></div>
            </div>
            <div className="step">
              <div className="step-num sn-done">✓</div>
              <div><div className="step-text"><b>backend deployed</b></div><div className="step-sub">scp zx_backend-0.1.0-py3-none.whl</div></div>
            </div>
            <div className="step">
              <div className="step-num sn-active pulse">◌</div>
              <div><div className="step-text"><b>port forward</b></div><div className="step-sub pulse">establishing tunnel localhost:18432 ↔ 8000</div></div>
            </div>
            <div className="step">
              <div className="step-num sn-wait">5</div>
              <div><div className="step-text" style={{color: 'var(--text3)'}}>token auth</div></div>
            </div>
          </div>
        </div>

        <div>
          <div className="label">project directory (remote)</div>
          <input className="field" defaultValue="~/experiments/camel-opt" type="text" />
          <div style={{display: 'flex', gap: 8, marginTop: 4}}>
            <button className="btn btn-accent btn-full">Connect</button>
          </div>
        </div>
      </div>

      <div className="right-pane">
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{fontSize: 15, fontWeight: 600}}>visualization</div>
          <div style={{marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)'}}>camel-exploration · 24 rows · iter 2</div>
        </div>

        <div className="viz-tabs">
          <div className="vtab active">scatter</div>
          <div className="vtab">pareto front</div>
          <div className="vtab">parallel coords</div>
          <div className="vtab">custom plot.py</div>
        </div>

        <div className="axis-sel">
          <span className="axis-label">x axis</span>
          <select className="axis-select"><option>x1</option><option>x2</option><option>f_x</option></select>
          <span className="axis-label">y axis</span>
          <select className="axis-select" defaultValue="f_x"><option>f_x</option><option>x1</option><option>x2</option></select>
          <span className="axis-label">color by</span>
          <select className="axis-select"><option>_zx_iteration</option><option>_zx_status</option><option>x2</option></select>
          <span style={{marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)'}}>24 pts · 2 highlighted</span>
        </div>

        <div className="chart-area">
          <svg className="scatter-svg" viewBox="0 0 560 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5B6BF8" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#B57BFF" stopOpacity="0.04"/>
              </linearGradient>
            </defs>
            <rect width="560" height="260" fill="transparent"/>
            <line x1="50" y1="20" x2="50" y2="230" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="180" y1="20" x2="180" y2="230" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="310" y1="20" x2="310" y2="230" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="440" y1="20" x2="440" y2="230" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="50" y1="230" x2="540" y2="230" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="50" y1="170" x2="540" y2="170" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="50" y1="110" x2="540" y2="110" stroke="#2A2D38" strokeWidth="0.5"/>
            <line x1="50" y1="50" x2="540" y2="50" stroke="#2A2D38" strokeWidth="0.5"/>
            <text x="295" y="252" textAnchor="middle" fill="#555870" fontSize="11" fontFamily="JetBrains Mono">x1</text>
            <text x="22" y="125" textAnchor="middle" fill="#555870" fontSize="11" fontFamily="JetBrains Mono" transform="rotate(-90,22,125)">f(x)</text>
            <circle cx="88" cy="155" r="5" fill="#363A48"/>
            <circle cx="130" cy="195" r="5" fill="#363A48"/>
            <circle cx="165" cy="145" r="5" fill="#363A48"/>
            <circle cx="215" cy="175" r="5" fill="#363A48"/>
            <circle cx="255" cy="185" r="5" fill="#363A48"/>
            <circle cx="340" cy="165" r="5" fill="#363A48"/>
            <circle cx="380" cy="140" r="5" fill="#363A48"/>
            <circle cx="420" cy="180" r="5" fill="#363A48"/>
            <circle cx="470" cy="155" r="5" fill="#363A48"/>
            <circle cx="500" cy="135" r="5" fill="#363A48"/>
            <circle cx="110" cy="100" r="5.5" fill="#5B6BF8" opacity="0.9"/>
            <circle cx="195" cy="88" r="5.5" fill="#5B6BF8" opacity="0.9"/>
            <circle cx="290" cy="120" r="5.5" fill="#5B6BF8" opacity="0.9"/>
            <circle cx="360" cy="95" r="5.5" fill="#5B6BF8" opacity="0.9"/>
            <circle cx="445" cy="108" r="5.5" fill="#5B6BF8" opacity="0.9"/>
            <circle cx="240" cy="58" r="6.5" fill="#B57BFF" opacity="0.95"/>
            <circle cx="305" cy="65" r="6.5" fill="#B57BFF" opacity="0.95"/>
            <circle cx="240" cy="58" r="11" fill="none" stroke="#B57BFF" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.7"/>
            <circle cx="240" cy="58" r="6.5" fill="#B57BFF"/>
            <rect x="220" y="30" width="90" height="20" rx="3" fill="#1A1C24" stroke="#363A48" strokeWidth="0.5"/>
            <text x="265" y="44" textAnchor="middle" fill="#B57BFF" fontSize="10" fontFamily="JetBrains Mono">−1.031 ★</text>
            <line x1="240" y1="50" x2="252" y2="42" stroke="#B57BFF" strokeWidth="0.8" opacity="0.6"/>
            <circle cx="70" cy="36" r="4" fill="#363A48"/>
            <text x="78" y="40" fill="#555870" fontSize="10" fontFamily="JetBrains Mono">iter 0</text>
            <circle cx="118" cy="36" r="4" fill="#5B6BF8"/>
            <text x="126" y="40" fill="#8B8FA8" fontSize="10" fontFamily="JetBrains Mono">iter 1</text>
            <circle cx="166" cy="36" r="4" fill="#B57BFF"/>
            <text x="174" y="40" fill="#8B8FA8" fontSize="10" fontFamily="JetBrains Mono">iter 2</text>
            <line x1="50" y1="20" x2="50" y2="235" stroke="#363A48" strokeWidth="1"/>
            <line x1="45" y1="230" x2="545" y2="230" stroke="#363A48" strokeWidth="1"/>
          </svg>
        </div>

        <div className="mini-grid">
          <div className="mini-card">
            <div className="mini-title">convergence</div>
            <svg viewBox="0 0 220 60" style={{width: '100%', display: 'block'}} preserveAspectRatio="none">
              <polyline points="10,50 50,42 90,30 130,18 170,12 210,8" fill="none" stroke="#5B6BF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="10" y1="55" x2="210" y2="55" stroke="#2A2D38" strokeWidth="0.5"/>
              <text x="10" y="58" fill="#555870" fontSize="8" fontFamily="JetBrains Mono">0</text>
              <text x="200" y="58" fill="#555870" fontSize="8" fontFamily="JetBrains Mono">iter</text>
              <circle cx="210" cy="8" r="3" fill="#B57BFF"/>
            </svg>
          </div>
          <div className="mini-card">
            <div className="mini-title">objective distribution</div>
            <svg viewBox="0 0 220 60" style={{width: '100%', display: 'block'}} preserveAspectRatio="none">
              <rect x="20" y="40" width="16" height="14" rx="1" fill="#363A48"/>
              <rect x="44" y="28" width="16" height="26" rx="1" fill="#363A48"/>
              <rect x="68" y="18" width="16" height="36" rx="1" fill="#5B6BF8" opacity="0.7"/>
              <rect x="92" y="24" width="16" height="30" rx="1" fill="#5B6BF8" opacity="0.7"/>
              <rect x="116" y="32" width="16" height="22" rx="1" fill="#363A48"/>
              <rect x="140" y="38" width="16" height="16" rx="1" fill="#363A48"/>
              <rect x="164" y="44" width="16" height="10" rx="1" fill="#363A48"/>
              <line x1="10" y1="55" x2="210" y2="55" stroke="#2A2D38" strokeWidth="0.5"/>
              <text x="68" y="13" fill="#B57BFF" fontSize="8" fontFamily="JetBrains Mono">best</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
