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
    let intervalId: any
    
    // 1. Get API config from Electron Main
    window.ipcRenderer.getApiConfig().then(config => {
      setApiConfig(config)
      
      // 2. Poll health endpoint
      const checkHealth = async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${config.port}/health`, {
            headers: {
              'Authorization': `Bearer ${config.token}`
            }
          })
          if (res.ok) {
            setConnectionStatus('connected')
          } else {
            setConnectionStatus('error')
          }
        } catch (e) {
          setConnectionStatus('connecting')
        }
      }

      intervalId = setInterval(checkHealth, 2000)
      checkHealth()
    }).catch(() => {
      setConnectionStatus('error')
    })

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

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
      {activeTab === 'terminal' && <div className="content"><div style={{color: 'var(--text3)'}}>Terminal panel placeholder</div></div>}
      {activeTab === 'files' && <div className="content"><div style={{color: 'var(--text3)'}}>Files panel placeholder</div></div>}
    </Layout>
  )
}
