// Helper function to get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

// Helper function to handle API errors
export function handleApiError(error: any): string {
  if (error.response?.data?.msg) {
    return error.response.data.msg;
  } else if (error.message) {
    return error.message;
  }
  return 'An error occurred';
}