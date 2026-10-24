$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secureUri = Read-Host 'Paste the dedicated Atlas test URI (input is hidden)' -AsSecureString
$uriPointer = [IntPtr]::Zero
$uri = $null
$process = $null

try {
  $expectedHost = (Read-Host 'Enter the dedicated test cluster hostname (for example cluster-test.xxxxx.mongodb.net)').Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($expectedHost) -or $expectedHost -match '[/,:@]') {
    throw 'Enter only the Atlas test cluster hostname, without a scheme or port.'
  }

  $uriPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
  $uri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($uriPointer)

  $npm = (Get-Command npm.cmd -CommandType Application).Source
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $env:ComSpec
  $startInfo.Arguments = '/d /s /c ""' + $npm + '" test"'
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.EnvironmentVariables['MONGODB_TEST_URI'] = $uri
  $startInfo.EnvironmentVariables['MONGODB_TEST_ALLOWED_HOST'] = $expectedHost

  $process = [System.Diagnostics.Process]::Start($startInfo)
  $process.WaitForExit()
  exit $process.ExitCode
}
finally {
  if ($uriPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPointer)
  }
  $uri = $null
  if ($secureUri) { $secureUri.Dispose() }
  if ($process) { $process.Dispose() }
}
