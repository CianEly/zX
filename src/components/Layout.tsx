import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  port?: string;
}

export function Layout({ children, activeTab, setActiveTab, connectionStatus, port }: LayoutProps) {
  return (
    <div className="shell shell-vertical">
      <div className="shell">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} connectionStatus={connectionStatus} port={port} />
        <div className="main">
          {children}
        </div>
      </div>
    </div>
  );
}
