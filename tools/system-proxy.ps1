param(
    [ValidateSet('connect','disconnect')][string]$Mode,
    [string]$BackupPath,
    [string]$ProxyAddress,
    [string]$PacUrl
)
$ErrorActionPreference = 'Stop'
$registryPath = 'Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$names = @('ProxyEnable','ProxyServer','ProxyOverride','AutoConfigURL','AutoDetect')
$registry = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath, $true)
Add-Type -Path (Join-Path $PSScriptRoot 'WinInetProxy.cs')

try {
    if ($Mode -eq 'connect') {
        if ($ProxyAddress -notmatch '^127\.0\.0\.1:\d{1,5}$') { throw 'Invalid local proxy address' }
        if (Test-Path -LiteralPath $BackupPath) { throw 'Previous proxy settings need restoration' }
        $values = @{}
        $existing = @($registry.GetValueNames())
        foreach ($name in $names) {
            if ($existing -contains $name) {
                $values[$name] = @{ exists = $true; kind = $registry.GetValueKind($name).ToString(); value = $registry.GetValue($name) }
            } else {
                $values[$name] = @{ exists = $false }
            }
        }
        $connection = [WinInetProxy]::Read()
        @{ proxyAddress = $ProxyAddress; values = $values; wininet = @{ flags = $connection.Flags; autoConfigUrl = $connection.AutoConfigUrl; proxyServer = $connection.ProxyServer } } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $BackupPath -Encoding UTF8
        $registry.DeleteValue('AutoConfigURL', $false)
        $registry.SetValue('ProxyServer', $ProxyAddress, [Microsoft.Win32.RegistryValueKind]::String)
        $registry.SetValue('ProxyOverride', '<local>;localhost;127.0.0.1;[::1]', [Microsoft.Win32.RegistryValueKind]::String)
        $registry.SetValue('ProxyEnable', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
        $registry.SetValue('AutoDetect', 0, [Microsoft.Win32.RegistryValueKind]::DWord)
        [WinInetProxy]::Apply(2, '', $ProxyAddress)
        $applied = [WinInetProxy]::Read()
        if (($applied.Flags -band 2) -eq 0 -or $applied.ProxyServer -ne $ProxyAddress) { throw 'Windows did not apply the proxy setting' }
    } else {
        if (-not (Test-Path -LiteralPath $BackupPath)) { return }
        $backup = Get-Content -LiteralPath $BackupPath -Raw | ConvertFrom-Json
        if (($backup.proxyAddress -and $registry.GetValue('ProxyServer') -ne $backup.proxyAddress) -or ($backup.pacUrl -and $registry.GetValue('AutoConfigURL') -ne $backup.pacUrl)) {
            Remove-Item -LiteralPath $BackupPath
            return
        }
        foreach ($name in $names) {
            $saved = $backup.values.$name
            if ($saved.exists) {
                $kind = [System.Enum]::Parse([Microsoft.Win32.RegistryValueKind], [string]$saved.kind)
                $registry.SetValue($name, $saved.value, $kind)
            } else {
                $registry.DeleteValue($name, $false)
            }
        }
        if ($backup.wininet) {
            $savedServer = [string]$backup.wininet.proxyServer
            if (-not $backup.wininet.PSObject.Properties['proxyServer']) { $savedServer = [string]$backup.values.ProxyServer.value }
            [WinInetProxy]::Apply([int]$backup.wininet.flags, [string]$backup.wininet.autoConfigUrl, $savedServer)
        } else {
            $flags = 1
            if ($backup.values.ProxyEnable.exists -and [int]$backup.values.ProxyEnable.value -eq 1) { $flags = $flags -bor 2 }
            if ($backup.values.AutoConfigURL.exists -and $backup.values.AutoConfigURL.value) { $flags = $flags -bor 4 }
            if ($backup.values.AutoDetect.exists -and [int]$backup.values.AutoDetect.value -eq 1) { $flags = $flags -bor 8 }
            [WinInetProxy]::Apply($flags, [string]$backup.values.AutoConfigURL.value, [string]$backup.values.ProxyServer.value)
        }
        Remove-Item -LiteralPath $BackupPath
    }
} finally {
    $registry.Dispose()
}
