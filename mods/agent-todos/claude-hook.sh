#!/bin/sh
# Claude Code SessionStart hook: inside a herdr terminal, tells the agent to keep its todo panel.
[ -n "$HC_TERMINAL_ID" ] || exit 0
T=$HOME/.config/herdr-app/mods/agent-todos/todo
# UserPromptSubmit: a one-line nudge each turn, so the habit survives long sessions.
if [ "$1" = remind ]; then
  echo "Herdr todo panel: if this message brings work or a multi-step plan (including steps the user runs themselves), update your list with \`$T\` (set/add/start/done/ls) before and while doing it; run \`$T ls\` first."
  exit 0
fi
# New conversation (startup, /clear): drop the previous session's todos.
case "$(jq -r '.source // empty' 2>/dev/null)" in
  startup|clear) "$T" clear >/dev/null 2>&1 ;;
esac
cat <<MSG
You are running in a Herdr terminal ($HC_TERMINAL_ID). The user watches a side panel showing your todo list, and relies on it to follow what you're doing. Keep it current with the shell command \`$T\` (output prints the numbered list):
- \`$T set\` replaces the list from stdin lines (indented lines become sub-items of the line above); \`$T add "text" ...\` appends; \`$T sub N "text" ...\` adds sub-items to N
- Items are N or N.M (one level of nesting). \`$T start N.M\` marks it in progress (only one at a time); \`$T done N.M ...\` marks done; \`$T undo\`, \`$T edit N.M "text"\`, \`$T rm\`, \`$T clear\`, \`$T ls\`. A parent follows its sub-items (all done = done, collapsed in the panel); marking a parent done/undone does the same to its sub-items.
- Use sub-items to break a bigger step into its parts instead of flat "2a/2b" items.
When a task is given, or you propose steps/exercises the user will carry out themselves, write a short list (3-8 concrete items) before starting or answering. Move items as you work, add newly discovered work, and mark items done the moment they're finished. If the user changes direction, update the list. The user may tick items themselves: run \`$T ls\` when resuming. Don't mention these updates in your replies. For trivial one-step questions, skip it.
MSG
