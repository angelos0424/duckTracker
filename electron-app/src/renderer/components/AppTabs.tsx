import * as React from 'react';

type AppTab = 'downloads' | 'settings';

interface AppTabsProps {
    selected: AppTab;
    downloadsCount: number;
    onSelect: (tab: AppTab) => void;
}

const AppTabs: React.FC<AppTabsProps> = ({ selected, downloadsCount, onSelect }) => (
    <div className="app-tabs">
        <div className="tabs-container">
            <button
                className={`tab ${selected === 'downloads' ? 'active' : ''}`}
                onClick={() => onSelect('downloads')}
            >
                <span className="tab-icon">📥</span>
                <span className="tab-text">Downloads</span>
                {downloadsCount > 0 && (
                    <span className="tab-badge">{downloadsCount}</span>
                )}
            </button>
            <button
                className={`tab ${selected === 'settings' ? 'active' : ''}`}
                onClick={() => onSelect('settings')}
            >
                <span className="tab-icon">⚙️</span>
                <span className="tab-text">Settings</span>
            </button>
        </div>
    </div>
);

export default AppTabs;
