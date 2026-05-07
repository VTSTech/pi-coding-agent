<#
.SYNOPSIS
Bumps the version number across all project files for pca-ext.
.DESCRIPTION
This script updates version numbers in multiple files:
- VERSION file (source of truth)
- package.json (main package)
- package-workspace.json (workspace configuration)
- individual-packages/*/package.json (all npm packages)
- README.md (version references)

The script uses flexible regex patterns to find and replace version numbers
and works with any valid semantic version string.

.PARAMETER Version
The new version number to set (e.g., "1.2.4", "2.0.0")
.PARAMETER DryRun
If specified, shows what would be changed without actually making changes
.PARAMETER Force
If specified, bypasses confirmation prompt
.EXAMPLE
.\bump-version.ps1 1.2.4
Bumps version to 1.2.4 across all files
.EXAMPLE
.\bump-version.ps1 2.0.0 --DryRun
Shows what would change for version 2.0.0 without making changes
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [switch]$DryRun = $false,
    
    [switch]$Force = $false
)

# Set strict mode for better error handling
Set-StrictMode -Version Latest

# Script configuration
$ScriptRoot = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $ScriptRoot
$VersionFile = Join-Path $ProjectRoot "VERSION"
$PackageJson = Join-Path $ProjectRoot "package.json"
$WorkspaceJson = Join-Path $ProjectRoot "package-workspace.json"
$ReadmeFile = Join-Path $ProjectRoot "README.md"
$IndividualPackagesDir = Join-Path $ProjectRoot "individual-packages"

# Validate version format (basic semver check)
if (-not ($Version -match "^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$")) {
    Write-Error "Invalid version format. Expected semantic versioning (e.g., 1.2.4, 2.0.0-beta.1)"
    exit 1
}

# Read current version from VERSION file
if (-not (Test-Path $VersionFile)) {
    Write-Error "VERSION file not found at $VersionFile"
    exit 1
}

$CurrentVersion = Get-Content $VersionFile | ForEach-Object { $_.Trim() }
Write-Host "Current version: $CurrentVersion"
Write-Host "New version: $Version"

# Show what will be changed
$changes = @(
    "VERSION file: $CurrentVersion -> $Version",
    "package.json: $CurrentVersion -> $Version",
    "package-workspace.json: $CurrentVersion -> $Version",
    "README.md: Update version references",
    "individual-packages/*/package.json: $CurrentVersion -> $Version"
)

if ($DryRun) {
    Write-Host "`n[Dry Run] What would be changed:" -ForegroundColor Yellow
    $changes | ForEach-Object { Write-Host "  - $_" }
    exit 0
}

# Confirm the change unless -Force is used
if (-not $Force) {
    Write-Host "`nThe following files will be modified:" -ForegroundColor Cyan
    $changes | ForEach-Object { Write-Host "  - $_" }
    
    $confirmation = Read-Host "`nContinue? (y/N)"
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-Host "Version bump cancelled."
        exit 0
    }
}

# Update VERSION file
Write-Host "Updating VERSION file..." -ForegroundColor Green
Set-Content $VersionFile $Version

# Update package.json
Write-Host "Updating package.json..." -ForegroundColor Green
$packageContent = Get-Content $PackageJson -Raw
$packageContent = $packageContent -replace "(?<=""version"":\s"")($CurrentVersion)($"")", "`$1$Version`$3"
Set-Content $PackageJson $packageContent

# Update package-workspace.json
Write-Host "Updating package-workspace.json..." -ForegroundColor Green
$workspaceContent = Get-Content $WorkspaceJson -Raw
$workspaceContent = $workspaceContent -replace "(?<=""version"":\s"")($CurrentVersion)($"")", "`$1$Version`$3"
Set-Content $WorkspaceJson $workspaceContent

# Update README.md version references
Write-Host "Updating README.md..." -ForegroundColor Green
$readmeContent = Get-Content $ReadmeFile -Raw
$readmeContent = $readmeContent -replace "v$CurrentVersion", "v$Version"
$readmeContent = $readmeContent -replace "Version-v$CurrentVersion", "Version-v$Version"
Set-Content $ReadmeFile $readmeContent

# Update individual packages
if (Test-Path $IndividualPackagesDir) {
    Write-Host "Updating individual packages..." -ForegroundColor Green
    Get-ChildItem $IndividualPackagesDir | Where-Object { $_.PSIsContainer -and (Test-Path (Join-Path $_.FullName "package.json")) } | ForEach-Object {
        $packageFile = Join-Path $_.FullName "package.json"
        $packageContent = Get-Content $packageFile -Raw
        
        # Update version field
        $packageContent = $packageContent -replace "(?<=""version"":\s"")($CurrentVersion)($"")", "`$1$Version`$3"
        
        # Update @vtstech/pi-shared dependency if it exists
        $sharedPattern = "(?<=""@vtstech/pi-shared"":\s"")([^""]+)("")"
        if ($packageContent -match $sharedPattern) {
            $packageContent = $packageContent -replace $sharedPattern, "`$1`$2"
        }
        
        Set-Content $packageFile $packageContent
        Write-Host "  Updated $($_.Name)/package.json"
    }
}

Write-Host "`n✅ Version bumped to $Version successfully!" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "1. Test the changes: npm run test"
Write-Host "2. Build packages: npm run build"
Write-Host "3. Update CHANGELOG.md with new version entry"
Write-Host "4. Commit changes and create a release"