param([int]$ParentPid,[int]$TunPid)
while ($true) {
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $TunPid -Force -ErrorAction SilentlyContinue
        break
    }
    if (-not (Get-Process -Id $TunPid -ErrorAction SilentlyContinue)) { break }
}
