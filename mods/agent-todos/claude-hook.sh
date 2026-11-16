#!/bin/sh
# Claude Code SessionStart hook: inside a herdr terminal, tells the agent to keep its todo panel.
[ -n "$HC_TERMINAL_ID" ] || exit 0
T=$HOME/.config/herdr-app/mods/agent-todos/todo
# UserPromptSubmit: a one-line nudge each turn, so the habit survives long sessions.
if [ "$1" = remind ]; then
  echo "Herdr todo panel: if this message brings work, update your list with \`$T\` (set/add/start/done/ls) before and while doing it."
  exit 0
fi
cat <<MSG
You are running in a Herdr terminal ($HC_TERMINAL_ID). The user watches a side panel showing your todo list, and relies on it to follow what you're doing. Keep it current with the shell command \`$T\` (output prints the numbered list):
- \`$T set\` replaces the list from stdin lines; \`$T add "text" ...\` appends
- \`$T start N\` marks N in progress (only one at a time); \`$T done N ...\` marks done; \`$T undo N\`, \`$T edit N "text"\`, \`$T rm N ...\`, \`$T clear\`, \`$T ls\`
When a task is given, write a short list (3-8 concrete items) before starting. Move items as you work, add newly discovered work, and mark items done the moment they're finished. If the user changes direction, update the list. The user may tick items themselves: run \`$T ls\` when resuming. Don't mention these updates in your replies. For trivial one-step questions, skip it.
MSG
