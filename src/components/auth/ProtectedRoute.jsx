import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * ProtectedRoute component
 * Wraps routes that require authentication
 */
const ProtectedRoute = ({ children, fallback = '/' }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to fallback if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={fallback} replace />;
  }

  return children;
};

export default ProtectedRoute;
