import { useState } from 'react';
import Input from '../shared/Input';

export default function SearchBar({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');

  return (
    <div className="w-full max-w-3xl mx-auto mb-6">
      <Input
        icon="mdi:magnify"
        placeholder="Search for skills, teachers, or keywords..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSearch(e.target.value);
        }}
        className="text-lg py-3"
      />
    </div>
  );
}
