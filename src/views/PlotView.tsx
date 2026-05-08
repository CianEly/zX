import { useState, useEffect } from 'react'
import Plotly from 'plotly.js-dist'
import createPlotlyFactory from 'react-plotly.js/factory'
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react'

// Handle ESM default export variations
const createPlotlyComponent = (createPlotlyFactory as any).default || createPlotlyFactory;
const Plot = createPlotlyComponent(Plotly)

interface PlotViewProps {
  projectPath: string
  env: 'local' | 'remote'
  dbFilename?: string
}

export function PlotView({ projectPath, env, dbFilename = 'zx_database.csv' }: PlotViewProps) {
  const [figures, setFigures] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPlots = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const config = await window.ipcRenderer.getApiConfig()
      if (!config) throw new Error('Backend not connected')

      const res = await fetch(`http://127.0.0.1:${config.port}/plot?project_path=${encodeURIComponent(projectPath)}&db_filename=${encodeURIComponent(dbFilename)}`, {
        headers: { Authorization: `Bearer ${config.token}` }
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to fetch plots')
      }

      const data = await res.json()
      setFigures(data.figures || {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPlots()
  }, [projectPath, dbFilename])

  return (
    <div className="plot-view content">
      <div className="view-header">
        <div className="view-title">
          <BarChart3 size={18} />
          <span>Visualization · {dbFilename}</span>
        </div>
        <button 
          className={`btn btn-ghost ${isLoading ? 'loading' : ''}`} 
          onClick={fetchPlots}
          disabled={isLoading}
        >
          <RefreshCw size={14} style={{ marginRight: 8 }} />
          Refresh
        </button>
      </div>

      <div className="plot-container">
        {error ? (
          <div className="error-state">
            <AlertCircle size={32} />
            <p>{error}</p>
            <button className="btn btn-accent" onClick={fetchPlots}>Try Again</button>
          </div>
        ) : Object.keys(figures).length === 0 ? (
          <div className="empty-state">
            <BarChart3 size={48} opacity={0.2} />
            <p>No plots generated. Ensure you have a <code>plot.py</code> hook defined and your data contains results.</p>
          </div>
        ) : (
          <div className="plot-grid">
            {Object.entries(figures).map(([name, fig]) => {
              if (!fig || !fig.data) return null;
              return (
                <div key={name} className="plot-card">
                  <div className="plot-card-header">{name}</div>
                  <div className="plot-wrapper">
                    <Plot
                      data={fig.data}
                      layout={{
                        ...fig.layout,
                        autosize: true,
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        font: { color: '#888', size: 10 },
                        margin: { t: 30, r: 20, b: 40, l: 50 },
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%' }}
                      config={{ responsive: true, displayModeBar: false }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .plot-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .plot-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        .plot-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 20px;
        }
        .plot-card {
          background: #15161A;
          border: 1px solid var(--border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: 400px;
        }
        .plot-card-header {
          padding: 10px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 11px;
          text-transform: uppercase;
          color: var(--text3);
          letter-spacing: 0.05em;
        }
        .plot-wrapper {
          flex: 1;
          min-height: 0;
        }
        .empty-state, .error-state {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text3);
          text-align: center;
        }
        .error-state {
          color: #ff5f5f;
        }
        .error-state p { margin: 12px 0 20px; }
      `}</style>
    </div>
  )
}
