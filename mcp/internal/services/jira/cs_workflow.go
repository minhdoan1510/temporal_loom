package jira

const (
	resolutionDoneID    = "10300"
	rootCauseFieldID    = "customfield_13621"
	resolutionNoteField = "customfield_13620"
	resolutionNote      = "Issue closed by bot"
	resolvedStatusName  = "Resolved"
)

var csWorkflowOrder = []string{"Acknowledge", "Assigned", "In Progress", resolvedStatusName}

var rootCauseAliases = map[string]string{
	"communication":    "20011",
	"external_factors": "20017",
}

// LookupRootCauseID accepts either an alias ("communication") or a raw
// numeric ID ("20011") and returns the canonical customfield_13621 option ID.
func LookupRootCauseID(input string) (string, bool) {
	if id, ok := rootCauseAliases[input]; ok {
		return id, true
	}
	for _, id := range rootCauseAliases {
		if id == input {
			return id, true
		}
	}
	return "", false
}
