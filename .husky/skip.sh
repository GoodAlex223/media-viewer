# Sourced by .husky/pre-commit and .husky/pre-push — Husky runs only files named after git hooks.
#
# SKIP=<check>[,<check>…] waives the named checks for one command:
#     SKIP=docs-index git commit …
#     PowerShell:  $env:SKIP='docs-index'; git commit …; $env:SKIP=$null
# Prefer it to --no-verify, which skips EVERY check, the secret scan included. Every skip
# warns, every time: a $env:SKIP left set in a terminal would otherwise waive that check
# silently on every later commit.

HOOK_NAME=${HOOK_NAME:-$(basename "$0")}
# Commas and spaces both separate tokens — "docs-index secrets" and "docs-index, secrets" alike.
# (Stripping spaces instead fused the first form into one unknown-yet-unreported token.)
SKIP_LIST=",$(printf '%s' "${SKIP-}" | tr ' ' ','),"

# skipped <token> — exit 0 (and warn) when <token> is listed in SKIP. Whole tokens only:
# SKIP=docs never waives docs-index.
skipped() {
    case "$SKIP_LIST" in
        *",$1,"*)
            echo "⚠️  $HOOK_NAME: SKIP=$1 — the $1 check did NOT run" >&2
            return 0
            ;;
    esac
    return 1
}

# check_failed <token> — after `<check> || check_failed <token>`: keep the check's exit status and
# say what to do. 127 means the command itself is missing (run npm install), where suggesting SKIP
# would be wrong — and Husky reports "command not found" only when it sees the 127.
check_failed() {
    status=$?
    if [ "$status" -eq 127 ]; then
        echo "$HOOK_NAME: $1 could not run — command not found (exit 127). Run npm install." >&2
    else
        echo "$HOOK_NAME: $1 failed — fix it, or waive this check only: SKIP=$1 git commit …" >&2
    fi
    exit "$status"
}

# check_skip_tokens "<known tokens>" — warn about each SKIP token this hook does not know
# (a typo, or a pre-commit token during a push). Nothing is skipped by mistake: an unknown
# token matches no check, so the check runs. Subshell + set -f: a token like * must not
# glob-expand into file names.
check_skip_tokens() (
    set -f
    for t in $(printf '%s' "${SKIP-}" | tr ',' ' '); do
        case " $1 " in
            *" $t "*) ;;
            *) echo "⚠️  $HOOK_NAME: unknown SKIP token '$t' — this hook's checks are: $1" >&2 ;;
        esac
    done
)
