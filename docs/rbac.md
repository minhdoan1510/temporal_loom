# RBAC — Role-Based Access Control

Lending Claw uses [Casbin v2](https://casbin.org/) for RBAC with a MySQL adapter that reuses the existing `*sql.DB` connection (no GORM).

## Permission Model

Permissions use the format `tab:<name>:<action>` for tab resources and `tool:<name>` for tools.

### Tab Permissions

| Tab | read | create | update | delete |
|-----|------|--------|--------|--------|
| sessions | list + get sessions | agent/run (new session) | — | delete session |
| skills | list + get skills | create skill | update skill | delete skill |
| context-files | list context files | — | upsert context file | — |
| traces | list + get traces | — | — | — |
| roles | list roles + resources | create role, add member | update role perms | delete role, remove member |

### Tool Permissions

Flat format: `tool:<name>` (e.g. `tool:read_jira_ticket`, `tool:search_knowledge`). Controls which tools the agent can use for a given user.

## Casbin Model

```
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
```

Policies are stored as `(role, resource, "access")`. Users are assigned to roles via grouping policies `(user_sub, role)`.

## Bootstrap Mode

When no policies exist in `casbin_rule` table, `HasRoles()` returns false and the RBAC middleware **bypasses all checks** — every user gets full access. This ensures the system is usable before any roles are configured.

Once the first role is created, RBAC enforcement activates for all users.

## Middleware Chain

```
Request → CORS → Tracing → Auth → RBAC → Route Handler
```

- **Auth Middleware**: Extracts JWT `sub` claim, skips public routes (`/set-token`, `/logout`, `/health`)
- **RBAC Middleware**: Loads user permissions via Casbin, sets `permissions []string` and `allowedTools []string` in request context. Bypasses in bootstrap mode.
- **Route Guards**: Each route handler is wrapped with `requirePermission("tab:<name>:<action>", handler)` — returns 403 if permission not found in context.

## API Endpoints

| Method | Path | Permission |
|--------|------|------------|
| POST | `/api/v1/agent/run` | `tab:sessions:create` |
| GET | `/api/v1/sessions` | `tab:sessions:read` |
| GET | `/api/v1/sessions/{key}` | `tab:sessions:read` |
| DELETE | `/api/v1/sessions/{key}` | `tab:sessions:delete` |
| GET | `/api/v1/skills` | `tab:skills:read` |
| POST | `/api/v1/skills` | `tab:skills:create` |
| GET | `/api/v1/skills/{id}` | `tab:skills:read` |
| PUT | `/api/v1/skills/{id}` | `tab:skills:update` |
| DELETE | `/api/v1/skills/{id}` | `tab:skills:delete` |
| GET | `/api/v1/context-files` | `tab:context-files:read` |
| PUT | `/api/v1/context-files` | `tab:context-files:update` |
| GET | `/api/v1/traces` | `tab:traces:read` |
| GET | `/api/v1/traces/{id}` | `tab:traces:read` |
| GET | `/api/v1/rbac/me` | *(unguarded)* |
| GET | `/api/v1/rbac/resources` | `tab:roles:read` |
| GET | `/api/v1/rbac/roles` | `tab:roles:read` |
| POST | `/api/v1/rbac/roles` | `tab:roles:create` |
| PUT | `/api/v1/rbac/roles/{name}` | `tab:roles:update` |
| DELETE | `/api/v1/rbac/roles/{name}` | `tab:roles:delete` |
| POST | `/api/v1/rbac/roles/{name}/members` | `tab:roles:create` |
| DELETE | `/api/v1/rbac/roles/{name}/members/{sub}` | `tab:roles:delete` |

## Frontend Integration

### Auth Store (`stores/auth.ts`)

- `hasPermission(resource)` — exact match, returns true in bootstrap mode (null permissions)
- `hasTabAccess(tabName)` — returns true if user has ANY `tab:<name>:*` permission

### Navigation

`AppLayout.tsx` filters sidebar nav items using `hasTabAccess()`. A tab is visible if the user has at least one CRUD permission for it.

### Button Visibility

Each page conditionally renders create/edit/delete buttons based on specific permissions:

| Page | Create | Update | Delete |
|------|--------|--------|--------|
| SessionsPage | `tab:sessions:create` | — | `tab:sessions:delete` |
| SkillsPage | `tab:skills:create` | `tab:skills:update` | `tab:skills:delete` |
| ContextFilesPage | — | `tab:context-files:update` | — |
| RolesPage | `tab:roles:create` | `tab:roles:update` | `tab:roles:delete` |

### Roles Page

Roles are displayed as collapsible cards (multiple can be expanded). Expanded view shows:
- **CRUD permission matrix** — read-only table with check/dash icons per tab action
- **Tool permissions** — badges listing granted tools
- **Members** — inline list with add/remove controls

## Files

| File | Purpose |
|------|---------|
| `internal/rbac/enforcer.go` | Casbin enforcer wrapper with business methods |
| `internal/rbac/adapter.go` | MySQL adapter for Casbin policy storage |
| `internal/http/rbac.go` | RBAC HTTP handlers (roles CRUD, resources, me) |
| `internal/http/rbac_guard.go` | `requirePermission()` guard + context helpers |
| `internal/http/middleware.go` | `RBACMiddleware` — loads permissions into context |
| `internal/http/router.go` | Route registration with per-endpoint permission guards |
| `internal/config/types.go` | `RBACConfig{Enabled bool}` |
| `migrations/000005_rbac.up.sql` | `casbin_rule` table (Casbin standard schema) |
| `ui/web/src/stores/auth.ts` | `hasPermission()`, `hasTabAccess()` |
| `ui/web/src/pages/RolesPage.tsx` | Role management UI with collapsible cards |

## Configuration

```yaml
rbac:
  enabled: true
```

Set `rbac.enabled: false` (or omit) to disable RBAC entirely — no middleware, no route guards.
