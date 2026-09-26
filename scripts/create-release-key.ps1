$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot 'android'
$keystorePath = Join-Path $androidDir 'notaku-release.jks'
$propertiesPath = Join-Path $androidDir 'keystore.properties'

if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
  throw 'Kunci rilis sudah ada. Hapus hanya jika benar-benar ingin mengganti identitas penandatangan APK.'
}

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes).Replace('/', 'A').Replace('+', 'B').TrimEnd('=')
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) {
  $keytool = (Get-Command keytool.exe -ErrorAction Stop).Source
}

& $keytool -genkeypair -v -keystore $keystorePath -alias notaku -keyalg RSA -keysize 4096 -validity 10000 -storepass $password -keypass $password -dname 'CN=NotaKu, OU=Android, O=NotaKu, L=Indonesia, C=ID'
if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat kunci rilis Android.' }

@"
storeFile=../notaku-release.jks
storePassword=$password
keyAlias=notaku
keyPassword=$password
"@ | Set-Content -LiteralPath $propertiesPath -Encoding utf8NoBOM

Write-Host 'Kunci rilis dibuat di android/notaku-release.jks. Simpan backup aman dan jangan unggah file ini ke Git.'
