#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$EnvironmentId,
    [Parameter(Mandatory)][ValidateSet('US', 'EU', 'AU', 'NA-2')][string]$Region,
    [ValidateNotNullOrEmpty()][string]$AccountId,
    [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$ServerName = 'action1'
)
$ErrorActionPreference = 'Stop'
try {
    $codex = Get-Command codex -ErrorAction Stop
    $node = Get-Command node -ErrorAction Stop
    $op = Get-Command op -ErrorAction Stop
    $hosts = @{ US = 'app.action1.com'; EU = 'app.eu.action1.com'; AU = 'app.au.action1.com'; 'NA-2' = 'app.na-2.action1.com' }
    # Launch op directly: PowerShell native-command nesting can close MCP stdin.
    $arguments = @('mcp', 'add', $ServerName,
        '--env', "ACTION1_BASE_URL=https://$($hosts[$Region])/api/3.0",
        '--env', 'ACTION1_CLIENT_ID=', '--env', 'ACTION1_CLIENT_SECRET=',
        '--', $op.Source, 'run', '--environment', $EnvironmentId)
    if ($AccountId) { $arguments += @('--account', $AccountId) }
    $arguments += @('--', $node.Source, (Join-Path $PSScriptRoot 'src/server.mjs'))
    & $codex.Source @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Codex registration failed' }
    # Give desktop unlock prompts and bounded API retries enough time.
    $configRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $configPath = Join-Path $configRoot 'config.toml'
    $configuration = [IO.File]::ReadAllText($configPath)
    $tablePattern = '(?m)^\[mcp_servers\.' + [regex]::Escape($ServerName) + '\]\r?\n([\s\S]*?)(?=^\[|\z)'
    if ([regex]::Matches($configuration, $tablePattern).Count -ne 1) { throw 'Cannot identify registered server table' }
    $configuration = [regex]::Replace($configuration, $tablePattern, {
        param($match)
        $body = [regex]::Replace($match.Groups[1].Value, '(?m)^(startup_timeout_sec|tool_timeout_sec)\s*=.*\r?\n?', '')
        "[mcp_servers.$ServerName]`nstartup_timeout_sec = 60`ntool_timeout_sec = 180`n" + $body
    })
    [IO.File]::WriteAllText($configPath, $configuration, [Text.UTF8Encoding]::new($false))
} catch {
    [Console]::Error.WriteLine('Gateway registration failed. Check Codex availability and configuration access.')
    exit 1
}
