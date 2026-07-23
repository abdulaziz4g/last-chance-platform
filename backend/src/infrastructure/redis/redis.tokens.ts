/**
 * DI tokens in their own file so providers and the module never import each
 * other (a module<->provider cycle leaves tokens undefined at decorator
 * evaluation time — Nest then sees an unresolvable dependency).
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');
