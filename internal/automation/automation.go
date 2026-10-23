// Package automation lets the process that launched Burrow run scripts in
// its page, the way the built-app smoke test drives Scan and Clean. Each
// request and response is one line of JSON.
package automation

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// Env is the environment variable that, set to "1", makes Burrow serve
// requests on RequestsFD and answer on ResponsesFD: only the launching
// process holds the other ends.
const Env = "BURROW_AUTOMATION"

// The file descriptors the app serves on: the launcher's first and second
// extra files.
const (
	RequestsFD  = 3
	ResponsesFD = 4
)

// Eval runs script in the page and returns its value, as Page.EvalContext does.
type Eval func(ctx context.Context, script string) (any, error)

type request struct {
	Script string `json:"script"`
}

type response struct {
	Value json.RawMessage `json:"value,omitempty"`
	Error string          `json:"error,omitempty"`
}

// A request or response starts in a lineBuffer and may grow to maxLine.
const (
	lineBuffer = 64 << 10
	maxLine    = 4 << 20
)

func newLineScanner(r io.Reader) *bufio.Scanner {
	lines := bufio.NewScanner(r)
	lines.Buffer(make([]byte, 0, lineBuffer), maxLine)
	return lines
}

// Serve answers every request with eval, one at a time, until requests end
// or ctx is done. It returns nil once requests end.
func Serve(ctx context.Context, requests io.Reader, responses io.Writer, eval Eval) error {
	lines := newLineScanner(requests)
	encoder := json.NewEncoder(responses)
	for lines.Scan() {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("automation: serving: %w", err)
		}
		if err := encoder.Encode(answer(ctx, lines.Bytes(), eval)); err != nil {
			return fmt.Errorf("automation: writing a response: %w", err)
		}
	}
	if err := lines.Err(); err != nil {
		return fmt.Errorf("automation: reading a request: %w", err)
	}
	return nil
}

func answer(ctx context.Context, line []byte, eval Eval) response {
	var req request
	if err := json.Unmarshal(line, &req); err != nil {
		return response{Error: fmt.Sprintf("decoding the request: %v", err)}
	}
	value, err := eval(ctx, req.Script)
	if err != nil {
		return response{Error: err.Error()}
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return response{Error: fmt.Sprintf("encoding the value: %v", err)}
	}
	return response{Value: raw}
}

// Client sends scripts to a Serve on the other end of a pair of pipes.
// It runs one script at a time.
type Client struct {
	responses *bufio.Scanner
	requests  *json.Encoder
	// broken is set once a script was abandoned: its response would be read
	// as the next script's.
	broken bool
}

// NewClient returns a Client that reads responses and writes requests.
func NewClient(responses io.Reader, requests io.Writer) *Client {
	return &Client{responses: newLineScanner(responses), requests: json.NewEncoder(requests)}
}

// ErrBroken means an earlier script was abandoned, so the Client can no
// longer tell which response is whose.
var ErrBroken = errors.New("automation: an earlier script was abandoned")

// Eval runs script in the page and returns its value as JSON. A script that
// throws returns its message as an error.
func (c *Client) Eval(ctx context.Context, script string) (json.RawMessage, error) {
	if c.broken {
		return nil, ErrBroken
	}
	if err := c.requests.Encode(request{Script: script}); err != nil {
		c.broken = true
		return nil, fmt.Errorf("automation: sending a script: %w", err)
	}
	read := make(chan error, 1)
	go func() { read <- c.read() }()
	select {
	case <-ctx.Done():
		c.broken = true
		return nil, fmt.Errorf("automation: waiting for a response: %w", ctx.Err())
	case err := <-read:
		if err != nil {
			c.broken = true
			return nil, err
		}
	}
	var res response
	if err := json.Unmarshal(c.responses.Bytes(), &res); err != nil {
		return nil, fmt.Errorf("automation: decoding a response: %w", err)
	}
	if res.Error != "" {
		return nil, fmt.Errorf("automation: %s", res.Error)
	}
	return res.Value, nil
}

func (c *Client) read() error {
	if c.responses.Scan() {
		return nil
	}
	if err := c.responses.Err(); err != nil {
		return fmt.Errorf("automation: reading a response: %w", err)
	}
	return fmt.Errorf("automation: the app closed its responses: %w", io.ErrUnexpectedEOF)
}
