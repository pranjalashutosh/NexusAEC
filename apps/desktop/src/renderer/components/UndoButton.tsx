/**
 * UndoButton Component
 * Button to undo an individual action with confirmation dialog
 */

import React, { useState } from 'react';

interface UndoButtonProps {
  onUndo: () => void | Promise<void>;
  entryId: string;
  confirmRequired?: boolean;
  label?: string;
}

export function UndoButton({
  onUndo,
  entryId,
  confirmRequired = false,
  label = 'Undo',
}: UndoButtonProps): React.ReactElement {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async () => {
    if (confirmRequired && !isConfirming) {
      setIsConfirming(true);
      // Auto-dismiss after 3 seconds
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }

    setIsProcessing(true);
    try {
      await Promise.resolve(onUndo());
    } finally {
      setIsProcessing(false);
      setIsConfirming(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirming(false);
  };

  if (isConfirming) {
    return (
      <div className="undo-confirm-group">
        <span className="undo-confirm-text">Confirm?</span>
        <button
          className="btn btn-sm btn-danger"
          onClick={handleClick}
          disabled={isProcessing}
        >
          {isProcessing ? '...' : 'Yes'}
        </button>
        <button className="btn btn-sm btn-secondary" onClick={handleCancel}>
          No
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn btn-sm btn-ghost undo-button"
      onClick={handleClick}
      disabled={isProcessing}
      title={`Undo action ${entryId}`}
    >
      {isProcessing ? (
        <span className="undo-spinner">↻</span>
      ) : (
        <>
          <span className="undo-icon">↩</span>
          <span className="undo-label">{label}</span>
        </>
      )}
    </button>
  );
}

/**
 * BatchUndoButton Component
 * Button to undo multiple selected actions at once
 */
interface BatchUndoButtonProps {
  selectedIds: string[];
  onBatchUndo: (ids: string[]) => Promise<void>;
  disabled?: boolean;
}

export function BatchUndoButton({
  selectedIds,
  onBatchUndo,
  disabled = false,
}: BatchUndoButtonProps): React.ReactElement {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const count = selectedIds.length;

  const handleClick = async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsProcessing(true);
    try {
      await onBatchUndo(selectedIds);
    } finally {
      setIsProcessing(false);
      setIsConfirming(false);
    }
  };

  if (count === 0) {
    return <></>;
  }

  return (
    <div className="batch-undo-container">
      <span className="batch-undo-count">{count} selected</span>
      {isConfirming ? (
        <div className="batch-undo-confirm">
          <span>Undo {count} action{count > 1 ? 's' : ''}?</span>
          <button
            className="btn btn-danger"
            onClick={handleClick}
            disabled={isProcessing}
          >
            {isProcessing ? 'Undoing...' : 'Confirm'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setIsConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="btn btn-secondary"
          onClick={handleClick}
          disabled={disabled || isProcessing}
        >
          ↩ Undo Selected
        </button>
      )}
    </div>
  );
}
