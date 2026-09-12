$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:5299/")
$l.Start()
Write-Host "SUCCESS: HttpListener started on 5299"
$l.Stop()
$l.Close()
