#!/bin/sh
# Claude Code SessionStart/SessionEnd hook: tags the herdr terminal with its session.
[ -n "$HC_TERMINAL_ID" ] || exit 0
in=$(cat)
fg=$(hc get "$HC_TERMINAL_ID" --json 2>/dev/null | jq -r '.foreground.pid // empty')
[ -n "$fg" ] || exit 0
# Only the terminal's top-level claude, not a nested `claude -p` inside it.
name=$(cat /proc/"$fg"/comm 2>/dev/null)
p=$PPID
while [ "$p" -gt 1 ] && [ "$(cat /proc/"$p"/comm 2>/dev/null)" != "$name" ]; do
  p=$(awk '/^PPid:/{print $2}' /proc/"$p"/status 2>/dev/null || echo 1)
done
[ "$p" = "$fg" ] || exit 0
case "$1" in
  start)
    id=$(printf %s "$in" | jq -r .session_id)
    cwd=$(printf %s "$in" | jq -r .cwd)
    hc label "$HC_TERMINAL_ID" "claude.session=$id" "claude.cwd=$cwd" "claude.resume-tried=" ;;
  end)
    hc label "$HC_TERMINAL_ID" claude.session= claude.cwd= ;;
esac >/dev/null 2>&1
exit 0
