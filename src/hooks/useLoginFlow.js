import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Custom hook for handling GitHub OAuth login flow
 * Centralizes login logic for reuse across components
 */
export const useLoginFlow = () => {
  const {
    startLogin,
    completeLogin,
    cancelLogin,
    deviceFlow,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [showModal, setShowModal] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  const handleLogin = async () => {
    try {
      clearError();
      await startLogin();
      setShowModal(true);

      // Automatically start waiting for authorization
      setIsWaiting(true);
      try {
        await completeLogin();
        setShowModal(false);
        setIsWaiting(false);
      } catch (err) {
        setIsWaiting(false);
        // Error is handled by the store
      }
    } catch (err) {
      console.error('Login failed:', err);
      console.error('Error message:', err?.message);
      console.error('Error details:', JSON.stringify(err, null, 2));
    }
  };

  const handleCancel = () => {
    cancelLogin();
    setShowModal(false);
    setIsWaiting(false);
  };

  const copyUserCode = () => {
    if (deviceFlow?.userCode) {
      navigator.clipboard.writeText(deviceFlow.userCode);
    }
  };

  const openGitHub = () => {
    if (deviceFlow?.verificationUri) {
      window.open(deviceFlow.verificationUri, '_blank');
    }
  };

  return {
    // State
    showModal,
    isWaiting,
    isLoading,
    error,
    deviceFlow,
    // Actions
    handleLogin,
    handleCancel,
    copyUserCode,
    openGitHub,
  };
};
