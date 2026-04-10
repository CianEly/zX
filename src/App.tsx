import { useState, useEffect, useRef } from 'react'
import { Layout } from './components/Layout'
import { ParameterGrid } from './views/ParameterGrid'
import { ConnectionViz } from './views/ConnectionViz'
import { HookEditor } from './views/HookEditor'
import { ProjectManager } from './views/ProjectManager'

export default function App() {
  const [activeTab, setActiveTab] = useState('parameters')
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [apiConfig, setApiConfig] = useState<{ port: string; token: string } | null>(null)
  const [currentProject, setCurrentProject] = useState<{ path: string; env: 'local' | 'remote' } | null>(null)


  const [lastRowUpdate, setLastRowUpdate] = useState<any>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<any>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await window.ipcRenderer.getApiConfig()
        if (config) {
          setApiConfig(prev => {
            if (prev?.port === config.port && prev?.token === config.token) return prev
            return config
          })
        }
      } catch (e) {
        console.error('Error fetching API config:', e)
      }
    }

    fetchConfig()
    const interval = setInterval(fetchConfig, 3000)
    return () => clearInterval(interval)
  }, [])

  // Persistent WebSocket for row updates
  useEffect(() => {
    if (!apiConfig || connectionStatus !== 'connected') {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      return
    }

    const connect = () => {
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        return
      }

      const wsUrl = `ws://127.0.0.1:${apiConfig.port}/ws?token=${apiConfig.token}`
      console.log('App: Connecting WebSocket...')
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'row_update') {
            setLastRowUpdate(msg.data)
          }
        } catch (e) {
          console.error('App: WS message error:', e)
        }
      }

      socket.onclose = () => {
        console.log('App: WS Closed, reconnecting...')
        socketRef.current = null
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }

      socket.onerror = (e) => {
        console.error('App: WS Error:', e)
      }
    }

    connect()
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [apiConfig, connectionStatus])

  useEffect(() => {
    if (!apiConfig) return
    console.log('API Config loaded, starting health checks on port:', apiConfig.port)

    const checkHealth = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${apiConfig.port}/health`, {
          headers: { Authorization: `Bearer ${apiConfig.token}` }
        })
        if (res.ok) {
          if (connectionStatus !== 'connected') setConnectionStatus('connected')
        } else {
          if (connectionStatus !== 'disconnected') setConnectionStatus('disconnected')
        }
      } catch (e) {
        if (connectionStatus !== 'disconnected') setConnectionStatus('disconnected')
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 3000)
    return () => clearInterval(interval)
  }, [apiConfig, connectionStatus])

  if (!currentProject) {
    return (
      <ProjectManager 
        onProjectSelect={async (path, env) => {
          const finalPath = env === 'local' ? await window.ipcRenderer.resolvePath(path) : path
          setCurrentProject({ path: finalPath, env })
        }} 
      />
    )
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      connectionStatus={connectionStatus}
      port={apiConfig?.port}
      projectPath={currentProject.path}
      onSwitchProject={async () => {
        await window.ipcRenderer.disconnect()
        setCurrentProject(null)
        setConnectionStatus('disconnected')
      }}
    >
      {activeTab === 'parameters' && <ParameterGrid projectPath={currentProject.path} env={currentProject.env} lastRowUpdate={lastRowUpdate} />}
      {activeTab === 'visualization' && <ConnectionViz projectPath={currentProject.path} env={currentProject.env} />}
      {activeTab === 'hooks' && <HookEditor projectPath={currentProject.path} env={currentProject.env} connectionStatus={connectionStatus} />}
      {activeTab === 'terminal' && <div className="content"><div style={{ color: 'var(--text3)' }}>Terminal panel placeholder</div></div>}
      {activeTab === 'files' && <div className="content"><div style={{ color: 'var(--text3)' }}>Files panel placeholder</div></div>}
    </Layout>
  )
}
