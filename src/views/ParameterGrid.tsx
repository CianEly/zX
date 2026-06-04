import { useState, useEffect, useMemo, useRef } from 'react'
import { Topbar } from '../components/Topbar'
import * as Icons from 'lucide-react'
import { parseCsv, stringifyCsv } from '../utils/csv'
import type { CsvData } from '../utils/csv'

interface ParameterGridProps {
  projectPath: string;
  env: 'local' | 'remote';
  csvData: CsvData | null;
  setCsvData: (data: CsvData | null) => void;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
}

export function ParameterGrid({ projectPath, env, csvData, setCsvData, selectedFile, setSelectedFile }: ParameterGridProps) {
  const [dataFiles, setDataFiles] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  
  // Execution State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set())
  const [isExecuting, setIsExecuting] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [forceReRun, setForceReRun] = useState(false)

  // Helper to render icons safely
  const Icon = ({ name, size = 16, className = "", style = {} }: { name: string, size?: number, className?: string, style?: any }) => {
    const Component = (Icons as any)[name]
    if (!Component) return <span style={{ fontSize: 10, ...style }}>[{name}]</span>
    return <Component size={size} className={className} style={style} />
  }

  // Fetch file list
  const refreshDataFiles = async () => {
    try {
      const files = await window.ipcRenderer.listData({ projectPath, env })
      setDataFiles(files)
      
      // We must handle the current selectedFile being passed down from App
      // Since closures might capture stale state, we use functional update on setSelectedFile?
      // Actually we just check against the `files` array.
      if (selectedFile && !files.includes(selectedFile)) {
        setSelectedFile(null)
      } else if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0])
      }
    } catch (err) {
      console.error('Error listing data files:', err)
    }
  }

  useEffect(() => {
    refreshDataFiles()
  }, [projectPath, env])

  // Fetch CSV content
  useEffect(() => {
    if (!selectedFile) return
    const loadData = async () => {
      setIsLoading(true)
      try {
        const content = await window.ipcRenderer.readData({ projectPath, filename: selectedFile, env })
        const parsed = parseCsv(content)
        setCsvData(parsed)
      } catch (e) {
        console.error('Failed to parse CSV:', e)
        setCsvData({ headers: [], rows: [] })
      }
      setIsDirty(false)
      setIsLoading(false)
    }
    loadData()
  }, [selectedFile, projectPath, env])

  // Handle real-time updates now handled in App.tsx

  const handleSave = async () => {
    if (!selectedFile || !csvData) return
    setIsSaving(true)
    try {
      const content = stringifyCsv(csvData)
      const res = await window.ipcRenderer.writeData({ projectPath, filename: selectedFile, content, env })
      if (res.success) {
        setIsDirty(false)
      } else {
        alert('Failed to save data: ' + res.error)
      }
    } catch (err) {
      alert('Error saving data: ' + err)
    }
    setIsSaving(false)
  }

  const handleExecute = async () => {
    if (!selectedFile) return
    if (selectedRowIds.size === 0 && !window.confirm("No rows selected. Do you want to run the Initialization Hook to generate rows?")) return
    setIsExecuting(true)
    try {
      const config = await window.ipcRenderer.getApiConfig()
      const rowIds = Array.from(selectedRowIds)
      
      const res = await fetch(`http://127.0.0.1:${config.port}/execute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token}`
        },
        body: JSON.stringify({
          project_path: projectPath,
          db_filename: selectedFile,
          row_ids: rowIds,
          dry_run: dryRun
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        alert('Execution failed to start: ' + err.detail)
      }
    } catch (err) {
      alert('Error starting execution: ' + err)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleStop = async () => {
    try {
      const config = await window.ipcRenderer.getApiConfig()
      await fetch(`http://127.0.0.1:${config.port}/stop?project_path=${encodeURIComponent(projectPath)}&db_filename=${encodeURIComponent(selectedFile || 'zx_database.csv')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.token}` }
      })
    } catch (err) {
      console.error('Error stopping:', err)
    }
  }

  const toggleRowSelection = (id: number) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedRowIds.size === filteredRows.length) {
      setSelectedRowIds(new Set())
    } else {
      const allIds = filteredRows.map(r => parseInt(r._zx_row_id || '0'))
      setSelectedRowIds(new Set(allIds))
    }
  }

  const handleImport = async () => {
    console.log('ParameterGrid: Import clicked');
    try {
      const res = await window.ipcRenderer.importData({ projectPath, env })
      if (res.success && res.filename) {
        await refreshDataFiles()
        setSelectedFile(res.filename)
      } else if (res.error !== 'Canceled') {
        alert('Import failed: ' + res.error)
      }
    } catch (err) {
      alert('Error importing data: ' + err)
    }
  }

  const handleCreateDb = async () => {
    try {
      const content = "_zx_row_id,_zx_status\n"
      const res = await window.ipcRenderer.writeData({ projectPath, filename: 'zx_database.csv', content, env })
      if (res.success) {
        await refreshDataFiles()
        setSelectedFile('zx_database.csv')
      } else {
        alert('Failed to create database: ' + res.error)
      }
    } catch (err) {
      alert('Error creating database: ' + err)
    }
  }

  const handleCellChange = (rowIndex: number, header: string, value: string) => {
    if (!csvData) return
    const newRows = [...csvData.rows]
    newRows[rowIndex] = { ...newRows[rowIndex], [header]: value }
    setCsvData({ ...csvData, rows: newRows })
    setIsDirty(true)
  }

  const filteredRows = useMemo(() => {
    if (!csvData) return []
    if (!filterText) return csvData.rows
    const lowSearch = filterText.toLowerCase()
    return csvData.rows.filter(row => 
      Object.values(row).some(v => String(v).toLowerCase().includes(lowSearch))
    )
  }, [csvData, filterText])

  return (
    <>
      <Topbar 
        title={selectedFile || 'Parameters'} 
        breadcrumb="workspace" 
        onImport={handleImport}
      />
      <div className={`content ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ flexDirection: 'row', padding: 0, display: 'flex', height: 'calc(100vh - 48px)', position: 'relative' }}>
        {/* Left Sidebar: Data Files */}
        <div className="data-sidebar" style={{ 
          width: isSidebarCollapsed ? 0 : 240, 
          borderRight: isSidebarCollapsed ? 'none' : '1px solid var(--border)', 
          background: '#0D0E12', 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s'
        }}>
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', minWidth: 240 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)' }}>Data Files</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={refreshDataFiles} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}
              >
                <Icon name="RefreshCw" size={14} />
              </button>
              <button 
                onClick={handleImport} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}
                title="Import CSV"
              >
                <Icon name="Upload" size={14} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 240 }}>
            {dataFiles.map(file => (
              <div 
                key={file}
                className={`data-file-item ${selectedFile === file ? 'active' : ''}`}
                onClick={() => setSelectedFile(file)}
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  color: selectedFile === file ? 'var(--accent)' : 'var(--text3)',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: selectedFile === file ? '#1A1B20' : 'transparent',
                  borderLeft: `2px solid ${selectedFile === file ? 'var(--accent)' : 'transparent'}`
                }}
              >
                <Icon name="FileSpreadsheet" size={16} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                <Icon name="ChevronRight" size={14} className="chevron" />
              </div>
            ))}
            {dataFiles.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                No CSV files found in /data
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Toggle Handle */}
        <div 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          style={{
            position: 'absolute',
            left: isSidebarCollapsed ? 0 : 240,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 40,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: '0 4px 4px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 100,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            color: 'var(--text3)'
          }}
          className="sidebar-toggle"
        >
          <Icon name={isSidebarCollapsed ? "ChevronRight" : "ChevronLeft"} size={14} />
        </div>

        {/* Main Area: Grid */}
        <div className="grid-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111216', overflow: 'hidden' }}>
          {/* Header/Toolbar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1A1B20', minHeight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0D0E12', padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)' }}>
                <Icon name="Search" size={14} />
                <input 
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Filter parameters..."
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, outline: 'none', width: 200 }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{filteredRows.length} ROWS</span>
            </div>
            
            <button 
              className={`btn-save ${isSaving ? 'saving' : ''}`}
              onClick={handleSave}
              disabled={isSaving || !isDirty || !selectedFile}
              style={{ 
                background: isDirty ? 'var(--accent)' : 'transparent', 
                border: isDirty ? 'none' : '1px solid var(--border)',
                color: isDirty ? 'white' : 'var(--text3)',
                padding: '6px 16px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: isDirty ? 1 : 0.6
              }}
            >
              <Icon name="Save" size={14} />
              {isSaving ? 'Saving...' : (isDirty ? 'Save Changes' : 'Saved')}
            </button>
          </div>

          {/* Execution Toolbar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, background: '#0D0E12' }}>
            <button 
              onClick={handleExecute}
              disabled={isExecuting}
              className="btn btn-accent"
              style={{ padding: '6px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Icon name="Play" size={14} />
              {selectedRowIds.size > 0 ? `Run Exploration (${selectedRowIds.size})` : `Initialize Exploration`}
            </button>
            <button 
              onClick={handleStop}
              className="btn btn-ghost"
              style={{ padding: '6px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#EF4444' }}
            >
              <Icon name="Square" size={14} />
              Stop
            </button>

            <div style={{ height: 20, width: 1, background: 'var(--border)', margin: '0 8px' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
              Dry Run
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={forceReRun} onChange={e => setForceReRun(e.target.checked)} />
              Force Re-run
            </label>
          </div>

          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {isLoading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spin">
                   <Icon name="RefreshCw" size={32} />
                </div>
              </div>
            )}

            {!selectedFile ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text3)' }}>
                <Icon name="TableProperties" size={48} />
                <p style={{ marginTop: 16 }}>Select a data file or create one to begin</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="btn" onClick={handleImport}>Import CSV</button>
                  <button className="btn btn-accent" onClick={handleCreateDb}>Initialize Database</button>
                </div>
              </div>
            ) : csvData && csvData.headers.length > 0 ? (
              <table className="param-table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input type="checkbox" onChange={toggleSelectAll} checked={selectedRowIds.size === filteredRows.length && filteredRows.length > 0} />
                    </th>
                    <th style={{ width: 40, textAlign: 'center' }}>#</th>
                    <th style={{ width: 80 }}>Status</th>
                    {csvData.headers.map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const rid = parseInt(row._zx_row_id || String(i));
                    const status = row._zx_status || 'pending';
                    return (
                      <tr key={rid} className={status}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedRowIds.has(rid)} 
                            onChange={() => toggleRowSelection(rid)} 
                          />
                        </td>
                        <td style={{ color: 'var(--text3)', fontSize: 11, textAlign: 'center', background: '#1A1B20' }}>{rid}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            {status === 'running' && <Icon name="RotateCw" size={12} className="spin" />}
                            {status === 'completed' && <Icon name="CheckCircle2" size={12} style={{ color: '#10B981' }} />}
                            {status === 'failed' && <Icon name="AlertCircle" size={12} style={{ color: '#EF4444' }} />}
                            {status === 'pending' && <Icon name="Circle" size={12} style={{ opacity: 0.3 }} />}
                            <span style={{ textTransform: 'capitalize' }}>{row._zx_hook_stage || status}</span>
                          </div>
                        </td>
                        {csvData.headers.map(header => (
                          <td key={header}>
                            <input 
                              className="cell-input"
                              value={row[header] !== undefined && row[header] !== null ? row[header] : ''}
                              onChange={e => handleCellChange(i, header, e.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : csvData ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
                Selected file is empty or missing headers.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <style>{`
        .param-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .param-table th {
          text-align: left;
          padding: 8px 12px;
          background: #1A1B20;
          color: var(--text3);
          font-weight: 500;
          position: sticky;
          top: 0;
          border-bottom: 1px solid var(--border);
          z-index: 11;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .param-table td {
          padding: 0;
          border-bottom: 1px solid var(--border);
        }
        .param-table tr:hover {
          background: #16171D;
        }
        
        .cell-input {
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: var(--text1);
          outline: none;
          font-family: inherit;
          font-size: inherit;
        }
        .cell-input:focus {
          background: rgba(var(--accent-rgb), 0.1);
          box-shadow: inset 0 0 0 1px var(--accent);
        }

        .spin {
          animation: spin 1s linear infinite;
          color: var(--accent);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sidebar-toggle:hover {
          background: #1A1B20 !important;
          color: var(--accent) !important;
        }
      `}</style>
    </>
  )
}
