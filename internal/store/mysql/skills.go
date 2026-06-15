package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/skills"
	"gitlab.zalopay.vn/fin/lending/lending-claw/internal/store"
)

// MySQLSkillStore implements store.SkillStore backed by MySQL.
type MySQLSkillStore struct {
	db *sql.DB
}

func NewMySQLSkillStore(db *sql.DB) *MySQLSkillStore {
	return &MySQLSkillStore{db: db}
}

func (s *MySQLSkillStore) List(ctx context.Context, workspaceID string) ([]store.Skill, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, description, content, metadata, created_at, updated_at
		 FROM skills WHERE workspace_id = ? ORDER BY name`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	defer rows.Close()

	skills := make([]store.Skill, 0)
	for rows.Next() {
		var sk store.Skill
		if err := rows.Scan(&sk.ID, &sk.Name, &sk.Description, &sk.Content,
			&sk.Metadata, &sk.CreatedAt, &sk.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan skill: %w", err)
		}
		skills = append(skills, sk)
	}
	return skills, rows.Err()
}

func (s *MySQLSkillStore) Get(ctx context.Context, workspaceID, name string) (*store.Skill, error) {
	var sk store.Skill
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, content, metadata, created_at, updated_at
		 FROM skills WHERE workspace_id = ? AND name = ?`, workspaceID, name,
	).Scan(&sk.ID, &sk.Name, &sk.Description, &sk.Content,
		&sk.Metadata, &sk.CreatedAt, &sk.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("skill %q not found", name)
	}
	if err != nil {
		return nil, fmt.Errorf("get skill %q: %w", name, err)
	}
	return &sk, nil
}

func (s *MySQLSkillStore) GetByID(ctx context.Context, workspaceID, id string) (*store.Skill, error) {
	var sk store.Skill
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, content, metadata, created_at, updated_at
		 FROM skills WHERE workspace_id = ? AND id = ?`, workspaceID, id,
	).Scan(&sk.ID, &sk.Name, &sk.Description, &sk.Content,
		&sk.Metadata, &sk.CreatedAt, &sk.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("skill with id %q not found", id)
	}
	if err != nil {
		return nil, fmt.Errorf("get skill by id %q: %w", id, err)
	}
	return &sk, nil
}

// normalizeSkillMetadata sets a blank metadata value to nil so the JSON column
// stores NULL instead of an empty string (which is invalid JSON).
func normalizeSkillMetadata(skill *store.Skill) {
	if skill.Metadata != nil && strings.TrimSpace(*skill.Metadata) == "" {
		skill.Metadata = nil
	}
}

func (s *MySQLSkillStore) Create(ctx context.Context, workspaceID string, skill *store.Skill) error {
	if skill.ID == "" {
		skill.ID = uuid.New().String()
	}
	now := time.Now()
	skill.CreatedAt = now
	skill.UpdatedAt = now
	normalizeSkillMetadata(skill)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO skills (id, workspace_id, name, description, content, metadata, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		skill.ID, workspaceID, skill.Name, skill.Description, skill.Content,
		skill.Metadata, skill.CreatedAt, skill.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create skill: %w", err)
	}
	return nil
}

func (s *MySQLSkillStore) Update(ctx context.Context, workspaceID string, skill *store.Skill) error {
	skill.UpdatedAt = time.Now()
	normalizeSkillMetadata(skill)
	_, err := s.db.ExecContext(ctx,
		`UPDATE skills SET name = ?, description = ?, content = ?, metadata = ?, updated_at = ?
		 WHERE workspace_id = ? AND id = ?`,
		skill.Name, skill.Description, skill.Content,
		skill.Metadata, skill.UpdatedAt, workspaceID, skill.ID,
	)
	if err != nil {
		return fmt.Errorf("update skill: %w", err)
	}
	return nil
}

func (s *MySQLSkillStore) Delete(ctx context.Context, workspaceID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete skill: begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"DELETE FROM skill_files WHERE workspace_id = ? AND skill_id = ?", workspaceID, id); err != nil {
		return fmt.Errorf("delete skill files: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		"DELETE FROM skills WHERE workspace_id = ? AND id = ?", workspaceID, id); err != nil {
		return fmt.Errorf("delete skill: %w", err)
	}
	return tx.Commit()
}

func (s *MySQLSkillStore) ListFiles(ctx context.Context, workspaceID, skillID string) ([]store.SkillFile, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT path, content FROM skill_files
		 WHERE workspace_id = ? AND skill_id = ? ORDER BY path`, workspaceID, skillID)
	if err != nil {
		return nil, fmt.Errorf("list skill files: %w", err)
	}
	defer rows.Close()

	files := make([]store.SkillFile, 0)
	for rows.Next() {
		var f store.SkillFile
		if err := rows.Scan(&f.Path, &f.Content); err != nil {
			return nil, fmt.Errorf("scan skill file: %w", err)
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (s *MySQLSkillStore) GetFile(ctx context.Context, workspaceID, skillID, path string) (*store.SkillFile, error) {
	var f store.SkillFile
	err := s.db.QueryRowContext(ctx,
		`SELECT path, content FROM skill_files
		 WHERE workspace_id = ? AND skill_id = ? AND path = ?`, workspaceID, skillID, path,
	).Scan(&f.Path, &f.Content)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("skill file %q not found", path)
	}
	if err != nil {
		return nil, fmt.Errorf("get skill file %q: %w", path, err)
	}
	return &f, nil
}

func (s *MySQLSkillStore) ReplaceFiles(ctx context.Context, workspaceID, skillID string, files []store.SkillFile) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("replace skill files: begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"DELETE FROM skill_files WHERE workspace_id = ? AND skill_id = ?", workspaceID, skillID); err != nil {
		return fmt.Errorf("clear skill files: %w", err)
	}

	now := time.Now()
	for _, f := range files {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO skill_files (id, workspace_id, skill_id, path, content, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), workspaceID, skillID, f.Path, f.Content, now, now); err != nil {
			return fmt.Errorf("insert skill file %q: %w", f.Path, err)
		}
	}
	return tx.Commit()
}

