package rbac

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
)

// casbinModel is the domain (tenant) RBAC model. The domain is the workspace
// id; policies and role groupings are scoped per workspace so a user can hold
// different roles in different workspaces.
const casbinModel = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && r.act == p.act
`

const actionAccess = "access"

// AdminRole is the per-workspace role granted full access. Every workspace must
// retain at least one member of this role.
const AdminRole = "admin"

// ErrLastAdmin is returned when an operation would leave a workspace with no
// admin member (removing the last admin, or deleting the admin role).
var ErrLastAdmin = errors.New("workspace must have at least one admin")

// Role represents an RBAC role with its permissions and members.
type Role struct {
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	Members     []string `json:"members"`
}

// Enforcer wraps casbin.Enforcer with business-logic methods. All methods are
// scoped to a workspace domain (the workspace id).
type Enforcer struct {
	e  *casbin.Enforcer
	mu sync.RWMutex
}

// NewEnforcer creates an Enforcer backed by the given MySQL *sql.DB.
func NewEnforcer(db *sql.DB) (*Enforcer, error) {
	m, err := model.NewModelFromString(casbinModel)
	if err != nil {
		return nil, fmt.Errorf("rbac: parse model: %w", err)
	}

	adapter := newMySQLAdapter(db)

	e, err := casbin.NewEnforcer(m, adapter)
	if err != nil {
		return nil, fmt.Errorf("rbac: create enforcer: %w", err)
	}

	if err := e.LoadPolicy(); err != nil {
		return nil, fmt.Errorf("rbac: load policy: %w", err)
	}

	return &Enforcer{e: e}, nil
}

// HasAnyRoles returns true if any policies or role groupings exist at all
// (across all domains). Used for global/system bootstrap detection.
func (enf *Enforcer) HasAnyRoles() bool {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	policies, _ := enf.e.GetPolicy()
	groupings, _ := enf.e.GetGroupingPolicy()
	return len(policies) > 0 || len(groupings) > 0
}

// HasRoles returns true if any policies or role groupings exist in the given
// workspace domain. In a domain with no rules, RBAC is bypassed (full access).
func (enf *Enforcer) HasRoles(dom string) bool {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	policies, _ := enf.e.GetFilteredPolicy(1, dom)
	groupings, _ := enf.e.GetFilteredGroupingPolicy(2, dom)
	return len(policies) > 0 || len(groupings) > 0
}

// IsAllowed checks if a subject (JWT sub) has access to a resource within a
// workspace domain.
func (enf *Enforcer) IsAllowed(sub, dom, resource string) bool {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	ok, _ := enf.e.Enforce(sub, dom, resource, actionAccess)
	return ok
}

// RemovePermissionsByPrefix removes every policy rule in the given domain whose
// resource (v2) starts with the given prefix, across all roles. Returns the
// number of rules removed. Used e.g. to clean up "mcp:<server>:*" permissions
// when an MCP server is deleted.
func (enf *Enforcer) RemovePermissionsByPrefix(dom, prefix string) (int, error) {
	enf.mu.Lock()
	defer enf.mu.Unlock()
	policies, err := enf.e.GetFilteredPolicy(1, dom)
	if err != nil {
		return 0, fmt.Errorf("rbac: get policy: %w", err)
	}
	count := 0
	for _, p := range policies {
		if len(p) < 4 {
			continue
		}
		if !strings.HasPrefix(p[2], prefix) {
			continue
		}
		ok, err := enf.e.RemovePolicy(p[0], p[1], p[2], p[3])
		if err != nil {
			return count, fmt.Errorf("rbac: remove policy %v: %w", p, err)
		}
		if ok {
			count++
		}
	}
	return count, nil
}

// GetRolesForUser returns the role names assigned to a user in a domain.
func (enf *Enforcer) GetRolesForUser(sub, dom string) []string {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	roles := enf.e.GetRolesForUserInDomain(sub, dom)
	sort.Strings(roles)
	return roles
}

// GetUserPermissions returns all resources a user can access in a domain
// (resolved through their roles).
func (enf *Enforcer) GetUserPermissions(sub, dom string) []string {
	enf.mu.RLock()
	defer enf.mu.RUnlock()

	perms, _ := enf.e.GetImplicitPermissionsForUser(sub, dom)
	seen := make(map[string]bool)
	for _, p := range perms {
		// p = [role, dom, resource, action]
		if len(p) >= 3 && p[1] == dom {
			seen[p[2]] = true
		}
	}

	out := make([]string, 0, len(seen))
	for p := range seen {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// ListRoles returns all roles (with permissions and members) in a domain.
func (enf *Enforcer) ListRoles(dom string) []Role {
	enf.mu.RLock()
	defer enf.mu.RUnlock()

	roleNames := enf.allRoleNames(dom)
	roles := make([]Role, 0, len(roleNames))
	for _, name := range roleNames {
		roles = append(roles, Role{
			Name:        name,
			Permissions: enf.rolePermissions(name, dom),
			Members:     enf.roleMembers(name, dom),
		})
	}
	return roles
}

// CreateRole creates a new role with the given permissions in a domain.
func (enf *Enforcer) CreateRole(dom, name string, permissions []string) error {
	enf.mu.Lock()
	defer enf.mu.Unlock()

	existing, _ := enf.e.GetFilteredPolicy(0, name, dom)
	if len(existing) > 0 {
		return fmt.Errorf("role %q already exists", name)
	}

	for _, perm := range permissions {
		if _, err := enf.e.AddPolicy(name, dom, perm, actionAccess); err != nil {
			return fmt.Errorf("add policy: %w", err)
		}
	}
	return enf.e.SavePolicy()
}

// UpdateRole replaces a role's permissions in a domain.
func (enf *Enforcer) UpdateRole(dom, name string, permissions []string) error {
	enf.mu.Lock()
	defer enf.mu.Unlock()

	// Remove existing policies for (role, domain).
	if _, err := enf.e.RemoveFilteredPolicy(0, name, dom); err != nil {
		return fmt.Errorf("remove old policies: %w", err)
	}

	for _, perm := range permissions {
		if _, err := enf.e.AddPolicy(name, dom, perm, actionAccess); err != nil {
			return fmt.Errorf("add policy: %w", err)
		}
	}
	return enf.e.SavePolicy()
}

// DeleteRole removes a role and all its member associations in a domain.
func (enf *Enforcer) DeleteRole(dom, name string) error {
	enf.mu.Lock()
	defer enf.mu.Unlock()

	// Deleting the admin role would orphan the workspace (no one could manage
	// roles/members anymore).
	if name == AdminRole {
		return ErrLastAdmin
	}

	if _, err := enf.e.RemoveFilteredPolicy(0, name, dom); err != nil {
		return fmt.Errorf("remove policies: %w", err)
	}

	// Remove groupings where v1=role AND v2=domain.
	if _, err := enf.e.RemoveFilteredGroupingPolicy(1, name, dom); err != nil {
		return fmt.Errorf("remove groupings: %w", err)
	}

	return enf.e.SavePolicy()
}

// AddMember assigns a user (JWT sub) to a role in a domain.
func (enf *Enforcer) AddMember(dom, role, sub string) error {
	enf.mu.Lock()
	defer enf.mu.Unlock()

	if _, err := enf.e.AddGroupingPolicy(sub, role, dom); err != nil {
		return fmt.Errorf("add grouping: %w", err)
	}
	return enf.e.SavePolicy()
}

// RemoveMember removes a user from a role in a domain.
func (enf *Enforcer) RemoveMember(dom, role, sub string) error {
	enf.mu.Lock()
	defer enf.mu.Unlock()

	// Never remove the last admin: a workspace must always have ≥1 admin.
	if role == AdminRole {
		members := enf.roleMembers(role, dom)
		if len(members) == 1 && slices.Contains(members, sub) {
			return ErrLastAdmin
		}
	}

	if _, err := enf.e.RemoveGroupingPolicy(sub, role, dom); err != nil {
		return fmt.Errorf("remove grouping: %w", err)
	}
	return enf.e.SavePolicy()
}

// GetRoleMembers returns all members of a role in a domain.
func (enf *Enforcer) GetRoleMembers(dom, role string) []string {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	return enf.roleMembers(role, dom)
}

// GetRolePermissions returns all permissions of a role in a domain.
func (enf *Enforcer) GetRolePermissions(dom, role string) []string {
	enf.mu.RLock()
	defer enf.mu.RUnlock()
	return enf.rolePermissions(role, dom)
}

// allRoleNames returns unique role names from policies in a domain (lock held).
func (enf *Enforcer) allRoleNames(dom string) []string {
	seen := make(map[string]bool)
	policies, _ := enf.e.GetFilteredPolicy(1, dom)
	for _, p := range policies {
		if len(p) >= 1 {
			seen[p[0]] = true
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// rolePermissions returns sorted resource names for a role in a domain (lock held).
func (enf *Enforcer) rolePermissions(role, dom string) []string {
	policies, _ := enf.e.GetFilteredPolicy(0, role, dom)
	perms := make([]string, 0, len(policies))
	for _, p := range policies {
		if len(p) >= 3 {
			perms = append(perms, p[2])
		}
	}
	sort.Strings(perms)
	return perms
}

// roleMembers returns users assigned to a role in a domain (lock held).
func (enf *Enforcer) roleMembers(role, dom string) []string {
	users := enf.e.GetUsersForRoleInDomain(role, dom)
	sort.Strings(users)
	return users
}

// FilterToolPermissions returns the full permission keys for tool/MCP access
// (both "tool:*" and "mcp:*"). Callers compare these full keys against the
// permission key reported by each registered tool via PermissionKeyOf.
func FilterToolPermissions(perms []string) []string {
	var keys []string
	for _, p := range perms {
		if strings.HasPrefix(p, "tool:") || strings.HasPrefix(p, "mcp:") {
			keys = append(keys, p)
		}
	}
	return keys
}
