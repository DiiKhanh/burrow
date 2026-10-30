package removaltest_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/DiiKhanh/burrow/internal/removal"
	"github.com/DiiKhanh/burrow/internal/removal/removaltest"
)

func TestRemoversPanicOutsideTheTempDir(t *testing.T) {
	// Never created or touched: the removers must panic before any syscall.
	outside := "/Users/burrow-test-nobody/Documents"
	trash := func(string) error { t.Fatal("OSRemover asked macOS to trash a path outside the temp dir"); return nil }
	for name, remover := range map[string]removal.Remover{
		"FakeRemover": &removaltest.FakeRemover{TrashDir: t.TempDir()},
		"OSRemover":   removal.OSRemover{Trash: trash},
	} {
		for method, remove := range map[string]func(string) error{
			"Delete":      remover.Delete,
			"MoveToTrash": remover.MoveToTrash,
		} {
			t.Run(name+"."+method, func(t *testing.T) {
				defer func() {
					if recover() == nil {
						t.Fatalf("%s.%s(%s) did not panic", name, method, outside)
					}
				}()
				_ = remove(outside)
			})
		}
	}
}

func TestFakeRemoverDeletesInsideTheTempDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cache")
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	remover := &removaltest.FakeRemover{}

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

func TestFakeRemoverMovesToItsTrashDir(t *testing.T) {
	temp := t.TempDir()
	first := filepath.Join(temp, "a", "Gone App")
	second := filepath.Join(temp, "b", "Gone App")
	for _, dir := range []string{first, second} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	trash := filepath.Join(temp, ".Trash")
	remover := &removaltest.FakeRemover{TrashDir: trash}

	for _, path := range []string{first, second} {
		if err := remover.MoveToTrash(path); err != nil {
			t.Fatal(err)
		}
	}

	for _, path := range []string{first, second} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Errorf("%s still exists", path)
		}
	}
	// Like the Finder, a second item of the same name gets a new one.
	for _, name := range []string{"Gone App", "Gone App 2"} {
		if _, err := os.Lstat(filepath.Join(trash, name)); err != nil {
			t.Errorf("%s is not in the Trash: %v", name, err)
		}
	}
	if got := remover.Trashed(); len(got) != 2 || got[0] != first || got[1] != second {
		t.Fatalf("Trashed() = %v, want [%s %s]", got, first, second)
	}
	if got := remover.Deleted(); len(got) != 0 {
		t.Errorf("Deleted() = %v, want none", got)
	}
}
