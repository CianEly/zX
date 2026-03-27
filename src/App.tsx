import { useState, useEffect } from 'react'
import { Layout } from './components/Layout'
import { ParameterGrid } from './views/ParameterGrid'
import { ConnectionViz } from './views/ConnectionViz'
import { HookEditor } from './views/HookEditor'

export default function App() {
  const [activeTab, setActiveTab] = useState('parameters')
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('connecting')
  const [apiConfig, setApiConfig] = useState<{ port: string; token: string } | null>(null)


  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await window.ipcRenderer.getApiConfig()
        setApiConfig(prev => {
          if (prev?.port === config.port && prev?.token === config.token) return prev
          return config
        })
      } catch {
        setConnectionStatus('error')
      }
    }

    fetchConfig()

    const interval = setInterval(fetchConfig, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!apiConfig) return

    const checkHealth = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${apiConfig.port}/health`, {
          headers: { Authorization: `Bearer ${apiConfig.token}` }
        })
        setConnectionStatus(res.ok ? 'connected' : 'error')
      } catch {
        setConnectionStatus('connecting')
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 2000)
    return () => clearInterval(interval)
  }, [apiConfig])

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      connectionStatus={connectionStatus}
      port={apiConfig?.port}
    >
      {activeTab === 'parameters' && <ParameterGrid />}
      {activeTab === 'visualization' && <ConnectionViz />}
      {activeTab === 'hooks' && <HookEditor />}
      {activeTab === 'terminal' && <div className="content"><div style={{ color: 'var(--text3)' }}>Terminal panel placeholder</div></div>}
      {activeTab === 'files' && <div className="content"><div style={{ color: 'var(--text3)' }}>Files panel placeholder</div></div>}
    </Layout>
  )
}
