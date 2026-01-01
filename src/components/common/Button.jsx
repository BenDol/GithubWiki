import clsx from 'clsx';

/**
 * Reusable Button component
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variants = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 shadow-elevated hover:shadow-floating transition-shadow',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 shadow-raised hover:shadow-elevated transition-shadow dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:shadow-none',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-800',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 shadow-elevated hover:shadow-floating transition-shadow',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const disabledClasses = 'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

  return (
    <button
      className={clsx(baseClasses, variants[variant], sizes[size], disabledClasses, className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
