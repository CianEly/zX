import { useState, useEffect, useMemo } from 'react'
import { Topbar } from '../components/Topbar'
import * as Icons from 'lucide-react'
import { parseCsv, stringifyCsv } from '../utils/csv'
import type { CsvData } from '../utils/csv'

interface ParameterGridProps {
  projectPath: string;
  env: 'local' | 'remote';
}

export function ParameterGrid({ projectPath, env }: ParameterGridProps) {
  const [dataFiles, setDataFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [filterText, setFilterText] = useState('')

  // Helper to render icons safely
  const Icon = ({ name, size = 16, className = "" }: { name: string, size?: number, className?: string }) => {
    const Component = (Icons as any)[name]
    if (!Component) return <span style={{ fontSize: 10 }}>[{name}]</span>
    return <Component size={size} className={className} />
  }

  // Fetch file list
  const refreshDataFiles = async () => {
    try {
      const files = await window.ipcRenderer.listData({ projectPath, env })
      setDataFiles(files)
      if (files.length > 0 && !selectedFile) {
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
      <div className="content" style={{ flexDirection: 'row', padding: 0, display: 'flex', height: 'calc(100vh - 48px)' }}>
        {/* Left Sidebar: Data Files */}
        <div className="data-sidebar" style={{ width: 240, borderRight: '1px solid var(--border)', background: '#0D0E12', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
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
          <div style={{ flex: 1, overflowY: 'auto' }}>
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
                <p style={{ marginTop: 16 }}>Select a data file or import a CSV to begin</p>
                <button className="btn" style={{ marginTop: 16 }} onClick={handleImport}>Import CSV</button>
              </div>
            ) : csvData && csvData.headers.length > 0 ? (
              <table className="param-table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>#</th>
                    {csvData.headers.map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text3)', fontSize: 11, textAlign: 'center', background: '#1A1B20' }}>{i + 1}</td>
                      {csvData.headers.map(header => (
                        <td key={header}>
                          <input 
                            className="cell-input"
                            value={row[header] || ''}
                            onChange={e => handleCellChange(i, header, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
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
      `}</style>
    </>
  )
}
