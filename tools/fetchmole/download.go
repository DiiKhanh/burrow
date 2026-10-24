package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
)

// maxDownload bounds what a download may weigh: Mole's source tarball and
// release binaries are a few MB each.
const maxDownload = 256 << 20

// fetcher downloads Mole releases from GitHub, or from a test server.
type fetcher struct {
	baseURL string // e.g. https://github.com/tw93/mole
	client  *http.Client
	log     io.Writer
}

func (f fetcher) sourceURL(version string) string {
	return f.baseURL + "/archive/refs/tags/" + version + ".tar.gz"
}

func (f fetcher) assetURL(version, asset string) string {
	return f.baseURL + "/releases/download/" + version + "/" + asset
}

func (f fetcher) download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("requesting %s: %w", url, err)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("downloading %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }() // read to the end or failed: nothing to lose
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("downloading %s: %s", url, resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxDownload+1))
	if err != nil {
		return nil, fmt.Errorf("downloading %s: %w", url, err)
	}
	if len(data) > maxDownload {
		return nil, fmt.Errorf("downloading %s: larger than %d bytes", url, maxDownload)
	}
	return data, nil
}

// downloadVerified downloads url and fails unless its SHA-256 is want.
func (f fetcher) downloadVerified(ctx context.Context, url, want string) ([]byte, error) {
	data, err := f.download(ctx, url)
	if err != nil {
		return nil, err
	}
	if got := sha256Hex(data); got != want {
		return nil, fmt.Errorf("checksum mismatch for %s: mole.lock pins %s, the download is %s", url, want, got)
	}
	return data, nil
}

// logf reports progress; a failed write to the log is no reason to stop.
func (f fetcher) logf(format string, args ...any) {
	_, _ = fmt.Fprintf(f.log, format, args...)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// pin downloads a release and returns a lock of its checksums. Trust in
// the release is the maintainer's decision: run it on purpose, review the
// diff of mole.lock.
func (f fetcher) pin(ctx context.Context, version string) (Lock, error) {
	if err := validateVersion(version); err != nil {
		return Lock{}, err
	}
	source, err := f.download(ctx, f.sourceURL(version))
	if err != nil {
		return Lock{}, err
	}
	status, err := f.download(ctx, f.assetURL(version, statusAsset))
	if err != nil {
		return Lock{}, err
	}
	analyze, err := f.download(ctx, f.assetURL(version, analyzeAsset))
	if err != nil {
		return Lock{}, err
	}
	return Lock{
		Version:       version,
		SourceSHA256:  sha256Hex(source),
		StatusSHA256:  sha256Hex(status),
		AnalyzeSHA256: sha256Hex(analyze),
	}, nil
}
