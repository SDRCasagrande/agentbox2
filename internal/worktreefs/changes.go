package worktreefs

import (
	"bytes"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"agentbox/internal/api"
)

// countedLimit is how many untracked files Changes counts the lines of; past
// it, they are listed with none, as reading every file of a folder the agent
// forgot to ignore would make the view slow to follow.
const countedLimit = 1000

// Changes is every file the worktree changed since base (a commit; "" for a
// repository with none), with the lines each added and removed: what git
// diff --numstat says of the tracked ones, renames found, and each untracked
// file, its lines all added. Sorted by path, capped at ChangesLimit.
func Changes(root, base string) ([]api.WorktreeChange, bool, error) {
	var out []api.WorktreeChange
	if base != "" {
		statuses, err := git(root, nil, "diff", "--name-status", "-z", "-M", "--no-ext-diff", base, "--")
		if err != nil {
			return nil, false, err
		}
		counts, err := git(root, nil, "diff", "--numstat", "-z", "-M", "--no-ext-diff", base, "--")
		if err != nil {
			return nil, false, err
		}
		out = tracked(statuses, counts)
	}
	others, err := git(root, nil, "ls-files", "-z", "--others", "--exclude-standard")
	if err != nil {
		return nil, false, err
	}
	counted := 0
	for _, p := range strings.Split(others, "\x00") {
		if p == "" {
			continue
		}
		c := api.WorktreeChange{Path: p, Status: api.FileUntracked}
		if counted < countedLimit {
			counted++
			c.Additions, c.Binary = countLines(filepath.Join(root, filepath.FromSlash(p)))
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	if len(out) > ChangesLimit {
		return out[:ChangesLimit], true, nil
	}
	return out, false, nil
}

// tracked reads git diff's -z --name-status and --numstat of the same diff:
// "M\0path\0", "R087\0old\0new\0"; "3\t1\tpath\0", "3\t1\t\0old\0new\0", with
// "-\t-\t" for a binary file.
func tracked(statuses, counts string) []api.WorktreeChange {
	var out []api.WorktreeChange
	at := map[string]int{}
	fields := strings.Split(strings.TrimSuffix(statuses, "\x00"), "\x00")
	for i := 0; i+1 < len(fields); i += 2 {
		code := fields[i]
		if code == "" {
			continue
		}
		c := api.WorktreeChange{Path: fields[i+1], Status: api.FileModified}
		switch code[0] {
		case 'A':
			c.Status = api.FileAdded
		case 'D':
			c.Status = api.FileDeleted
		case 'R':
			if i+2 >= len(fields) {
				return out
			}
			c.Status, c.PreviousPath, c.Path = api.FileRenamed, fields[i+1], fields[i+2]
			i++
		case 'C':
			// Only with -C, which isn't asked: a copy is a new file.
			if i+2 >= len(fields) {
				return out
			}
			c.Status, c.Path = api.FileAdded, fields[i+2]
			i++
		}
		at[c.Path] = len(out)
		out = append(out, c)
	}
	fields = strings.Split(counts, "\x00")
	for i := 0; i < len(fields); i++ {
		parts := strings.SplitN(fields[i], "\t", 3)
		if len(parts) != 3 {
			continue
		}
		p := parts[2]
		if p == "" && i+2 < len(fields) {
			p = fields[i+2]
			i += 2
		}
		j, ok := at[p]
		if !ok {
			continue
		}
		if parts[0] == "-" {
			out[j].Binary = true
			continue
		}
		out[j].Additions, _ = strconv.Atoi(parts[0])
		out[j].Deletions, _ = strconv.Atoi(parts[1])
	}
	return out
}

// countLines is how many lines a new file has, up to TextLimit of it, or that
// it is binary. What isn't a regular file counts none.
func countLines(abs string) (int, bool) {
	st, err := os.Lstat(abs)
	if err != nil || !st.Mode().IsRegular() {
		return 0, false
	}
	f, err := os.Open(abs)
	if err != nil {
		return 0, false
	}
	defer func() { _ = f.Close() }()
	data, err := io.ReadAll(io.LimitReader(f, TextLimit))
	if err != nil || len(data) == 0 {
		return 0, false
	}
	if IsBinary(data) {
		return 0, true
	}
	n := bytes.Count(data, []byte{'\n'})
	if data[len(data)-1] != '\n' {
		n++
	}
	return n, false
}

// Sides reads a changed file whole at base, from previous when it moved, and
// in the worktree, for the Changes view. A side that isn't there is missing,
// not an error.
func Sides(root, base, p, previous string) (api.FileSides, error) {
	rel, err := Rel(root, p)
	if err != nil {
		return api.FileSides{}, err
	}
	if rel == "" {
		return api.FileSides{}, errors.New("name a file")
	}
	out := api.FileSides{Path: rel}
	from := rel
	if previous != "" {
		if from, err = Rel(root, previous); err != nil {
			return out, err
		}
		if from != rel {
			out.PreviousPath = from
		}
	}

	now, err := Read(root, rel, true)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		out.NewMissing = true
	case err != nil:
		return out, err
	case now.Binary || (now.Image != "" && now.Text == ""):
		out.Binary = true
	case now.TooLarge || now.Truncated:
		out.TooLarge = true
	default:
		out.NewText = now.Text
	}

	if base == "" {
		out.OldMissing = true
	} else {
		text, missing, err := BaseText(root, base, from)
		switch {
		case errors.Is(err, errBaseBinary):
			out.Binary = true
		case errors.Is(err, errBaseTooLarge):
			out.TooLarge = true
		case err != nil:
			return out, err
		}
		out.OldText, out.OldMissing = text, missing
	}
	if out.OldMissing && out.NewMissing {
		return out, fs.ErrNotExist
	}
	if out.Binary || out.TooLarge {
		out.OldText, out.NewText = "", ""
	}
	return out, nil
}
