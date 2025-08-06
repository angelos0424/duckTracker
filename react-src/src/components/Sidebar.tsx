import React from 'react';

interface SidebarProps {
  selectedTab: 'downloads' | 'settings';
  onSelectTab: (tab: 'downloads' | 'settings') => void;
  downloadCount: number;
}

const Sidebar: React.FC<SidebarProps> = ({ selectedTab, onSelectTab, downloadCount }) => {
  return (
    <div className="app-tabs">
      <div className="tabs-container">
        <button
          className={`tab ${selectedTab === 'downloads' ? 'active' : ''}`}
          onClick={() => onSelectTab('downloads')}
        >
          <span className="tab-icon">📥</span>
          <span className="tab-text">Downloads</span>
          {downloadCount > 0 && (
            <span className="tab-badge">{downloadCount}</span>
          )}
        </button>
        <button
          className={`tab ${selectedTab === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectTab('settings')}
        >
          <span className="tab-icon">⚙️</span>
          <span className="tab-text">Settings</span>
        </button>
      </div>
      <div className="tab-indicator"></div>
    </div>
  );
};

export default Sidebar;
