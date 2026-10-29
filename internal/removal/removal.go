// Package removal is what Clean and Space share to remove files from disk:
// the Guard that re-checks a path right before removal, the Remover, the
// history log and the list of running processes. A safety fix here lands in
// both.
package removal

// RemovalMethod says how an item is removed.
type RemovalMethod string

const (
	Delete      RemovalMethod = "delete"
	MoveToTrash RemovalMethod = "move-to-trash"
)

// SkipReason is why a selected item was left in place.
type SkipReason string

const (
	InUse            SkipReason = "in_use"
	PermissionDenied SkipReason = "permission_denied"
	Protected        SkipReason = "protected"
	AlreadyGone      SkipReason = "already_gone"
)
