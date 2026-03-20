import { Layers, Activity, Wrench, Terminal, Folder } from 'lucide-react';
import { StatusBar } from './StatusBar';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="logo">
        <div className="logo-mark">zX</div>
        <div className="logo-text">zX</div>
        <div className="logo-ver">v0.1</div>
      </div>
      <nav className="nav">
        <div className="nav-section">workspace</div>
        <div 
          className={`nav-item ${activeTab === 'parameters' ? 'active' : ''}`}
          onClick={() => setActiveTab('parameters')}
        >
          <Layers className="nav-icon" size={16} />
          Parameters
        </div>
        <div 
          className={`nav-item ${activeTab === 'visualization' ? 'active' : ''}`}
          onClick={() => setActiveTab('visualization')}
        >
          <Activity className="nav-icon" size={16} />
          Visualization
        </div>
        <div className="nav-section">tools</div>
        <div 
          className={`nav-item ${activeTab === 'hooks' ? 'active' : ''}`}
          onClick={() => setActiveTab('hooks')}
        >
          <Wrench className="nav-icon" size={16} />
          Hooks
        </div>
        <div 
          className={`nav-item ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          <Terminal className="nav-icon" size={16} />
          Terminal
        </div>
        <div 
          className={`nav-item ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Folder className="nav-icon" size={16} />
          Files
        </div>
      </nav>
      <StatusBar />
    </div>
  );
}
