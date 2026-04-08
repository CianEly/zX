import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  port?: string;
  projectPath?: string;
  onSwitchProject?: () => void;
}

export function Layout({ children, activeTab, setActiveTab, connectionStatus, port, projectPath, onSwitchProject }: LayoutProps) {
  return (
    <div className="shell shell-vertical">
      <div className="shell">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          connectionStatus={connectionStatus} 
          port={port} 
          projectPath={projectPath}
          onSwitchProject={onSwitchProject}
        />
        <div className="main">
          {children}
        </div>
      </div>
    </div>
  );
}
