// One password rule for every login (staff, admins, shop admins, clients): at
// least 8 characters, at least one of them a digit. The server refuses
// anything else (passwordProblem in server/domain/common.js); the screens check
// first so the form can say so before sending.

export const PASSWORD_MIN_LENGTH = 8;

/** Long enough. */
export const passwordLongEnough = (password: string | null | undefined) => (password || "").length >= PASSWORD_MIN_LENGTH;

/** Has a digit. */
export const passwordHasDigit = (password: string | null | undefined) => /\d/.test(password || "");

/** Meets the whole rule. */
export const passwordOk = (password: string | null | undefined) => passwordLongEnough(password) && passwordHasDigit(password);
