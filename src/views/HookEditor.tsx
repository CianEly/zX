import { Topbar } from '../components/Topbar';

export function HookEditor() {
  const codeLines = [
    <span className="line"><span className="cm"># Kriging surrogate + gradient descent exploration</span></span>,
    <span className="line"><span className="kw">from</span> <span className="fn">pandas</span> <span className="kw">import</span> DataFrame</span>,
    <span className="line"><span className="kw">from</span> <span className="fn">sklearn.gaussian_process</span> <span className="kw">import</span> GaussianProcessRegressor</span>,
    <span className="line"><span className="kw">from</span> <span className="fn">sklearn.gaussian_process.kernels</span> <span className="kw">import</span> Matern</span>,
    <span className="line"><span className="kw">from</span> <span className="fn">scipy.optimize</span> <span className="kw">import</span> minimize</span>,
    <span className="line"><span className="kw">import</span> <span className="fn">numpy</span> <span className="kw">as</span> <span className="fn">np</span></span>,
    <span className="line"> </span>,
    <span className="line highlight"><span className="kw">def</span> <span className="fn">explore</span>(table: <span className="tp">DataFrame</span>, state: <span className="tp">dict</span>) -&gt; <span className="tp">list</span>[<span className="tp">dict</span>]:</span>,
    <span className="line highlight">    <span className="cm">"""Bayesian optimization via Kriging surrogate."""</span></span>,
    <span className="line highlight">    max_iter = state.get(<span className="str">"max_iterations"</span>, <span className="num">5</span>)</span>,
    <span className="line">    iteration = state.get(<span className="str">"iteration"</span>, <span className="num">0</span>)</span>,
    <span className="line">    <span className="kw">if</span> iteration &gt;= max_iter:</span>,
    <span className="line">        <span className="kw">return</span> []</span>,
    <span className="line"> </span>,
    <span className="line">    done = table[table[<span className="str">"_zx_status"</span>] == <span className="str">"completed"</span>]</span>,
    <span className="line">    X = done[[<span className="str">"x1"</span>, <span className="str">"x2"</span>]].values</span>,
    <span className="line">    y = done[<span className="str">"f_x"</span>].values</span>,
    <span className="line"> </span>,
    <span className="line">    gpr = GaussianProcessRegressor(kernel=Matern(nu=<span className="num">2.5</span>))</span>,
    <span className="line">    gpr.fit(X, y)</span>,
    <span className="line"> </span>,
    <span className="line">    x0 = X[np.argmin(y)]</span>,
    <span className="line">    result = minimize(</span>,
    <span className="line">        <span className="kw">lambda</span> x: gpr.predict([x])[<span className="num">0</span>],</span>,
    <span className="line">        x0, method=<span className="str">"L-BFGS-B"</span>,</span>,
    <span className="line">        bounds=[(<span className="num">-3</span>, <span className="num">3</span>), (<span className="num">-2</span>, <span className="num">2</span>)]</span>,
    <span className="line">    )</span>,
    <span className="line">    state[<span className="str">"iteration"</span>] = iteration + <span className="num">1</span></span>,
    <span className="line">    <span className="kw">return</span> [{"{"}<span className="str">"x1"</span>: result.x[<span className="num">0</span>], <span className="str">"x2"</span>: result.x[<span className="num">1</span>]{"}"}]</span>
  ];

  return (
    <>
      <Topbar compact title="explore.py" breadcrumb="hooks" />
      <div className="main" style={{flexDirection: 'row'}}>
        <div className="hook-list">
          <div className="hook-section">hooks</div>
          <div className="hook-item"><div className="hook-dot dot-optional"></div>initialize.py</div>
          <div className="hook-item"><div className="hook-dot dot-done"></div>preprocess.py</div>
          <div className="hook-item"><div className="hook-dot dot-done"></div>launch.py</div>
          <div className="hook-item"><div className="hook-dot dot-done"></div>extract.py</div>
          <div className="hook-item active"><div className="hook-dot dot-optional"></div>explore.py</div>
          <div className="hook-section">viz</div>
          <div className="hook-item"><div className="hook-dot dot-empty"></div>plot.py</div>
        </div>
        <div className="editor-area">
          <div className="editor-tabs">
            <div className="tab active">explore.py</div>
            <div className="tab">preview · last run</div>
          </div>
          <div className="editor-body">
            <div className="line-nums">
              {Array.from({length: 29}, (_, i) => (
                <div key={i} className={`ln ${i + 1 >= 8 && i + 1 <= 10 ? 'active' : ''}`}>{i + 1}</div>
              ))}
            </div>
            <div className="code-area">
              {codeLines.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
          <div className="bottom-panel">
            <div className="panel-tabs">
              <div className="ptab active">validation</div>
              <div className="ptab">hook log · row 19</div>
              <div className="ptab">dry run preview</div>
            </div>
            <div className="output-area">
              <div className="out-dim">$ python -c "import ast; ast.parse(open('hooks/explore.py').read())"</div>
              <div className="out-ok">✓ Syntax OK — validated on local target (pid 48201)</div>
              <div style={{height: 6}}></div>
              <div className="out-dim">$ python -c "from hooks.explore import explore; ..."</div>
              <div className="out-ok">✓ Import OK — function signature matches expected interface</div>
              <div style={{height: 6}}></div>
              <div className="out-warn">⚠ sklearn not found in ~/.zx/backend — will install on first run</div>
              <div className="out-info" style={{marginTop: 4}}>  packages: scikit-learn&gt;=1.3, scipy&gt;=1.11, numpy&gt;=1.24</div>
            </div>
            <div className="status-strip">
              <div className="status-dot"></div>
              <span>local · python 3.11.9 · uv 0.4.2</span>
              <span style={{marginLeft: 'auto'}}>UTF-8 · 28 lines · Python</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
