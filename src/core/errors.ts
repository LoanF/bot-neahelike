/** Erreur destinée au membre : son message est affiché tel quel, sans trace dans les logs. */
export class UserError extends Error {}

/** Code Postgres d'une violation de contrainte d'unicité. */
export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
