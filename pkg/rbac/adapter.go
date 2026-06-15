package rbac

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/casbin/casbin/v2/model"
	"github.com/casbin/casbin/v2/persist"
)

// mysqlAdapter implements casbin persist.Adapter using database/sql.
type mysqlAdapter struct {
	db *sql.DB
}

func newMySQLAdapter(db *sql.DB) *mysqlAdapter {
	return &mysqlAdapter{db: db}
}

// LoadPolicy loads all policy rules from the database.
func (a *mysqlAdapter) LoadPolicy(m model.Model) error {
	query := "SELECT p_type, v0, v1, v2, v3, v4, v5 FROM casbin_rules"
	rows, err := a.db.Query(query)
	if err != nil {
		return fmt.Errorf("load policy: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var ptype, v0, v1, v2, v3, v4, v5 string
		if err := rows.Scan(&ptype, &v0, &v1, &v2, &v3, &v4, &v5); err != nil {
			return fmt.Errorf("scan policy row: %w", err)
		}
		line := ptype
		for _, v := range []string{v0, v1, v2, v3, v4, v5} {
			if v != "" {
				line += ", " + v
			}
		}
		persist.LoadPolicyLine(line, m)
	}
	return rows.Err()
}

// SavePolicy saves all policy rules to the database (full replace).
func (a *mysqlAdapter) SavePolicy(m model.Model) error {
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Truncate — use DELETE with id > 0 to satisfy PXC strict mode
	if _, err := tx.Exec("DELETE FROM casbin_rules WHERE id > 0"); err != nil {
		return err
	}

	insertSQL := "INSERT INTO casbin_rules (p_type, v0, v1, v2, v3, v4, v5) VALUES (?, ?, ?, ?, ?, ?, ?)"

	// Save p rules
	for ptype, ast := range m["p"] {
		for _, rule := range ast.Policy {
			args := padRule(ptype, rule)
			if _, err := tx.Exec(insertSQL, args...); err != nil {
				return err
			}
		}
	}

	// Save g rules
	for ptype, ast := range m["g"] {
		for _, rule := range ast.Policy {
			args := padRule(ptype, rule)
			if _, err := tx.Exec(insertSQL, args...); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

// AddPolicy adds a policy rule to the database.
func (a *mysqlAdapter) AddPolicy(sec string, ptype string, rule []string) error {
	insertSQL := "INSERT INTO casbin_rules (p_type, v0, v1, v2, v3, v4, v5) VALUES (?, ?, ?, ?, ?, ?, ?)"
	args := padRule(ptype, rule)
	_, err := a.db.Exec(insertSQL, args...)
	return err
}

// RemovePolicy removes a policy rule from the database.
// Uses id-based delete via subquery to satisfy PXC strict mode.
func (a *mysqlAdapter) RemovePolicy(sec string, ptype string, rule []string) error {
	where := "p_type = ?"
	args := []interface{}{ptype}
	for i, v := range rule {
		where += fmt.Sprintf(" AND v%d = ?", i)
		args = append(args, v)
	}
	deleteSQL := fmt.Sprintf("DELETE FROM casbin_rules WHERE id IN (SELECT id FROM (SELECT id FROM casbin_rules WHERE %s) AS t)", where)
	_, err := a.db.Exec(deleteSQL, args...)
	return err
}

// RemoveFilteredPolicy removes policy rules matching the filter.
// Uses id-based delete via subquery to satisfy PXC strict mode.
func (a *mysqlAdapter) RemoveFilteredPolicy(sec string, ptype string, fieldIndex int, fieldValues ...string) error {
	where := "p_type = ?"
	args := []interface{}{ptype}
	for i, v := range fieldValues {
		if v != "" {
			where += fmt.Sprintf(" AND v%d = ?", fieldIndex+i)
			args = append(args, v)
		}
	}

	// TODO: SQL injection vulnerability
	deleteSQL := fmt.Sprintf("DELETE FROM casbin_rules WHERE id IN (SELECT id FROM (SELECT id FROM casbin_rules WHERE %s) AS t)", where)
	_, err := a.db.Exec(deleteSQL, args...)
	return err
}

// padRule pads rule values to 6 fields and prepends ptype.
func padRule(ptype string, rule []string) []interface{} {
	args := make([]interface{}, 7)
	args[0] = ptype
	for i := 0; i < 6; i++ {
		if i < len(rule) {
			args[i+1] = strings.TrimSpace(rule[i])
		} else {
			args[i+1] = ""
		}
	}
	return args
}
