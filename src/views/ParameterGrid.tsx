import { Topbar } from '../components/Topbar';

export function ParameterGrid() {
  const rows = [
    {id:14,sel:true,st:'done',x1:'0.0898',x2:'-0.7126',fx:'−1.031',iter:1,stage:'',prog:100,t:'4.2s'},
    {id:15,sel:true,st:'done',x1:'−0.0898',x2:'0.7126',fx:'−1.031',iter:1,stage:'',prog:100,t:'4.1s'},
    {id:19,sel:false,st:'running',x1:'0.4422',x2:'−0.9021',fx:'—',iter:2,stage:'extract',prog:65,t:'2.1s'},
    {id:20,sel:true,st:'pending',x1:'1.2310',x2:'0.3840',fx:'—',iter:2,stage:'',prog:0,t:'—'},
    {id:21,sel:true,st:'pending',x1:'−0.8820',x2:'1.1050',fx:'—',iter:2,stage:'',prog:0,t:'—'},
    {id:7,sel:false,st:'failed',x1:'2.9910',x2:'−1.8820',fx:'—',iter:0,stage:'launch',prog:30,t:'0.8s'},
    {id:8,sel:true,st:'done',x1:'1.7650',x2:'0.5530',fx:'0.472',iter:0,stage:'',prog:100,t:'3.9s'},
    {id:9,sel:true,st:'done',x1:'−1.4410',x2:'−0.2210',fx:'1.884',iter:0,stage:'',prog:100,t:'4.0s'},
  ];

  return (
    <>
      <Topbar title="camel-exploration" breadcrumb="parameters" />
      <div className="content">
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">total rows</div>
            <div className="stat-val" style={{color: 'var(--text)'}}>24</div>
            <div className="stat-sub">iteration 2 of 5</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">completed</div>
            <div className="stat-val" style={{color: 'var(--green)'}}>18</div>
            <div className="stat-sub">75% done</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">running</div>
            <div className="stat-val" style={{color: 'var(--accent2)'}}>1</div>
            <div className="stat-sub pulse">row_id 19 · extract</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">failed</div>
            <div className="stat-val" style={{color: 'var(--red)'}}>2</div>
            <div className="stat-sub">click to retry</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">best f(x)</div>
            <div className="stat-val" style={{color: 'var(--purple)'}}>−1.031</div>
            <div className="stat-sub">row_id 14</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar-left">
            <input className="search-input" placeholder="filter rows..." defaultValue="" />
            <button className="btn">Select All</button>
            <button className="btn">Deselect</button>
            <button className="btn">Force Re-run</button>
          </div>
          <div className="toolbar-right">
            <span style={{color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 11}}>6 selected</span>
            <button className="btn btn-ghost" style={{fontSize: 11}}>hooks ▾</button>
          </div>
        </div>

        <div className="grid-wrap">
          <div className="grid-head">
            <div className="gh"></div>
            <div className="gh">id</div>
            <div className="gh">status</div>
            <div className="gh">x1</div>
            <div className="gh">x2</div>
            <div className="gh">f(x)</div>
            <div className="gh">iter</div>
            <div className="gh">stage / log</div>
            <div className="gh">progress</div>
            <div className="gh">elapsed</div>
          </div>
          <div className="grid-body">
            {rows.map((r, i) => (
              <div key={i} className={`grid-row ${r.sel ? 'selected' : ''} ${r.st === 'running' ? 'running-row' : ''}`}>
                <div className="gc"><div className={`checkbox ${r.sel ? 'checked' : ''}`}></div></div>
                <div className="gc gc-muted">{r.id}</div>
                <div className="gc">
                  <span className={`badge badge-${r.st === 'done' ? 'done' : r.st === 'running' ? 'running' : r.st === 'failed' ? 'failed' : 'pending'}`}>
                    {r.st === 'running' ? <span className="pulse">● </span> : r.st === 'done' ? '✓ ' : r.st === 'failed' ? '✕ ' : '○ '}
                    {r.st}
                  </span>
                </div>
                <div className="gc">{r.x1}</div>
                <div className="gc">{r.x2}</div>
                <div className="gc" style={{color: r.fx.startsWith('−') ? '#B57BFF' : r.fx === '—' ? 'var(--text3)' : 'var(--text)'}}>{r.fx}</div>
                <div className="gc gc-dim">{r.iter}</div>
                <div className="gc">
                  {r.stage ? <span className="hook-stage">{r.stage}</span> : <span style={{color: 'var(--text3)', fontSize: 11}}>—</span>}
                </div>
                <div className="gc">
                  <div className="progress-bar"><div className="progress-fill" style={{width: `${r.prog}%`}}></div></div>
                </div>
                <div className="gc gc-dim">{r.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
