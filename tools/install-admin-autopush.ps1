# One-time setup: start the admin auto-push watcher at every logon, and start it now.
$vbs = Join-Path $PSScriptRoot "run-watch-admin.vbs"
$action  = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Auto-push admin edits" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "Auto-push admin edits"
"Installed. Admin saves now publish automatically."
