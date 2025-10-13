import React from 'react';

export interface StatusFilterOption {
    value: string;
    label: string;
    count: number;
}

interface StatusFilterControlsProps {
    options: StatusFilterOption[];
    selected: readonly string[];
    onStatusToggle: (value: string) => void;
}

export const StatusFilterControls: React.FC<StatusFilterControlsProps> = ({
    options,
    selected,
    onStatusToggle,
}) => {
    const hasSelection = selected.length > 0;

    return (
        <div className="status-controls" role="region" aria-label="상태 필터">
            <div className="status-controls__filters" role="group" aria-label="상태 필터">
                <div className="status-controls__chip-row">
                    {options.map((option) => {
                        const isActive = selected.includes(option.value);
                        const isDisabled = option.count === 0 && !isActive;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                className={`status-chip${isActive ? ' status-chip--active' : ''}`}
                                onClick={() => onStatusToggle(option.value)}
                                disabled={isDisabled}
                                aria-pressed={isActive}
                            >
                                <span className="status-chip__label">{option.label}</span>
                                <span className="status-chip__count" aria-hidden="true">
                                    {option.count.toLocaleString('ko-KR')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
