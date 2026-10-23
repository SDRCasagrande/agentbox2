package worktreefs

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"agentbox/internal/api"
	"agentbox/internal/testutil"
)

// changesRepo is a branch "work" off main that, against main, edits a file in
// a commit and again uncommitted, adds one, moves one, deletes one, adds a
// binary, and leaves a file untracked and one ignored.
func changesRepo(t *testing.T) (root, base string) {
	t.Helper()
	root = t.TempDir()
	testutil.Git(t, root, "init", "-q", "-b", "main")
	write(t, root, ".gitignore", "*.log\n")
	write(t, root, "edit.txt", "one\ntwo\nthree\n")
	write(t, root, "gone.txt", "bye\n")
	write(t, root, "src/move.go", "package src\n\nfunc a() {}\nfunc b() {}\nfunc c() {}\n")
	testutil.Git(t, root, "add", "-A")
	testutil.Git(t, root, "commit", "-q", "-m", "first")
	testutil.Git(t, root, "checkout", "-q", "-b", "work")
	write(t, root, "edit.txt", "one\n2\nthree\n")
	write(t, root, "added.txt", "a\nb\n")
	if err := os.Mkdir(filepath.Join(root, "pkg"), 0o755); err != nil {
		t.Fatal(err)
	}
	testutil.Git(t, root, "mv", "src/move.go", "pkg/moved.go")
	testutil.Git(t, root, "add", "-A")
	testutil.Git(t, root, "commit", "-q", "-m", "second")
	write(t, root, "edit.txt", "one\n2\nthree\nfour")
	if err := os.Remove(filepath.Join(root, "gone.txt")); err != nil {
		t.Fatal(err)
	}
	write(t, root, "new/untracked.md", "x\ny\nz\n")
	write(t, root, "image.bin", "a\x00b")
	testutil.Git(t, root, "add", "image.bin")
	write(t, root, "debug.log", "ignored\n")
	base, _ = Base(root, "main")
	return root, base
}

func TestChangesCountsEveryKindOfChange(t *testing.T) {
	root, base := changesRepo(t)
	got, truncated, err := Changes(root, base)
	if err != nil || truncated {
		t.Fatalf("Changes() = %v, %v", truncated, err)
	}
	want := []api.WorktreeChange{
		{Path: "added.txt", Status: api.FileAdded, Additions: 2},
		{Path: "edit.txt", Status: api.FileModified, Additions: 2, Deletions: 1},
		{Path: "gone.txt", Status: api.FileDeleted, Deletions: 1},
		{Path: "image.bin", Status: api.FileAdded, Binary: true},
		{Path: "new/untracked.md", Status: api.FileUntracked, Additions: 3},
		{Path: "pkg/moved.go", PreviousPath: "src/move.go", Status: api.FileRenamed},
	}
	if len(got) != len(want) {
		t.Fatalf("Changes() = %+v,\nwant %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("Changes()[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}

	// With no commit to compare with, only what git doesn't track is new.
	got, _, err = Changes(root, "")
	if err != nil || len(got) != 1 || got[0].Path != "new/untracked.md" {
		t.Errorf("Changes(no base) = %+v, %v", got, err)
	}
}

func TestTrackedReadsGitsOutput(t *testing.T) {
	got := tracked("M\x00a\x00R087\x00old\x00new\x00C100\x00x\x00y\x00T\x00link\x00", "1\t2\ta\x004\t0\t\x00old\x00new\x00-\t-\tlink\x00junk\x00")
	want := []api.WorktreeChange{
		{Path: "a", Status: api.FileModified, Additions: 1, Deletions: 2},
		{Path: "new", PreviousPath: "old", Status: api.FileRenamed, Additions: 4},
		{Path: "y", Status: api.FileAdded},
		{Path: "link", Status: api.FileModified, Binary: true},
	}
	if len(got) != len(want) {
		t.Fatalf("tracked() = %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("tracked()[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
	if got := tracked("R100\x00only\x00", ""); len(got) != 0 {
		t.Errorf("tracked(cut short) = %+v", got)
	}
}

func TestSidesReadsBothVersions(t *testing.T) {
	root, base := changesRepo(t)
	for _, c := range []struct {
		path, previous string
		want           api.FileSides
	}{
		{"edit.txt", "", api.FileSides{Path: "edit.txt", OldText: "one\ntwo\nthree\n", NewText: "one\n2\nthree\nfour"}},
		{"added.txt", "", api.FileSides{Path: "added.txt", NewText: "a\nb\n", OldMissing: true}},
		{"gone.txt", "", api.FileSides{Path: "gone.txt", OldText: "bye\n", NewMissing: true}},
		{"pkg/moved.go", "src/move.go", api.FileSides{Path: "pkg/moved.go", PreviousPath: "src/move.go", OldText: "package src\n\nfunc a() {}\nfunc b() {}\nfunc c() {}\n", NewText: "package src\n\nfunc a() {}\nfunc b() {}\nfunc c() {}\n"}},
		{"image.bin", "", api.FileSides{Path: "image.bin", OldMissing: true, Binary: true}},
		{filepath.Join(root, "new/untracked.md"), "", api.FileSides{Path: "new/untracked.md", NewText: "x\ny\nz\n", OldMissing: true}},
	} {
		got, err := Sides(root, base, c.path, c.previous)
		if err != nil || got != c.want {
			t.Errorf("Sides(%s) = %+v, %v\nwant %+v", c.path, got, err, c.want)
		}
	}
	if _, err := Sides(root, base, "nope.txt", ""); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("Sides(missing) = %v, want ErrNotExist", err)
	}
	for _, bad := range []string{"", "../x", ".git/config"} {
		if _, err := Sides(root, base, bad, ""); err == nil {
			t.Errorf("Sides(%q) succeeded", bad)
		}
	}
	if _, err := Sides(root, base, "edit.txt", "../x"); err == nil {
		t.Error("Sides(previous outside) succeeded")
	}

	// A base too large to compare is told, with neither text.
	write(t, root, "big.txt", strings.Repeat("x\n", FullLimit/2+1))
	testutil.Git(t, root, "add", "big.txt")
	testutil.Git(t, root, "commit", "-q", "-m", "big")
	head, _ := Base(root, "")
	write(t, root, "big.txt", "small\n")
	if got, err := Sides(root, head, "big.txt", ""); err != nil || !got.TooLarge || got.NewText != "" {
		t.Errorf("Sides(big base) = %+v, %v", got.TooLarge, err)
	}
}

func TestCountLines(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "a", "1\n2")
	write(t, dir, "empty", "")
	if n, bin := countLines(filepath.Join(dir, "a")); n != 2 || bin {
		t.Errorf("countLines(a) = %d, %v", n, bin)
	}
	if n, _ := countLines(filepath.Join(dir, "empty")); n != 0 {
		t.Errorf("countLines(empty) = %d", n)
	}
	if n, _ := countLines(filepath.Join(dir, "missing")); n != 0 {
		t.Errorf("countLines(missing) = %d", n)
	}
	if err := os.Symlink("a", filepath.Join(dir, "link")); err != nil {
		t.Fatal(err)
	}
	if n, _ := countLines(filepath.Join(dir, "link")); n != 0 {
		t.Errorf("countLines(link) = %d", n)
	}
}
