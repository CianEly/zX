import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Topbar } from '../components/Topbar'
import { FileCode, Save, RefreshCw } from 'lucide-react'

interface HookEditorProps {
  projectPath: string;
  env: 'local' | 'remote';
  connectionStatus: string;
}

export function HookEditor({ projectPath, env, connectionStatus }: HookEditorProps) {
  const [hooks, setHooks] = useState<string[]>([])
  const [selectedHook, setSelectedHook] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Fetch hook list
  const refreshHookList = async () => {
    const list = await window.ipcRenderer.listHooks(projectPath, env)
    const standardHooks = ['explore.py', 'launch.py', 'preprocess.py', 'initialize.py', 'finalize.py']
    list.sort((a, b) => {
       const aIdx = standardHooks.indexOf(a)
       const bIdx = standardHooks.indexOf(b)
       if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
       if (aIdx !== -1) return -1
       if (bIdx !== -1) return 1
       return a.localeCompare(b)
    })
    setHooks(list)
    if (list.length > 0 && !selectedHook) {
      const defaultHook = list.find(h => standardHooks.includes(h)) || list[0]
      setSelectedHook(defaultHook)
    }
    setIsDirty(false)
  }

  useEffect(() => {
    refreshHookList()
  }, [projectPath, env, connectionStatus])

  // Load selected hook content
  useEffect(() => {
    if (!selectedHook) return
    const loadHook = async () => {
      setIsLoading(true)
      const data = await window.ipcRenderer.readHook(projectPath, selectedHook, env)
      setContent(data)
      setIsDirty(false)
      setIsLoading(false)
    }
    loadHook()
  }, [selectedHook, projectPath, env])

  const handleSave = async () => {
    if (!selectedHook) return
    setIsSaving(true)
    const res = await window.ipcRenderer.writeHook(projectPath, selectedHook, content, env)
    if (res.success) {
      setIsDirty(false)
      window.dispatchEvent(new CustomEvent('fs-update'))
    } else {
      alert('Failed to save hook: ' + res.error)
    }
    setIsSaving(false)
  }

  const handleContentChange = (value: string | undefined) => {
    setContent(value || '')
    setIsDirty(true)
  }

  // Handle Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, selectedHook])

  return (
    <>
      <Topbar compact title={selectedHook || 'Hooks'} breadcrumb="workspace" />
      <div className="main" style={{ flexDirection: 'row', padding: 0 }}>
        <div className="hook-list" style={{ width: 240, borderRight: '1px solid var(--border)', background: '#0D0E12' }}>
          <div className="hook-section" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Project Hooks</span>
            <RefreshCw size={14} className="action-icon" onClick={refreshHookList} style={{ cursor: 'pointer' }} />
          </div>
          {hooks.map(hook => (
            <div 
              key={hook}
              className={`hook-item ${selectedHook === hook ? 'active' : ''}`}
              onClick={() => setSelectedHook(hook)}
            >
              <FileCode size={14} className="hook-dot" />
              {hook}
            </div>
          ))}
        </div>

        <div className="editor-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1E1E1E' }}>
          <div className="editor-tabs" style={{ background: '#252526', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
            <div className="tab active">
              {selectedHook}
              {isDirty && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>●</span>}
            </div>
            <button 
              className={`btn-save ${isSaving ? 'saving' : ''}`} 
              onClick={handleSave}
              disabled={isSaving || !selectedHook}
              style={{ background: 'transparent', border: 'none', color: isDirty ? 'var(--accent)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <Save size={14} />
              {isSaving ? 'Saving...' : (isDirty ? 'Save Changes' : 'Saved')}
            </button>
          </div>
          
          <div style={{ flex: 1, position: 'relative' }}>
            {isLoading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="loading-spinner">Loading...</div>
              </div>
            )}
            {env === 'remote' && connectionStatus !== 'connected' ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', textAlign: 'center', padding: 40 }}>
                <div>
                  <RefreshCw size={48} className="action-icon" style={{ marginBottom: 16, opacity: 0.2 }} />
                  <div style={{ fontSize: 16, marginBottom: 8 }}>Waiting for Remote Connection</div>
                  <div style={{ fontSize: 13 }}>Hooks are stored on the remote target. Go to the Visualization tab to connect.</div>
                </div>
              </div>
            ) : (
              <Editor
                height="100%"
                defaultLanguage="python"
                theme="vs-dark"
                value={content}
                onChange={handleContentChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  padding: { top: 20 },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            )}
          </div>

          <div className="status-strip" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px', background: '#007ACC', color: 'white', fontSize: 11 }}>
             <div style={{ fontWeight: 600 }}>{env}</div>
             <div style={{ opacity: 0.8 }}>{projectPath}</div>
             <div style={{ marginLeft: 'auto' }}>Python 3.x</div>
          </div>
        </div>
      </div>

      <style>{`
        .hook-list {
          overflow-y: auto;
        }
        .hook-section {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text3);
          border-bottom: 1px solid var(--border);
        }
        .hook-item {
          padding: 10px 16px;
          font-size: 13px;
          color: var(--text3);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          border-left: 2px solid transparent;
        }
        .hook-item:hover {
          background: #1A1B20;
          color: var(--text1);
        }
        .hook-item.active {
          background: #252526;
          color: var(--accent);
          border-left-color: var(--accent);
        }
        .hook-dot {
          color: var(--text3);
        }
        .hook-item.active .hook-dot {
          color: var(--accent);
        }
        .editor-tabs {
          height: 35px;
          border-bottom: 1px solid #1a1a1a;
        }
        .tab {
          padding: 0 16px;
          height: 100%;
          display: flex;
          align-items: center;
          font-size: 12px;
          color: var(--text3);
          background: #2D2D2D;
          border-right: 1px solid #1a1a1a;
        }
        .tab.active {
          background: #1E1E1E;
          color: white;
        }
      `}</style>
    </>
  )
}
