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


  const messageQueueRef = useRef<any[]>([])
  const [messageSeq, setMessageSeq] = useState(0)
  const socketRef = useRef<WebSocket | null>(null)

  // 1. Fetch config and check health (Stable Polling)
  useEffect(() => {
    const fetchAndCheck = async () => {
      try {
        const config = await window.ipcRenderer.getApiConfig()
        if (!config) return

        // Only update if values actually change to prevent re-renders
        setApiConfig(prev => {
          if (prev && prev.token === config.token && prev.port === config.port) return prev;
          
          if (prev) {
            console.log('App: API Config changed, resetting connection...')
            setConnectionStatus('disconnected')
            if (socketRef.current) socketRef.current.close()
          }
          return config
        })

        const res = await fetch(`http://127.0.0.1:${config.port}/health`, {
          headers: { Authorization: `Bearer ${config.token}` }
        })

        if (res.ok) {
          setConnectionStatus(prev => prev !== 'connected' ? 'connected' : prev)
        } else {
          setConnectionStatus(prev => prev !== 'disconnected' ? 'disconnected' : prev)
        }
      } catch (e) {
        setConnectionStatus(prev => prev !== 'disconnected' ? 'disconnected' : prev)
      }
    }

    fetchAndCheck()
    const interval = setInterval(fetchAndCheck, 5000) // Slowed to 5s
    return () => clearInterval(interval)
  }, []) // Empty dependency array means it only starts once

  // 2. Manage WebSocket based on connection status
  useEffect(() => {
    if (connectionStatus !== 'connected' || !apiConfig) {
      if (socketRef.current) {
        console.log('App: Closing WebSocket (disconnected)')
        socketRef.current.close()
        socketRef.current = null
      }
      return
    }

    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const wsUrl = `ws://127.0.0.1:${apiConfig.port}/ws?token=${apiConfig.token}`
    console.log('App: Opening WebSocket...')
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'row_update') {
          // Append to immutable ref-based queue - never overwrites, never loses messages
          messageQueueRef.current.push(msg.data)
          setMessageSeq(n => n + 1) // nudge ParameterGrid to process new messages
        }
      } catch (e) {
        console.error('App: WS message error:', e)
      }
    }

    socket.onclose = () => {
      console.log('App: WS Closed')
      socketRef.current = null
    }

    socket.onerror = (e) => {
      console.error('App: WS Error:', e)
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [connectionStatus, apiConfig])

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
      {activeTab === 'parameters' && <ParameterGrid projectPath={currentProject.path} env={currentProject.env} messageQueueRef={messageQueueRef} messageSeq={messageSeq} />}
      {activeTab === 'visualization' && <ConnectionViz projectPath={currentProject.path} env={currentProject.env} />}
      {activeTab === 'hooks' && <HookEditor projectPath={currentProject.path} env={currentProject.env} connectionStatus={connectionStatus} />}
      {activeTab === 'terminal' && <div className="content"><div style={{ color: 'var(--text3)' }}>Terminal panel placeholder</div></div>}
      {activeTab === 'files' && <div className="content"><div style={{ color: 'var(--text3)' }}>Files panel placeholder</div></div>}
    </Layout>
  )
}
