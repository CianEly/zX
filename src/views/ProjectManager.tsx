import { useState, useEffect } from 'react'
import { Folder, Plus, Clock, ChevronRight, HardDrive, Globe } from 'lucide-react'

interface ProjectManagerProps {
  onProjectSelect: (path: string, env: 'local' | 'remote') => void;
}

export function ProjectManager({ onProjectSelect }: ProjectManagerProps) {
  const [recentProjects, setRecentProjects] = useState<{ path: string; env: 'local' | 'remote' }[]>([])
  const [newProjectPath, setNewProjectPath] = useState('')
  const [env, setEnv] = useState<'local' | 'remote'>('local')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    window.ipcRenderer.getRecentProjects().then(setRecentProjects)
  }, [])

  const handleCreateProject = async () => {
    if (!newProjectPath) return
    setIsLoading(true)
    try {
      if (env === 'local') {
        const res = await window.ipcRenderer.initProject({ path: newProjectPath, env })
        if (!res.success) {
          alert('Error creating project: ' + res.error)
          return
        }
        // Use the normalized path returned from the backend
        const finalPath = res.path || newProjectPath
        await window.ipcRenderer.addRecentProject({ path: finalPath, env })
        onProjectSelect(finalPath, env)
      } else {
        // For remote, we just register it and scaffold later once connected
        await window.ipcRenderer.addRecentProject({ path: newProjectPath, env })
        onProjectSelect(newProjectPath, env)
      }
    } catch (e: any) {
      alert('Failed to initialize: ' + e.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBrowse = async () => {
    const res = await window.ipcRenderer.selectDirectory()
    if (!res.canceled && res.filePaths.length > 0) {
      setNewProjectPath(res.filePaths[0])
    }
  }

  return (
    <div className="project-manager">
      <div className="pm-container">
        <div className="pm-header">
          <div className="logo-mark">zX</div>
          <h1>Project Manager</h1>
          <p>Select a workspace to begin your parametric exploration</p>
        </div>

        <div className="pm-grid">
          {/* Recent Projects */}
          <div className="pm-section">
            <div className="section-title">
              <Clock size={16} />
              Recent Projects
            </div>
            <div className="recent-list">
              {recentProjects.length > 0 ? (
                recentProjects.map((proj) => (
                  <div key={proj.path} className="recent-item" onClick={async () => {
                    const finalPath = proj.env === 'local' ? await window.ipcRenderer.resolvePath(proj.path) : proj.path
                    onProjectSelect(finalPath, proj.env)
                  }}>
                    <Folder size={20} className="folder-icon" />
                    <div className="item-details">
                      <div className="item-path">{proj.path}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>{proj.env}</div>
                    </div>
                    <button
                      title="Remove from recent"
                      onClick={async (e) => {
                        e.stopPropagation()
                        const updated = await window.ipcRenderer.removeRecentProject(proj.path)
                        setRecentProjects(updated)
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px', borderRadius: 4, display: 'flex', opacity: 0.6 }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                    >
                      ✕
                    </button>
                    <ChevronRight size={16} className="chevron" />
                  </div>
                ))
              ) : (
                <div className="empty-state">No recent projects found</div>
              )}
            </div>
          </div>

          {/* New / Open Project */}
          <div className="pm-section">
            <div className="section-title">
              <Plus size={16} />
              Setup Project
            </div>
            
            <div className="setup-card">
              <div className="seg-ctrl" style={{ marginBottom: 20 }}>
                <div 
                  className={`seg ${env === 'local' ? 'active' : ''}`}
                  onClick={() => setEnv('local')}
                >
                  <HardDrive size={14} /> Local
                </div>
                <div 
                  className={`seg ${env === 'remote' ? 'active' : ''}`}
                  onClick={() => setEnv('remote')}
                >
                  <Globe size={14} /> Remote
                </div>
              </div>

              <div className="label">Project Path</div>
              <div className="field-group">
                <input 
                  type="text" 
                  className="field" 
                  placeholder={env === 'local' ? 'e.g. ~/my-project' : 'e.g. /home/user/project'}
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                />
                {env === 'local' && (
                  <button className="btn btn-ghost" onClick={handleBrowse}>Browse</button>
                )}
              </div>

              <button 
                className={`btn btn-accent btn-full ${isLoading ? 'loading' : ''}`}
                style={{ marginTop: 20 }}
                onClick={handleCreateProject}
                disabled={isLoading || !newProjectPath}
              >
                {isLoading ? 'Initializing...' : 'Open or Create Project'}
              </button>
              <p className="hint">
                {env === 'local' 
                  ? "This will scaffold a zX project in your local directory."
                  : "Ensure an SSH connection is established before opening remote projects."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .project-manager {
          position: fixed;
          inset: 0;
          background: #0A0B0F;
          color: white;
          z-index: 1000;
          display: flex;
          justify-content: center;
          padding-top: 80px;
          overflow-y: auto;
        }
        .pm-container {
          width: 100%;
          max-width: 900px;
          padding: 40px;
        }
        .pm-header {
          text-align: center;
          margin-bottom: 60px;
        }
        .pm-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 20px 0 8px;
          background: linear-gradient(135deg, #fff 0%, #a5a5a5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pm-header p {
          color: var(--text3);
          font-size: 16px;
        }
        .pm-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text3);
          margin-bottom: 16px;
        }
        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .recent-item {
          background: #15161A;
          border: 1px solid var(--border);
          padding: 12px 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .recent-item:hover {
          border-color: var(--accent);
          background: #1A1B20;
          transform: translateY(-1px);
        }
        .folder-icon {
          color: var(--accent);
          margin-right: 12px;
        }
        .item-details {
          flex: 1;
        }
        .item-path {
          font-size: 13px;
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chevron {
          color: var(--text3);
          opacity: 0;
          transition: 0.2s;
        }
        .recent-item:hover .chevron {
          opacity: 1;
        }
        .empty-state {
          padding: 40px;
          text-align: center;
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--text3);
          font-size: 13px;
        }
        .setup-card {
          background: #15161A;
          border: 1px solid var(--border);
          padding: 24px;
          border-radius: 12px;
        }
        .field-group {
          display: flex;
          gap: 8px;
        }
        .hint {
          font-size: 11px;
          color: var(--text3);
          margin-top: 12px;
          line-height: 1.4;
        }
      `}</style>
    </div>
  )
}
