import React from 'react';
import { ConfirmationDialogProps } from '../types/types';

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  confirmButtonColor = 'info',
  icon = 'ℹ️',
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-container">
        <div className="dialog-content">
          <div className="dialog-header">
            <span className="dialog-icon">{icon}</span>
            <h3 className="dialog-title">{title}</h3>
          </div>
          <div className="dialog-body">
            <p className="dialog-message">{message}</p>
          </div>
          <div className="dialog-actions">
            <button className="dialog-button cancel-button" onClick={onClose}>
              {cancelButtonText}
            </button>
            <button
              className={`dialog-button confirm-button ${confirmButtonColor}`}
              onClick={onConfirm}
            >
              {confirmButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
