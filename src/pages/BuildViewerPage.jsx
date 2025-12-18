import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { decodeBuild } from '../components/wiki/BuildEncoder';
import Layout from '../components/layout/Layout';

const BuildViewerPage = () => {
  const [searchParams] = useSearchParams();
  const [build, setBuild] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const encodedBuild = searchParams.get('data');
    if (!encodedBuild) {
      setError('No build data provided');
      return;
    }

    const decoded = decodeBuild(encodedBuild);
    if (!decoded) {
      setError('Invalid build data');
      return;
    }

    setBuild(decoded);
  }, [searchParams]);

  if (error) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-red-800 dark:text-red-200 mb-2">
              Error Loading Build
            </h2>
            <p className="text-red-600 dark:text-red-300 mb-4">{error}</p>
            <Link
              to="/"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Return to Home
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (!build) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-8">
        <div className="mb-6">
          <Link
            to="/tools/build-creator"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            ← Create Your Own Build
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold mb-4">
            {build.name || 'Shared Build'}
          </h1>

          {build.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {build.description}
            </p>
          )}

          {/* Skills */}
          {build.skills && build.skills.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Skills</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {build.skills.map((skill, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                  >
                    <div className="font-medium">{skill.name}</div>
                    {skill.element && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Element: {skill.element}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {build.stats && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Stats</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(build.stats).map(([stat, value]) => (
                  <div
                    key={stat}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                  >
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {stat}
                    </div>
                    <div className="text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {build.equipment && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Equipment</h2>
              <div className="space-y-2">
                {Object.entries(build.equipment).map(([slot, item]) => (
                  <div
                    key={slot}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 flex justify-between items-center"
                  >
                    <span className="font-medium capitalize">{slot}:</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Companion */}
          {build.companion && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Companion</h2>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="font-medium">{build.companion}</div>
              </div>
            </div>
          )}

          {/* Notes */}
          {build.notes && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Notes</h2>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <p className="whitespace-pre-wrap">{build.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default BuildViewerPage;
