$files = Get-ChildItem -Path "C:\Users\Administrator\.gemini\antigravity-ide\brain\*\.system_generated\logs\transcript.jsonl" | Sort-Object LastWriteTime -Descending | Select-Object -First 8
foreach ($f in $files) {
    Write-Host ("`n=== CONVERSATION: " + $f.Directory.Parent.Parent.Name + " (" + $f.LastWriteTime + ") ===")
    $lines = Get-Content $f.FullName
    foreach ($line in $lines) {
        if ($line.Contains('"type":"USER_INPUT"')) {
            try {
                $obj = $line | ConvertFrom-Json
                if ($obj.content) {
                    Write-Host ("- " + $obj.content)
                }
            } catch {}
        }
    }
}
