package cleantest_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/clean/cleantest"
)

func TestRemoversPanicOutsideTheTempDir(t *testing.T) {
	// Never created or touched: the removers must panic before any syscall.
	outside := "/Users/burrow-test-nobody/Documents"
	for name, remover := range map[string]clean.Remover{
		"FakeRemover": &cleantest.FakeRemover{},
		"OSRemover":   clean.OSRemover{},
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatalf("%s.Delete(%s) did not panic", name, outside)
				}
			}()
			_ = remover.Delete(outside)
		})
	}
}

func TestFakeRemoverDeletesInsideTheTempDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache")
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	remover := &cleantest.FakeRemover{}

	if err := remover.Delete(path); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("%s still exists", path)
	}
	if got := remover.Deleted(); len(got) != 1 || got[0] != path {
		t.Fatalf("Deleted() = %v, want [%s]", got, path)
	}
}
