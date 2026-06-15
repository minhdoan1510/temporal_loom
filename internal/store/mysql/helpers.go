package mysql

// nilStr returns nil if s is empty, otherwise a pointer to s.
func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// derefStr returns the dereferenced string or empty.
func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
