# PowerShell 简易无依赖本地静态服务器 (适配 Windows 10/11 内置环境)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$distDir = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path $distDir)) {
    $distDir = Join-Path (Split-Path -Parent $PSScriptRoot) "dist"
}

if (-not (Test-Path $distDir)) {
    Write-Host "[错误] 未找到 dist 目录，请确保解压完整! " -ForegroundColor Red
    Pause
    Exit
}

$port = 5273
$listener = $null

while ($port -lt 5300) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        break
    } catch {
        $port++
        if ($listener) { $listener.Close() }
    }
}

if (-not $listener -or -not $listener.IsListening) {
    Write-Host "[错误] 无法绑定可用本地端口 (5273-5300)" -ForegroundColor Red
    Pause
    Exit
}

$url = "http://localhost:$port/"
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  🔖 栞 (Shiori) - AI 日语智能私教系统 已就绪! " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  本地运行地址: $url" -ForegroundColor Yellow
Write-Host "  正在为您自动打开浏览器..." -ForegroundColor Gray
Write-Host "  [提示] 请勿关闭此黑框窗口；使用完毕后直接关闭窗口即可退出. " -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

Start-Process $url

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 204
                try { $response.Close() } catch {}
                continue
            }

            # Gemini API Proxy
            if ($request.Url.AbsolutePath -eq "/api/gemini" -and $request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $rawBody = $reader.ReadToEnd()
                    $reader.Close()

                    $body = $rawBody | ConvertFrom-Json
                    $apiKey = $body.apiKey
                    $model = $body.model
                    if (-not $model) { $model = "gemini-3.1-flash-lite" }
                    if ($model -eq "gemini-3.6-flash" -or $model -eq "gemini-2.5-flash") { $model = "gemini-3.1-flash-lite" }

                    $contents = @()
                    $sysText = $body.systemInstruction
                    foreach ($m in $body.messages) {
                        if ($m.role -eq "system") {
                            $sysText = $m.content
                        } elseif ($m.role -eq "user") {
                            $contents += @{ role = "user"; parts = @(@{ text = $m.content }) }
                        } elseif ($m.role -eq "assistant") {
                            if ($contents.Count -eq 0) {
                                $contents += @{ role = "user"; parts = @(@{ text = "（系统前情提要：私教老师在上一轮作出了如下开场或讲解，请继续辅导）" }) }
                            }
                            $contents += @{ role = "model"; parts = @(@{ text = $m.content }) }
                        }
                    }

                    $gemPayload = @{ contents = $contents }
                    if ($sysText) {
                        $gemPayload.systemInstruction = @{ parts = @(@{ text = $sysText }) }
                    }

                    $jsonPayload = $gemPayload | ConvertTo-Json -Depth 10 -Compress
                    $tmpFile = [System.IO.Path]::GetTempFileName()
                    [System.IO.File]::WriteAllText($tmpFile, $jsonPayload, [System.Text.Encoding]::UTF8)

                    $targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}"

                    # Try curl with proxy 7897, fallback without proxy
                    $curlOut = & curl.exe -s -x "http://127.0.0.1:7897" -X POST $targetUrl -H "Content-Type: application/json" --data-binary "@$tmpFile" --max-time 18
                    if (-not $curlOut) {
                        $curlOut = & curl.exe -s -X POST $targetUrl -H "Content-Type: application/json" --data-binary "@$tmpFile" --max-time 18
                    }
                    $curlObj = $curlOut | ConvertFrom-Json

                    $isQuotaOrBusy = $false
                    if ($curlObj.error) {
                        $errCode = $curlObj.error.code
                        $errMsg = "$($curlObj.error.message)"
                        $errStatus = "$($curlObj.error.status)"
                        if ($errCode -eq 429 -or $errCode -eq 503 -or $errStatus -eq "RESOURCE_EXHAUSTED" -or $errMsg -like "*Quota exceeded*" -or $errMsg -like "*rate limit*") {
                            $isQuotaOrBusy = $true
                        }
                    }

                    if ($isQuotaOrBusy) {
                        $fallbackModels = @('gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash')
                        foreach ($fb in $fallbackModels) {
                            if ($fb -eq $model) { continue }
                            $fbUrl = "https://generativelanguage.googleapis.com/v1beta/models/${fb}:generateContent?key=${apiKey}"
                            $fbOut = & curl.exe -s -x "http://127.0.0.1:7897" -X POST $fbUrl -H "Content-Type: application/json" --data-binary "@$tmpFile" --max-time 15
                            if (-not $fbOut) {
                                $fbOut = & curl.exe -s -X POST $fbUrl -H "Content-Type: application/json" --data-binary "@$tmpFile" --max-time 15
                            }
                            if ($fbOut) {
                                try {
                                    $testObj = $fbOut | ConvertFrom-Json
                                    if ($testObj.candidates -and $testObj.candidates.Count -gt 0) {
                                        $curlObj = $testObj
                                        break
                                    }
                                } catch {}
                            }
                        }
                    }
                    Remove-Item $tmpFile -ErrorAction SilentlyContinue

                    if ($curlObj.candidates -and $curlObj.candidates.Count -gt 0) {
                        $cText = $curlObj.candidates[0].content.parts[0].text
                        $resObj = @{
                            success = $true
                            text = $cText
                            tokens = @{
                                prompt = 50
                                completion = [Math]::Ceiling($cText.Length * 1.3)
                                total = 50 + [Math]::Ceiling($cText.Length * 1.3)
                            }
                        }
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes(($resObj | ConvertTo-Json -Compress))
                    } else {
                        $errText = if ($curlObj.error) { $curlObj.error.message } else { "Gemini API 响应异常" }
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes((@{ success = $false; error = $errText } | ConvertTo-Json -Compress))
                    }
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } catch {
                    try {
                        $errPayload = @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes($errPayload)
                        $response.ContentType = "application/json; charset=utf-8"
                        $response.ContentLength64 = $resBytes.Length
                        $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                    } catch {
                        # Response already submitted or connection aborted by client
                    }
                }
                try { $response.Close() } catch {}
                continue
            }

            # Static file handling
            $reqPath = $request.Url.AbsolutePath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($reqPath)) { $reqPath = "index.html" }

            $localPath = Join-Path $distDir $reqPath
            if (-not (Test-Path $localPath -PathType Leaf)) {
                $localPath = Join-Path $distDir "index.html"
            }

            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }

            try {
                $fileBytes = [System.IO.File]::ReadAllBytes($localPath)
                $response.ContentType = $contentType
                $response.ContentLength64 = $fileBytes.Length
                $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
            } catch {
                try { $response.StatusCode = 500 } catch {}
            }
            try { $response.Close() } catch {}
        } catch {
            Write-Host "处理单次请求时出现非致命异常: $_" -ForegroundColor Yellow
        }
    }
} finally {
    if ($listener) {
        $listener.Stop()
        $listener.Close()
    }
}
