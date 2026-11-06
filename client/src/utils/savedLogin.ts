// Saved login data can be damaged (edited by hand, a browser glitch). Reading
// it must never stop the app from starting: damaged means "not there".
export const SAVED_LOGIN_KEYS = ["token", "user", "originalToken", "originalUser"];

/** The saved value; null if there is none; undefined if it can't be read. */
export const readSavedJson = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return undefined;
  }
};
