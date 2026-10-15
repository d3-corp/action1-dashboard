#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('US', 'EU', 'AU', 'NA-2')][string]$Region = 'US',
    [string[]]$OrganizationId = @(),
    [ValidateNotNullOrEmpty()][string]$NodeCommand = 'node'
)
$ErrorActionPreference = 'Stop'
try {
    $node = Get-Command $NodeCommand -ErrorAction Stop
    $hostsByRegion = @{ US = 'app.action1.com'; EU = 'app.eu.action1.com'; AU = 'app.au.action1.com'; 'NA-2' = 'app.na-2.action1.com' }
    $env:ACTION1_BASE_URL = "https://$($hostsByRegion[$Region])/api/3.0"
    if ($OrganizationId.Count -gt 0) { $env:ACTION1_ORGANIZATION_IDS = ($OrganizationId -join ',') }
    if ((-not $env:ACTION1_CLIENT_ID -and -not $env:CLIENT_ID) -or (-not $env:ACTION1_CLIENT_SECRET -and -not $env:CLIENT_SECRET)) {
        throw 'Inject ACTION1_CLIENT_ID/ACTION1_CLIENT_SECRET or CLIENT_ID/CLIENT_SECRET from 1Password before launching.'
    }
    & $node.Source (Join-Path $PSScriptRoot 'src/server.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Gateway exited with code $LASTEXITCODE" }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
