# Drop Cars - Start XAMPP MySQL helper script
# Checks if MySQL is already running on port 3306, otherwise starts it.

$port = 3306
$mysqlPath = "C:\xampp\mysql\bin\mysqld.exe"
$myIniPath = "mysql\bin\my.ini"
$xamppRoot = "C:\xampp"

Write-Host "Checking if MySQL is running on port $port..." -ForegroundColor Cyan

# Check if port is already open
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($conn) {
    $procId = $conn[0].OwningProcess
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.Name } else { "Unknown" }
    Write-Host "MySQL (or another database server) is already running on port $port (Process: $procName, PID: $procId)." -ForegroundColor Green
    exit 0
}

# If not running, check if XAMPP MySQL exists
if (-not (Test-Path $mysqlPath)) {
    Write-Error "MySQL executable not found at $mysqlPath. Please install XAMPP or start MySQL manually."
    exit 1
}

Write-Host "Starting XAMPP MySQL service..." -ForegroundColor Yellow
try {
    # Launch mysqld.exe using WMI to escape the caller's Job Object
    $wmiResult = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = "`"$mysqlPath`" --defaults-file=`"$myIniPath`" --standalone"
        CurrentDirectory = $xamppRoot
    }
    
    if ($wmiResult.ReturnValue -ne 0) {
        throw "WMI process creation returned error code $($wmiResult.ReturnValue)"
    }
    
    # Wait for the service to start listening on port 3306 (up to 10 seconds)
    $started = $false
    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
        if ($conn) {
            $started = $true
            break;
        }
        Write-Host "Waiting for MySQL to start... ($i/10)" -ForegroundColor Gray
    }
    
    if ($started) {
        Write-Host "MySQL started successfully and is now listening on port $port." -ForegroundColor Green
    } else {
        # Check if process is running
        $proc = Get-Process -Id $wmiResult.ProcessId -ErrorAction SilentlyContinue
        if (-not $proc) {
            Write-Error "MySQL process exited immediately after starting. Check C:\xampp\mysql\data\*.err logs for details."
        } else {
            Write-Warning "MySQL process is running (PID: $($wmiResult.ProcessId)), but not yet listening on port $port."
        }
        exit 1
    }
} catch {
    Write-Error "Failed to start MySQL: $_"
    exit 1
}
