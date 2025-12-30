import React, { useState } from 'react';
import { Bug, MessageSquare } from 'lucide-react';
import { IssueReportModal } from './IssueReportModal.jsx';

/**
 * Issue Report Button
 * Reusable button component to trigger the issue report modal
 * Supports multiple variants for different UI contexts
 */
export const IssueReportButton = ({
  variant = 'header',
  label = 'Report Issue',
  icon: Icon = Bug,
  className = '',
  context = null,
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
  };

  // Render different button styles based on variant
  const renderButton = () => {
    switch (variant) {
      case 'header':
        return (
          <button
            onClick={handleClick}
            className={`hidden md:flex items-center justify-center p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${className}`}
            aria-label={label}
            title={label}
          >
            <Icon className="w-5 h-5" />
          </button>
        );

      case 'footer':
        return (
          <button
            onClick={handleClick}
            className={`text-sm text-slate-400 hover:text-white transition-colors ${className}`}
            aria-label={label}
          >
            {label}
          </button>
        );

      case 'page':
        return (
          <button
            onClick={handleClick}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg ${className}`}
            aria-label={label}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        );

      case 'floating':
        return (
          <button
            onClick={handleClick}
            className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 ${className}`}
            aria-label={label}
            title={label}
          >
            <Icon className="w-5 h-5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );

      default:
        return (
          <button
            onClick={handleClick}
            className={`flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${className}`}
            aria-label={label}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        );
    }
  };

  return (
    <>
      {renderButton()}
      <IssueReportModal isOpen={showModal} onClose={handleClose} />
    </>
  );
};
