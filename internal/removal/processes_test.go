package removal_test

import (
	"slices"
	"testing"

	"github.com/DiiKhanh/burrow/internal/removal"
)

func TestOSProcessesListsThisProcess(t *testing.T) {
	names, err := removal.OSProcesses{}.Names()
	if err != nil {
		t.Fatal(err)
	}
	// The kernel keeps at most 16 bytes of a process name: "removal.test".
	if !slices.Contains(names, "removal.test") {
		t.Fatalf("OSProcesses names miss removal.test among %d processes", len(names))
	}
}
