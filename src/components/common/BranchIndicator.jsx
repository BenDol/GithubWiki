import { useBranchNamespace } from '../../hooks/useBranchNamespace';
import { useWikiConfig } from '../../hooks/useWikiConfig';

/**
 * BranchIndicator - Shows current git branch
 * Fixed position badge with color coding by branch type
 */
const BranchIndicator = () => {
  const { branch, loading } = useBranchNamespace();
  const { config } = useWikiConfig();

  // Check if branch indicator is enabled in config (default: true for dev, false for prod)
  const isEnabled = config?.features?.branchIndicator?.enabled ?? import.meta.env.DEV;

  // Don't show if disabled, while loading, or if branch not detected
  if (!isEnabled || loading || !branch) {
    return null;
  }

  // Color coding by branch
  const getBranchStyle = (branchName) => {
    const styles = {
      main: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        border: 'border-green-300 dark:border-green-700',
        text: 'text-green-700 dark:text-green-300',
      },
      dev: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        border: 'border-blue-300 dark:border-blue-700',
        text: 'text-blue-700 dark:text-blue-300',
      },
      staging: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        border: 'border-yellow-300 dark:border-yellow-700',
        text: 'text-yellow-700 dark:text-yellow-300',
      },
      default: {
        bg: 'bg-gray-100 dark:bg-gray-800',
        border: 'border-gray-300 dark:border-gray-600',
        text: 'text-gray-700 dark:text-gray-300',
      },
    };

    return styles[branchName.toLowerCase()] || styles.default;
  };

  const style = getBranchStyle(branch);

  return (
    <div
      className={`hidden md:block fixed bottom-4 right-4 z-50 ${style.bg} ${style.border} ${style.text} border-2 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm`}
      title={`Current git branch: ${branch}`}
    >
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        <span className="text-sm font-medium">{branch}</span>
      </div>
    </div>
  );
};

export default BranchIndicator;
