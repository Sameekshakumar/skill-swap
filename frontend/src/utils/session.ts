// Where the session token lives depends on the "Keep me signed in" choice.
//
//   remembered  -> localStorage, survives closing the browser
//   not         -> sessionStorage, cleared when the tab closes
//
// The remember flag itself always lives in localStorage, because the login page
// needs to know the preference before any token exists.

const TOKEN_KEY = 'token';
const REMEMBER_KEY = 'rememberMe';

export const getToken = (): string | null =>
  localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);

export const setToken = (token: string, remember: boolean): void => {
  // Clear both first so a token never lingers in the store we are not using.
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);

  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  localStorage.setItem(REMEMBER_KEY, String(remember));
};

export const clearToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
};

export const isRemembered = (): boolean => localStorage.getItem(REMEMBER_KEY) === 'true';

// Signing out is an explicit "not now", so automatic sign-in stays off until
// the next deliberate sign-in.
export const forgetMe = (): void => localStorage.setItem(REMEMBER_KEY, 'false');
