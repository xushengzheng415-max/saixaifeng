param(
  [string]$Server = 'ubuntu@124.221.239.63',
  [string]$IdentityFile = 'C:\Users\15043\.ssh\codex_wechat_saixiaofeng_ed25519'
)

$ErrorActionPreference = 'Stop'

function ConvertFrom-SecureValue([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$callbackToken = ConvertFrom-SecureValue (Read-Host '粘贴企业微信页面中新生成的 Token' -AsSecureString)
$encodingAesKey = ConvertFrom-SecureValue (Read-Host '粘贴企业微信页面中新生成的 EncodingAESKey' -AsSecureString)
try {
  if ($callbackToken -notmatch '^[A-Za-z0-9]{1,32}$') { throw 'Token 格式不正确，未修改服务器。' }
  if ($encodingAesKey -notmatch '^[A-Za-z0-9+/]{43}$') { throw 'EncodingAESKey 格式不正确，未修改服务器。' }
  $payload = @{ WECOM_CALLBACK_TOKEN = $callbackToken; WECOM_ENCODING_AES_KEY = $encodingAesKey } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'ssh'
  $startInfo.ArgumentList.Add('-i')
  $startInfo.ArgumentList.Add($IdentityFile)
  $startInfo.ArgumentList.Add('-o')
  $startInfo.ArgumentList.Add('BatchMode=yes')
  $startInfo.ArgumentList.Add($Server)
  $startInfo.ArgumentList.Add('sudo node /opt/sxf-platform/apps/wecom-customer-router/rotate-callback-env.js /opt/sxf-platform/config/wecom-customer-router.env')
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($startInfo)
  $process.StandardInput.WriteLine($encoded)
  $process.StandardInput.Close()
  $stderr = $process.StandardError.ReadToEnd()
  $process.StandardOutput.ReadToEnd() | Out-Null
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "服务器配置更新失败：$stderr" }

  & ssh -i $IdentityFile -o BatchMode=yes $Server 'cd /opt/sxf-platform && docker compose up -d --force-recreate --no-deps wecom-customer-router >/dev/null && for attempt in 1 2 3 4 5 6 7 8 9 10; do status=$(sudo docker inspect --format "{{.State.Health.Status}}" sxf-wecom-customer-router); if [ "$status" = "healthy" ]; then echo healthy; exit 0; fi; sleep 2; done; exit 1'
  if ($LASTEXITCODE -ne 0) { throw '服务器重启或健康检查失败。' }
  Write-Host '服务器已使用新回调参数启动。请立即回到企业微信页面点击保存。' -ForegroundColor Green
} finally {
  $callbackToken = $null
  $encodingAesKey = $null
  $payload = $null
  $encoded = $null
}
