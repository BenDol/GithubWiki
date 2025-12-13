import React, { useState } from 'react';
import TierCard from './TierCard';

const TierList = ({ items, onItemClick }) => {
  const [filter, setFilter] = useState('all');

  const tiers = [
    { id: 'S', name: 'S Tier', color: 'bg-red-500', textColor: 'text-white' },
    { id: 'A', name: 'A Tier', color: 'bg-orange-500', textColor: 'text-white' },
    { id: 'B', name: 'B Tier', color: 'bg-yellow-500', textColor: 'text-white' },
    { id: 'C', name: 'C Tier', color: 'bg-green-500', textColor: 'text-white' },
    { id: 'D', name: 'D Tier', color: 'bg-blue-500', textColor: 'text-white' },
  ];

  const categories = items ? [...new Set(items.map((item) => item.category).filter(Boolean))] : [];

  const filteredItems = filter === 'all'
    ? items
    : items.filter((item) => item.category === filter);

  const itemsByTier = {};
  tiers.forEach((tier) => {
    itemsByTier[tier.id] = filteredItems.filter((item) => item.tier === tier.id);
  });

  return (
    <div>
      {categories.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Filter by Category</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tiers.map((tier) => (
          itemsByTier[tier.id] && itemsByTier[tier.id].length > 0 && (
            <div key={tier.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className={`${tier.color} ${tier.textColor} px-4 py-2 font-bold text-lg`}>
                {tier.name}
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {itemsByTier[tier.id].map((item, index) => (
                    <TierCard key={index} item={item} onClick={onItemClick} />
                  ))}
                </div>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export default TierList;
