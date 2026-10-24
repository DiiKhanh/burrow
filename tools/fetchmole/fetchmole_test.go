package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

type tarEntry struct {
	name     string
	body     string
	mode     int64
	typeflag byte
	linkname string
}

func makeTarball(t *testing.T, entries []tarEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		typeflag := e.typeflag
		if typeflag == 0 {
			typeflag = tar.TypeReg
			if strings.HasSuffix(e.name, "/") {
				typeflag = tar.TypeDir
			}
		}
		mode := e.mode
		if mode == 0 {
			mode = 0o644
		}
		hdr := &tar.Header{Name: e.name, Mode: mode, Size: int64(len(e.body)), Typeflag: typeflag, Linkname: e.linkname}
		if typeflag != tar.TypeReg {
			hdr.Size = 0
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if typeflag == tar.TypeReg {
			if _, err := tw.Write([]byte(e.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// moleSource is a release tarball shaped like Mole's: one top directory
// holding the entry points, bin/, lib/ and files Burrow does not ship.
func moleSource(t *testing.T) []byte {
	return makeTarball(t, []tarEntry{
		{name: "Mole-1.0.0/"},
		{name: "Mole-1.0.0/mole", body: "#!/bin/bash\necho mole\n", mode: 0o755},
		{name: "Mole-1.0.0/mo", body: "#!/bin/bash\nexec mole\n", mode: 0o755},
		{name: "Mole-1.0.0/LICENSE", body: "GPL-3.0"},
		{name: "Mole-1.0.0/README.md", body: "readme"},
		{name: "Mole-1.0.0/bin/"},
		{name: "Mole-1.0.0/bin/clean.sh", body: "#!/bin/bash\n", mode: 0o755},
		{name: "Mole-1.0.0/lib/core/"},
		{name: "Mole-1.0.0/lib/core/common.sh", body: "# common"},
		{name: "Mole-1.0.0/cmd/status/main.go", body: "package main"},
	})
}

const (
	statusBinary  = "status binary"
	analyzeBinary = "analyze binary"
)

func sha(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// fakeGitHub serves one Mole release and counts the requests it gets.
type fakeGitHub struct {
	*httptest.Server
	requests atomic.Int32
}

func newFakeGitHub(t *testing.T, version string, source []byte) *fakeGitHub {
	t.Helper()
	gh := &fakeGitHub{}
	mux := http.NewServeMux()
	mux.HandleFunc("/archive/refs/tags/"+version+".tar.gz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(source)
	})
	mux.HandleFunc("/releases/download/"+version+"/status-darwin-arm64", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, statusBinary)
	})
	mux.HandleFunc("/releases/download/"+version+"/analyze-darwin-arm64", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, analyzeBinary)
	})
	gh.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gh.requests.Add(1)
		mux.ServeHTTP(w, r)
	}))
	t.Cleanup(gh.Close)
	return gh
}

func (gh *fakeGitHub) fetcher() fetcher {
	return fetcher{baseURL: gh.URL, client: gh.Client(), log: io.Discard}
}

func validLock(source []byte) Lock {
	return lockOf("V1.0.0", source)
}

