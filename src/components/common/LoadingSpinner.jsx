/**
 * Loading Spinner component
 */
const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`inline-block animate-spin rounded-full border-b-2 border-blue-500 ${sizes[size]} ${className}`} />
  );
};

export default LoadingSpinner;
