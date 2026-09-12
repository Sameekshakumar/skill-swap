// Helper function to get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

// Helper function to handle API errors
export function handleApiError(error: any): string {
  // The axios instance already unwraps server errors into Error.message.
  // The response checks are for anything that bypasses that interceptor.
  const data = error?.response?.data;
  return (
    data?.error ||
    data?.errors?.[0]?.msg ||
    data?.msg ||
    error?.message ||
    'An error occurred'
  );
}