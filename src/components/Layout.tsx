import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  return (
    <div className="shell shell-vertical">
      <div className="shell">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="main">
          {children}
        </div>
      </div>
    </div>
  );
}
