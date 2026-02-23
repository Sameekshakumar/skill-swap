import { Icon } from '@iconify/react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: string;
  label?: string;
  error?: string;
}

export default function Input({ 
  icon, 
  label, 
  error, 
  className = '', 
  ...props 
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon 
            icon={icon} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" 
          />
        )}
        <input
          className={`
            w-full rounded-lg border border-gray-300 px-4 py-2
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-500' : 'focus:border-purple-500'}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
