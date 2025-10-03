import React from 'react';

interface ProgressCellProps {
    progress: number;
}

export const ProgressCell: React.FC<ProgressCellProps> = ({ progress }) => (
    <div className="progress-wrapper" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-value">{progress}%</span>
    </div>
);
