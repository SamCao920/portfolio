' Starts watch-admin.ps1 with no visible window.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""& '" & dir & "\watch-admin.ps1' *>> '" & dir & "\watch-admin.log'"""
CreateObject("WScript.Shell").Run cmd, 0, False
