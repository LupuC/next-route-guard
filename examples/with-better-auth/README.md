# Example: Better Auth + next-route-guard

Use `betterAuthGetSession` in `createGuard` / `withGuard` so API routes get a full session. In **middleware**, only the session **cookie** is checked (optimistic pass-through when the cookie exists).

See the main `README.md` for configuration fields.
