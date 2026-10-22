package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/DiiKhanh/burrow/internal/mole"
)

// stampName records which lock a bundle was installed from. MyGo leaves
// hidden files out of the app.
const stampName = ".mole.lock"

// install puts the release that lock pins into dest, unless dest already
// holds it. It verifies both downloads first and swaps the new bundle in
// whole, so a failure leaves the previous bundle as it was.
func (f fetcher) install(ctx context.Context, lock Lock, dest string) error {
	stamp, err := lock.encode()
	if err != nil {
		return err
	}
	if upToDate(dest, stamp) {
		f.logf("Mole %s is up to date in %s\n", lock.Version, dest)
		return nil
	}

	f.logf("Fetching Mole %s\n", lock.Version)
	source, err := f.downloadVerified(ctx, f.sourceURL(lock.Version), lock.SourceSHA256)
	if err != nil {
		return err
	}
	status, err := f.downloadVerified(ctx, f.statusURL(lock.Version), lock.StatusSHA256)
	if err != nil {
		return err
	}

	parent := filepath.Dir(dest)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("creating %s: %w", parent, err)
	}
	staging, err := os.MkdirTemp(parent, ".mole-staging-")
	if err != nil {
		return fmt.Errorf("creating a staging directory: %w", err)
	}
	// Gone once swapped in; after a failure, a leftover is only clutter.
	defer func() { _ = os.RemoveAll(staging) }()
	// MkdirTemp makes it private; the bundle is read by the app's user and by codesign.
	if err := os.Chmod(staging, 0o755); err != nil {
		return fmt.Errorf("opening up %s: %w", staging, err)
	}

	if err := unpack(staging, source, status, stamp); err != nil {
		return err
	}
	if err := swap(staging, dest); err != nil {
		return err
	}
	f.logf("Installed Mole %s in %s\n", lock.Version, dest)
	return nil
}

// upToDate reports whether dest was installed from the same lock and still
// has the programs Burrow runs.
func upToDate(dest string, stamp []byte) bool {
	current, err := os.ReadFile(filepath.Join(dest, stampName))
	if err != nil || !bytes.Equal(current, stamp) {
		return false
	}
	for _, program := range []string{mole.MoPath, mole.StatusPath} {
		info, err := os.Stat(filepath.Join(dest, program))
		if err != nil || info.Mode().Perm()&0o111 == 0 {
			return false
		}
	}
	return true
}

// unpack writes the bundle into dir: Mole's entry points, bin/ and lib/
// from the source tarball, the status binary, and the stamp.
func unpack(dir string, source, status, stamp []byte) error {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return fmt.Errorf("opening %s: %w", dir, err)
	}
	defer func() { _ = root.Close() }() // every write closed its own file

	if err := extract(root, source); err != nil {
		return fmt.Errorf("unpacking Mole's source: %w", err)
	}
	if err := root.MkdirAll(filepath.Dir(mole.StatusPath), 0o755); err != nil {
		return fmt.Errorf("creating %s: %w", filepath.Dir(mole.StatusPath), err)
	}
	if err := root.WriteFile(mole.StatusPath, status, 0o755); err != nil {
		return fmt.Errorf("writing %s: %w", mole.StatusPath, err)
	}
	if err := root.WriteFile(stampName, stamp, 0o644); err != nil {
		return fmt.Errorf("writing %s: %w", stampName, err)
	}
	return nil
}

// shipped reports whether a path of the source tarball, relative to its
// top directory, belongs in the bundle.
func shipped(rel string) bool {
	switch rel {
	case "mole", mole.MoPath, "LICENSE", "bin", "lib":
		return true
	}
	return strings.HasPrefix(rel, "bin/") || strings.HasPrefix(rel, "lib/")
}

func extract(root *os.Root, tarball []byte) error {
	gz, err := gzip.NewReader(bytes.NewReader(tarball))
	if err != nil {
		return fmt.Errorf("opening the gzip stream: %w", err)
	}
	defer func() { _ = gz.Close() }() // reading only
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("reading the tarball: %w", err)
		}
		rel, err := entryPath(hdr.Name)
		if err != nil {
			return err
		}
		if rel == "" || !shipped(rel) {
			continue
		}
		if err := extractEntry(root, rel, hdr, tr); err != nil {
			return fmt.Errorf("extracting %s: %w", rel, err)
		}
	}
}

// entryPath strips the tarball's top directory ("Mole-1.62.0/") from name
// and refuses names that would leave the bundle.
func entryPath(name string) (string, error) {
	_, rel, _ := strings.Cut(name, "/")
	rel = strings.TrimSuffix(rel, "/")
	if rel == "" {
		return "", nil
	}
	if !filepath.IsLocal(rel) || strings.Contains(rel, "..") {
		return "", fmt.Errorf("entry %q points outside the bundle", name)
	}
	return rel, nil
}

func extractEntry(root *os.Root, rel string, hdr *tar.Header, r io.Reader) error {
	switch hdr.Typeflag {
	case tar.TypeDir:
		return root.MkdirAll(rel, 0o755)
	case tar.TypeReg:
		if err := root.MkdirAll(filepath.Dir(rel), 0o755); err != nil {
			return err
		}
		data, err := io.ReadAll(r)
		if err != nil {
			return err
		}
		return root.WriteFile(rel, data, os.FileMode(hdr.Mode).Perm()&0o755)
	default:
		return fmt.Errorf("entry %q is not a file or a directory (type %q)", hdr.Name, hdr.Typeflag)
	}
}

// swap replaces dest with staging. The previous bundle waits under a hidden
// name, which MyGo never ships, and comes back if staging cannot move in.
func swap(staging, dest string) error {
	old := filepath.Join(filepath.Dir(dest), "."+filepath.Base(dest)+".old")
	if err := os.RemoveAll(old); err != nil {
		return fmt.Errorf("removing %s: %w", old, err)
	}
	hadPrevious := true
	if err := os.Rename(dest, old); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("moving the previous bundle aside: %w", err)
		}
		hadPrevious = false
	}
	if err := os.Rename(staging, dest); err != nil {
		if hadPrevious {
			if restoreErr := os.Rename(old, dest); restoreErr != nil {
				return fmt.Errorf("installing the bundle: %w (and restoring the previous one: %w)", err, restoreErr)
			}
		}
		return fmt.Errorf("installing the bundle: %w", err)
	}
	if err := os.RemoveAll(old); err != nil {
		return fmt.Errorf("removing the previous bundle: %w", err)
	}
	return nil
}
