import React from 'react';

const TierCard = ({ item, onClick }) => {
  return (
    <div
      onClick={() => onClick && onClick(item)}
      className={`bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      {item.image && (
        <img
          src={item.image}
          alt={item.name}
          className="w-full h-24 object-cover rounded mb-2"
        />
      )}
      <h4 className="font-semibold text-sm mb-1">{item.name}</h4>
      {item.description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
          {item.description}
        </p>
      )}
      {item.element && (
        <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-600">
          {item.element}
        </span>
      )}
    </div>
  );
};

export default TierCard;
