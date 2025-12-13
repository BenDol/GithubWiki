import { useState } from 'react';
import { Settings, Database, Image } from 'lucide-react';
import ImageDatabaseManager from '../components/dev/ImageDatabaseManager';

/**
 * DevToolsPage - Internal development tools for wiki maintenance
 *
 * Available tools:
 * - Image Database Manager: Manage image database, scan orphans, bulk operations
 */
export default function DevToolsPage() {
  const [activeTab, setActiveTab] = useState('image-db');

  const tools = [
    {
      id: 'image-db',
      name: 'Image Database',
      icon: Image,
      description: 'Manage image database, scan orphans, and perform bulk operations',
      component: ImageDatabaseManager,
    },
    // Future tools can be added here
    // {
    //   id: 'cache-manager',
    //   name: 'Cache Manager',
    //   icon: Database,
    //   description: 'Clear and manage application caches',
    //   component: CacheManager,
    // },
  ];

  const activeTool = tools.find((t) => t.id === activeTab);
  const ToolComponent = activeTool?.component;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Developer Tools
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Internal tools for wiki maintenance and administration
        </p>
      </div>

      {/* Tool Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTab(tool.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors
                  ${
                    activeTab === tool.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{tool.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tool Description */}
      {activeTool && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            {activeTool.description}
          </p>
        </div>
      )}

      {/* Active Tool Component */}
      {ToolComponent && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <ToolComponent />
        </div>
      )}
    </div>
  );
}
