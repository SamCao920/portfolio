' Runs update-site.ps1 with no visible window. Point the scheduled task at this file.
' Output goes to tools\update-site.log so you can still check what happened.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""& '" & dir & "\update-site.ps1' *> '" & dir & "\update-site.log'"""
CreateObject("WScript.Shell").Run cmd, 0, False