func lockOf(version string, source []byte) Lock {
	return Lock{
		Version:       version,
		SourceSHA256:  sha(source),
		StatusSHA256:  sha([]byte(statusBinary)),
		AnalyzeSHA256: sha([]byte(analyzeBinary)),
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestInstallUnpacksTheEntryPointsAndTheBinaries(t *testing.T) {
	source := moleSource(t)
	gh := newFakeGitHub(t, "V1.0.0", source)
	dest := filepath.Join(t.TempDir(), "mole")

	if err := gh.fetcher().install(context.Background(), validLock(source), dest); err != nil {
		t.Fatal(err)
	}

	if got := readFile(t, filepath.Join(dest, "mole")); got != "#!/bin/bash\necho mole\n" {
		t.Errorf("mole = %q", got)
	}
	if got := readFile(t, filepath.Join(dest, "lib/core/common.sh")); got != "# common" {
		t.Errorf("lib/core/common.sh = %q", got)
	}
	if got := readFile(t, filepath.Join(dest, "bin/status-go")); got != statusBinary {
		t.Errorf("bin/status-go = %q", got)
	}
	if got := readFile(t, filepath.Join(dest, "bin/analyze-go")); got != analyzeBinary {
		t.Errorf("bin/analyze-go = %q", got)
	}
	for _, exe := range []string{"mole", "mo", "bin/clean.sh", "bin/status-go", "bin/analyze-go"} {
		info, err := os.Stat(filepath.Join(dest, exe))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o111 == 0 {
			t.Errorf("%s is not executable: %v", exe, info.Mode())
		}
	}
	if info, err := os.Stat(dest); err != nil || info.Mode().Perm() != 0o755 {
		t.Errorf("bundle directory mode = %v (err %v), want 0755", info.Mode(), err)
	}
	for _, left := range []string{"README.md", "cmd"} {
		if _, err := os.Stat(filepath.Join(dest, left)); !os.IsNotExist(err) {
			t.Errorf("%s should not be installed (err = %v)", left, err)
		}
	}
	if got := readFile(t, filepath.Join(dest, "LICENSE")); got != "GPL-3.0" {
		t.Errorf("LICENSE = %q", got)
	}
}

func TestInstallFailsOnAChecksumMismatchAndKeepsTheOldBundle(t *testing.T) {
	source := moleSource(t)
	gh := newFakeGitHub(t, "V1.0.0", source)
	dest := filepath.Join(t.TempDir(), "mole")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dest, "mo"), []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}

	other := sha([]byte("other"))
	sourceMismatch, statusMismatch, analyzeMismatch := validLock(source), validLock(source), validLock(source)
	sourceMismatch.SourceSHA256 = other
	statusMismatch.StatusSHA256 = other
	analyzeMismatch.AnalyzeSHA256 = other
	for name, lock := range map[string]Lock{
		"source":  sourceMismatch,
		"status":  statusMismatch,
		"analyze": analyzeMismatch,
	} {
		t.Run(name, func(t *testing.T) {
			err := gh.fetcher().install(context.Background(), lock, dest)
			if err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
				t.Fatalf("err = %v, want a checksum mismatch", err)
			}
			if got := readFile(t, filepath.Join(dest, "mo")); got != "old" {
				t.Errorf("the old bundle was replaced: mo = %q", got)
			}
		})
	}
}

func TestInstallSkipsTheDownloadWhenTheBundleMatchesTheLock(t *testing.T) {
	source := moleSource(t)
	gh := newFakeGitHub(t, "V1.0.0", source)
	dest := filepath.Join(t.TempDir(), "mole")
	f := gh.fetcher()

	if err := f.install(context.Background(), validLock(source), dest); err != nil {
		t.Fatal(err)
	}
	before := gh.requests.Load()
	if err := f.install(context.Background(), validLock(source), dest); err != nil {
		t.Fatal(err)
	}
	if after := gh.requests.Load(); after != before {
		t.Errorf("made %d requests for an up-to-date bundle", after-before)
	}
}

func TestInstallRepairsABundleMissingAProgram(t *testing.T) {
	for program, want := range map[string]string{"bin/status-go": statusBinary, "bin/analyze-go": analyzeBinary} {
		t.Run(program, func(t *testing.T) {
			source := moleSource(t)
			gh := newFakeGitHub(t, "V1.0.0", source)
			dest := filepath.Join(t.TempDir(), "mole")
			f := gh.fetcher()

			if err := f.install(context.Background(), validLock(source), dest); err != nil {
				t.Fatal(err)
			}
			if err := os.Remove(filepath.Join(dest, program)); err != nil {
				t.Fatal(err)
			}
			if err := f.install(context.Background(), validLock(source), dest); err != nil {
				t.Fatal(err)
			}
			if got := readFile(t, filepath.Join(dest, program)); got != want {
				t.Errorf("%s = %q", program, got)
			}
		})
	}
}

