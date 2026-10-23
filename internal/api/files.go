package api

// The file tree and file viewer beside a chat: an agent's worktree, or the
// project's repository for its lead, read through the daemon one folder and
// one file at a time (internal/worktreefs).

// FileEntry is one entry of a folder in a worktree.
type FileEntry struct {
	Name string `json:"name"`
	// Path is relative to the worktree's root, '/'-separated.
	Path string `json:"path"`
	Dir  bool   `json:"dir"`
	// Size is a file's, in bytes.
	Size int64 `json:"size,omitempty"`
	// Ignored is a path the repository's .gitignore leaves out. Only listed
	// when asked for.
	Ignored bool `json:"ignored,omitempty"`
	Symlink bool `json:"symlink,omitempty"`
}

// FileList is a folder's entries, folders first, each group by name. Truncated
// means the folder had more than were sent.
type FileList struct {
	Path      string      `json:"path"`
	Entries   []FileEntry `json:"entries"`
	Truncated bool        `json:"truncated"`
}

// File statuses, against the worktree's base (FileStatus.Base).
const (
	FileModified  = "modified"
	FileAdded     = "added"
	FileDeleted   = "deleted"
	FileUntracked = "untracked"
)

// FileStatus is what changed in a worktree since its base: for an agent, the
// commit its branch forked from the branch it was made from; for the lead,
// its HEAD. Changes maps a path to FileModified, FileAdded, FileDeleted or
// FileUntracked; a folder git reports untracked as a whole ends in '/'.
type FileStatus struct {
	Base      string            `json:"base"`
	Changes   map[string]string `json:"changes"`
	Truncated bool              `json:"truncated"`
}

// FileContent is a file read for the viewer. A binary file has neither Text
// nor Data; an image has Data (base64) and Image, its MIME type. Truncated
// means only the start of Text was sent: ask with full for more.
//
// Asked with base, a file that changed since its base comes with BaseText,
// what it was there, or BaseMissing when it wasn't there at all.
type FileContent struct {
	Path        string `json:"path"`
	Size        int64  `json:"size"`
	Binary      bool   `json:"binary,omitempty"`
	Image       string `json:"image,omitempty"`
	Data        string `json:"data,omitempty"`
	Text        string `json:"text,omitempty"`
	Truncated   bool   `json:"truncated,omitempty"`
	TooLarge    bool   `json:"tooLarge,omitempty"` // an image or a file too big to send at all
	Status      string `json:"status,omitempty"`   // as in FileStatus.Changes
	Base        string `json:"base,omitempty"`     // FileStatus.Base
	BaseText    string `json:"baseText,omitempty"`
	BaseMissing bool   `json:"baseMissing,omitempty"`
}

// EventFiles carries a FilesChange: files changed in a worktree whose folders
// the app has open in its file tree.
const EventFiles = "files"

// FilesChange says what moved in a chat's worktree (Ref names the chat, as
// the routes do). Dirs are folders whose entries changed, Files files whose
// contents did; "" is the root.
type FilesChange struct {
	Ref   string   `json:"ref"`
	Dirs  []string `json:"dirs"`
	Files []string `json:"files"`
}

// FileRenamed is a change of WorktreeChanges that moved a file, maybe editing
// it too: git found its PreviousPath gone and a file much like it here.
const FileRenamed = "renamed"

// WorktreeChanges is every file a worktree changed since its base (as in
// FileStatus.Base), committed or not, each with the lines it added and
// removed: the app's Changes view. Base is FileStatus.Base's name for it.
type WorktreeChanges struct {
	Base      string           `json:"base"`
	Files     []WorktreeChange `json:"files"`
	Truncated bool             `json:"truncated"`
}

// WorktreeChange is one file of WorktreeChanges. Status is FileModified,
// FileAdded, FileDeleted, FileRenamed or FileUntracked; a binary file counts
// no lines.
type WorktreeChange struct {
	Path         string `json:"path"`
	PreviousPath string `json:"previousPath,omitempty"`
	Status       string `json:"status"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	Binary       bool   `json:"binary,omitempty"`
}

// FileSides is one changed file whole, at the base (OldText, from
// PreviousPath when it moved) and in the worktree (NewText), for the app to
// diff with all the context around each change. OldMissing and NewMissing say
// a side isn't there: the file was added, or deleted. Binary and TooLarge
// mean neither text was sent.
type FileSides struct {
	Path         string `json:"path"`
	PreviousPath string `json:"previousPath,omitempty"`
	OldText      string `json:"oldText"`
	NewText      string `json:"newText"`
	OldMissing   bool   `json:"oldMissing,omitempty"`
	NewMissing   bool   `json:"newMissing,omitempty"`
	Binary       bool   `json:"binary,omitempty"`
	TooLarge     bool   `json:"tooLarge,omitempty"`
}
