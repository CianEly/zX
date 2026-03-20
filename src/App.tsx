import { useState } from 'react'
import { Layout } from './components/Layout'
import { ParameterGrid } from './views/ParameterGrid'
import { ConnectionViz } from './views/ConnectionViz'
import { HookEditor } from './views/HookEditor'

function App() {
  const [activeTab, setActiveTab] = useState('parameters')

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'parameters' && <ParameterGrid />}
      {activeTab === 'visualization' && <ConnectionViz />}
      {activeTab === 'hooks' && <HookEditor />}
      {activeTab === 'terminal' && <div className="content"><div style={{color: 'var(--text3)'}}>Terminal panel placeholder</div></div>}
      {activeTab === 'files' && <div className="content"><div style={{color: 'var(--text3)'}}>Files panel placeholder</div></div>}
    </Layout>
  )
}

export default App