// BackfillFrontmatter ensures every existing skill's content begins with a
// valid frontmatter block. Skills predating the Claude-standard model store
// their name/description only in columns and may use underscores in the name.
// For each such skill it hyphenates the name, builds a frontmatter block from
// the existing columns, prepends it to the content and updates the name column.
// Idempotent: skills that already have frontmatter are skipped.
func (s *MySQLSkillStore) BackfillFrontmatter(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT workspace_id, id, name, description, content FROM skills`)
	if err != nil {
		return 0, fmt.Errorf("backfill: list skills: %w", err)
	}

	type row struct{ ws, id, name, desc, content string }
	var pending []row
	for rows.Next() {
		var r row
		var desc sql.NullString
		if err := rows.Scan(&r.ws, &r.id, &r.name, &desc, &r.content); err != nil {
			rows.Close()
			return 0, fmt.Errorf("backfill: scan: %w", err)
		}
		r.desc = desc.String
		pending = append(pending, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	updated := 0
	for _, r := range pending {
		var newName, desc, newContent string

		if fields, body, ok := skills.FrontmatterFields(r.content); ok {
			// Already has frontmatter. Only re-canonicalize our own
			// machine-generated minimal frontmatter (just name/description) to
			// drop unnecessary quotes; leave richer user-authored frontmatter alone.
			if !onlyNameDescription(fields) {
				continue
			}
			newName = fields["name"]
			desc = fields["description"]
			if newName == "" || desc == "" {
				continue
			}
			newContent = skills.BuildFrontmatter(newName, desc, body)
		} else {
			// No frontmatter — build it from the existing columns.
			newName = skills.NormalizeSkillName(r.name)
			desc = strings.TrimSpace(r.desc)
			if desc == "" {
				desc = newName
			}
			newContent = skills.BuildFrontmatter(newName, desc, r.content)
		}

		if newContent == r.content && newName == r.name && desc == r.desc {
			continue // nothing changed
		}
		if _, err := s.db.ExecContext(ctx,
			`UPDATE skills SET name = ?, description = ?, content = ?, updated_at = NOW()
			 WHERE workspace_id = ? AND id = ?`,
			newName, desc, newContent, r.ws, r.id); err != nil {
			return updated, fmt.Errorf("backfill: update skill %q: %w", r.id, err)
		}
		updated++
	}
	return updated, nil
}

// onlyNameDescription reports whether the frontmatter contains no keys other
// than name and description (i.e. it is our generated minimal frontmatter).
func onlyNameDescription(fields map[string]string) bool {
	for k := range fields {
		if k != "name" && k != "description" {
			return false
		}
	}
	return true
}