func TestInstallReplacesABundleOfAnotherVersion(t *testing.T) {
	oldSource := moleSource(t)
	newSource := makeTarball(t, []tarEntry{
		{name: "Mole-2.0.0/mole", body: "new", mode: 0o755},
		{name: "Mole-2.0.0/mo", body: "new", mode: 0o755},
	})
	dest := filepath.Join(t.TempDir(), "mole")

	if err := newFakeGitHub(t, "V1.0.0", oldSource).fetcher().install(context.Background(), validLock(oldSource), dest); err != nil {
		t.Fatal(err)
	}
	newLock := lockOf("V2.0.0", newSource)
	if err := newFakeGitHub(t, "V2.0.0", newSource).fetcher().install(context.Background(), newLock, dest); err != nil {
		t.Fatal(err)
	}

	if got := readFile(t, filepath.Join(dest, "mole")); got != "new" {
		t.Errorf("mole = %q", got)
	}
	if _, err := os.Stat(filepath.Join(dest, "lib")); !os.IsNotExist(err) {
		t.Errorf("files of the old version are left: %v", err)
	}
}

func TestInstallRejectsEntriesOutsideTheBundle(t *testing.T) {
	for name, entry := range map[string]tarEntry{
		"dot-dot":          {name: "Mole-1.0.0/lib/../../escape", body: "x"},
		"absolute symlink": {name: "Mole-1.0.0/lib/link", typeflag: tar.TypeSymlink, linkname: "/etc/passwd"},
		"escaping symlink": {name: "Mole-1.0.0/lib/link", typeflag: tar.TypeSymlink, linkname: "../../../outside"},
	} {
		t.Run(name, func(t *testing.T) {
			source := makeTarball(t, []tarEntry{{name: "Mole-1.0.0/mole", body: "x", mode: 0o755}, entry})
			dest := filepath.Join(t.TempDir(), "mole")
			lock := validLock(source)

			err := newFakeGitHub(t, "V1.0.0", source).fetcher().install(context.Background(), lock, dest)
			if err == nil {
				t.Fatal("installed a tarball with an entry outside the bundle")
			}
			if _, err := os.Stat(dest); !os.IsNotExist(err) {
				t.Errorf("left a bundle behind: %v", err)
			}
		})
	}
}

func TestPinWritesTheChecksumsOfANewVersion(t *testing.T) {
	source := moleSource(t)
	gh := newFakeGitHub(t, "V1.0.0", source)

	lock, err := gh.fetcher().pin(context.Background(), "V1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if lock != validLock(source) {
		t.Errorf("lock = %+v, want %+v", lock, validLock(source))
	}
}

func TestPinRejectsAVersionThatIsNotAMoleTag(t *testing.T) {
	gh := newFakeGitHub(t, "V1.0.0", moleSource(t))
	for _, version := range []string{"1.0.0", "V1.0", "latest", "V1.0.0-windows", "../V1.0.0"} {
		if _, err := gh.fetcher().pin(context.Background(), version); err == nil {
			t.Errorf("pinned %q", version)
		}
	}
	if n := gh.requests.Load(); n != 0 {
		t.Errorf("made %d requests for invalid versions", n)
	}
}

func TestLockRoundTripsThroughItsFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mole.lock")
	want := Lock{Version: "V1.0.0", SourceSHA256: sha([]byte("a")), StatusSHA256: sha([]byte("b")), AnalyzeSHA256: sha([]byte("c"))}

	if err := writeLock(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := readLock(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestReadLockRejectsAnIncompleteLock(t *testing.T) {
	sourceSum, statusSum, analyzeSum := sha([]byte("a")), sha([]byte("b")), sha([]byte("c"))
	for name, body := range map[string]string{
		"no version":     `{"source_sha256": "` + sourceSum + `", "status_darwin_arm64_sha256": "` + statusSum + `", "analyze_darwin_arm64_sha256": "` + analyzeSum + `"}`,
		"short checksum": `{"version": "V1.0.0", "source_sha256": "abc", "status_darwin_arm64_sha256": "` + statusSum + `", "analyze_darwin_arm64_sha256": "` + analyzeSum + `"}`,
		"no analyze":     `{"version": "V1.0.0", "source_sha256": "` + sourceSum + `", "status_darwin_arm64_sha256": "` + statusSum + `"}`,
		"unknown field":  `{"version": "V1.0.0", "source": "x"}`,
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "mole.lock")
			if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := readLock(path); err == nil {
				t.Error("accepted an invalid lock")
			}
		})
	}
}
