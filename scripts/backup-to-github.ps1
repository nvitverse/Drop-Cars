<#
.SYNOPSIS
  GitHub = BACKUP only. Pushes the working branch and a snapshot of any unfinished (uncommitted) work to branch `backup/wip`.
  Nothing in the working folder is changed: the snapshot uses a temporary index, so it never touches your files, staging area or branch.
.USAGE
  powershell -File scripts\backup-to-github.ps1            (the scheduled task runs this every hour)
#>
$ErrorActionPreference = "Continue"   # git prints line-ending warnings on stderr; they are not errors
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head = (git rev-parse HEAD).Trim()
$log = "C:\gtmp\backup-to-github.log"
function Say($m) { "$((Get-Date).ToString('yyyy-MM-dd HH:mm')) $m" | Out-File -Append -Encoding utf8 $log; Write-Host $m }

# 1. unfinished work -> one snapshot commit on backup/wip (tracked files + new source files; never .env / credentials / keys)
$idx = Join-Path $env:TEMP "dc-backup-index"
Remove-Item $idx -ErrorAction SilentlyContinue
$env:GIT_INDEX_FILE = $idx
try {
  git read-tree HEAD 2>$null
  git add -u 2>$null
  git add -A -- '*.ts' '*.tsx' '*.js' '*.py' '*.json' '*.md' '*.ps1' '*.yml' '*.php' ':!**/.env*' ':!**/credentials*' ':!**/*secret*' ':!**/*.keystore' ':!**/node_modules/**' 2>$null
  $tree = (git write-tree).Trim()
} finally { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue; Remove-Item $idx -ErrorAction SilentlyContinue }
$headTree = (git rev-parse "HEAD^{tree}").Trim()
if ($tree -ne $headTree) {
  $c = (git commit-tree $tree -p $head -m "auto-backup of unfinished work on $branch ($((Get-Date).ToString('yyyy-MM-dd HH:mm')))").Trim()
  git update-ref refs/heads/backup/wip $c
  Say "snapshot of unfinished work -> backup/wip ($($c.Substring(0,8)))"
} else {
  git update-ref refs/heads/backup/wip $head
  Say "nothing unfinished; backup/wip = $($head.Substring(0,8))"
}
# 2. push (the branch normally, backup/wip as a pure backup that may be replaced)
git push --quiet origin $branch 2>&1 | ForEach-Object { Say $_ }
git push --quiet --force origin refs/heads/backup/wip:refs/heads/backup/wip 2>&1 | ForEach-Object { Say $_ }
Say "backup pushed ($branch @ $($head.Substring(0,8)))"
