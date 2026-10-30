package removal

import (
	"bytes"
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

// Processes lists the names of the processes running now, as the kernel
// names them: the executable's name, cut to its first 16 bytes. Clean and
// Space ask it which apps run, to leave the files of a running app alone.
type Processes interface {
	Names() ([]string, error)
}

// OSProcesses lists the processes the user running Burrow runs on this Mac.
// Another user's app never touches this user's files.
type OSProcesses struct{}

// Names returns the name of every process of this user the kernel lists.
func (OSProcesses) Names() ([]string, error) {
	procs, err := unix.SysctlKinfoProcSlice("kern.proc.uid", os.Getuid())
	if err != nil {
		return nil, fmt.Errorf("removal: listing processes: %w", err)
	}
	names := make([]string, 0, len(procs))
	for _, proc := range procs {
		comm := proc.Proc.P_comm[:]
		if end := bytes.IndexByte(comm, 0); end >= 0 {
			comm = comm[:end]
		}
		names = append(names, string(comm))
	}
	return names, nil
}
