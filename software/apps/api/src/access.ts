import type { CurrentUser } from './auth';

/** Returns a parameterized SQL fragment; every data endpoint must use this scope. */
export function applicationScope(user: CurrentUser, userParam: string, alias = 'a'): string {
  if (user.role === 'ADMIN' || user.role === 'LEADER') return 'TRUE';
  return `(
    EXISTS (
      SELECT 1 FROM ne_events scope_ne
      WHERE scope_ne.application_id = ${alias}.id
        AND (
          scope_ne.credited_sales_id = ${userParam}
          OR scope_ne.ctv_manager_at_ne_id = ${userParam}
        )
    )
    OR (
      NOT EXISTS (SELECT 1 FROM ne_events any_ne WHERE any_ne.application_id = ${alias}.id)
      AND (
        ${alias}.sales_owner_id = ${userParam}
        OR EXISTS (
          SELECT 1 FROM ctv scope_ctv
          WHERE scope_ctv.id = ${alias}.referrer_ctv_id
            AND scope_ctv.current_owner_sales_id = ${userParam}
        )
      )
    )
  )`;
}
