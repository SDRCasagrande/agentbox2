// The agentbox command a Windows terminal runs, from where.exe's answer.
// where.exe looks in its working directory before PATH, and matches without
// regard to case: started from its shortcut, the app's working directory is
// the folder it's installed in, where `agentbox` finds AgentBox.exe, the app
// itself. Running that with --version opens another AgentBox window, which
// the status poll then kills, every few seconds while Settings is open.
export function cliFromWhere(out: string | null, self: string): string | null {
  const own = self.toLowerCase();
  return (out ?? '').split(/\r?\n/).map((p) => p.trim()).find((p) => p && p.toLowerCase() !== own) ?? null;
}
