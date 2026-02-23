import { useState } from 'react';

interface FilterState {
  skillLevel: string;
  creditRate: number;
  availability: string;
  minRating: number;
}

export default function FilterPanel({ onFilter }: { onFilter: (filters: FilterState) => void }) {
  const [filters, setFilters] = useState<FilterState>({
    skillLevel: 'all',
    creditRate: 0,
    availability: 'all',
    minRating: 0
  });

  return (
    <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
      <div className="grid grid-cols-4 gap-4">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2"
          value={filters.skillLevel}
          onChange={(e) => setFilters({...filters, skillLevel: e.target.value})}
        >
          <option value="all">All Levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        
        {/* Similar selects for creditRate, availability, and minRating */}
      </div>
    </div>
  );
}
