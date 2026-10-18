#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$OrganizationId,
    [ValidateNotNullOrEmpty()][string]$EnvironmentId,
    [ValidateNotNullOrEmpty()][string]$AccountId,
    [ValidateNotNullOrEmpty()][string]$ListenAddress = '127.0.0.1',
    [ValidateRange(1, 65535)][int]$Port = 8787,
    [ValidateNotNullOrEmpty()][string[]]$AllowedHost,
    [ValidateNotNullOrEmpty()][string]$NodeCommand = 'node'
)
$ErrorActionPreference = 'Stop'

function Get-RegisteredSecretEnvironment {
    [CmdletBinding()]
    param()
    $codex = Get-Command codex -ErrorAction Stop
    $registrationText = & $codex.Source mcp get action1 --json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the registered action1 launch. Supply EnvironmentId explicitly.' }
    $registration = $registrationText | ConvertFrom-Json -ErrorAction Stop
    if ($registration.transport.type -ne 'stdio') { throw 'Expected a registered stdio launch.' }
    $arguments = @($registration.transport.args)
    $environmentIndex = [Array]::IndexOf($arguments, '--environment')
    $accountIndex = [Array]::IndexOf($arguments, '--account')
    if ($environmentIndex -lt 0 -or $environmentIndex + 1 -ge $arguments.Count) { throw 'No 1Password Environment configured in action1.' }
    [pscustomobject]@{
        EnvironmentId = $arguments[$environmentIndex + 1]
        AccountId = if ($accountIndex -ge 0 -and $accountIndex + 1 -lt $arguments.Count) { $arguments[$accountIndex + 1] } else { $null }
    }
}

function Invoke-Action1HttpGateway {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$Scope,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$SecretEnvironment,
        [string]$SecretAccount,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$BindAddress,
        [Parameter(Mandatory)][ValidateRange(1, 65535)][int]$BindPort,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$Hosts,
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$NodeExecutable
    )
    foreach ($id in $Scope) { if ($id -notmatch '^[A-Za-z0-9_-]{1,200}$') { throw 'Invalid organization ID.' } }
    $op = Get-Command op -ErrorAction Stop
    $node = Get-Command $NodeExecutable -ErrorAction Stop
    $variables = @{
        ACTION1_BASE_URL = 'https://app.na-2.action1.com/api/3.0'
        ACTION1_ORGANIZATION_IDS = ($Scope -join ',')
        ACTION1_HTTP_HOST = $BindAddress
        ACTION1_HTTP_PORT = [string]$BindPort
        ACTION1_HTTP_ALLOWED_HOSTS = ($Hosts -join ',')
        ACTION1_CLIENT_ID = ''; ACTION1_CLIENT_SECRET = ''
        CLIENT_ID = ''; CLIENT_SECRET = ''; ACTION1_HTTP_TOKEN = ''
    }
    $previous = @{}
    try {
        foreach ($name in $variables.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process')
        }
        $arguments = @('run', '--environment', $SecretEnvironment)
        if ($SecretAccount) { $arguments += @('--account', $SecretAccount) }
        $arguments += @('--', $node.Source, (Join-Path $PSScriptRoot 'src/http.mjs'))
        & $op.Source @arguments
        if ($LASTEXITCODE -ne 0) { throw 'HTTP gateway exited unsuccessfully. Check the injected origin token, credentials and organization scope.' }
    } finally {
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}

try {
    if (-not $EnvironmentId) {
        $registeredEnvironment = Get-RegisteredSecretEnvironment
        $EnvironmentId = $registeredEnvironment.EnvironmentId
        if (-not $AccountId) { $AccountId = $registeredEnvironment.AccountId }
    }
    if (-not $AllowedHost) { $AllowedHost = @($ListenAddress) }
    Invoke-Action1HttpGateway -Scope $OrganizationId -SecretEnvironment $EnvironmentId -SecretAccount $AccountId -BindAddress $ListenAddress -BindPort $Port -Hosts $AllowedHost -NodeExecutable $NodeCommand
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
