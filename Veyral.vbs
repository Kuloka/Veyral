Option Explicit

Dim files, shell, windows, project, electron, launcher, engine, status
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set windows = CreateObject("Shell.Application")
project = files.GetParentFolderName(WScript.ScriptFullName)
electron = files.BuildPath(project, "node_modules\electron\dist\electron.exe")
launcher = files.BuildPath(project, "Veyral.exe")
engine = files.BuildPath(project, "vendor\sing-box-1.14.1-windows-amd64\sing-box.exe")
shell.CurrentDirectory = project
On Error Resume Next
shell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0

If Not files.FileExists(electron) Then
    status = shell.Run("cmd.exe /d /c npm.cmd install", 0, True)
    If status <> 0 Or Not files.FileExists(electron) Then
        MsgBox "Could not install Electron. Install Node.js and run npm.cmd install in the Veyral folder.", vbCritical, "Veyral"
        WScript.Quit 1
    End If
End If

If Not files.FileExists(engine) Then
    status = shell.Run("cmd.exe /d /c npm.cmd run prepare:engine", 0, True)
    If status <> 0 Or Not files.FileExists(engine) Then
        MsgBox "Could not install sing-box. Check your network connection and try again.", vbCritical, "Veyral"
        WScript.Quit 1
    End If
End If

On Error Resume Next
windows.ShellExecute launcher, "", project, "open", 1
If Err.Number <> 0 Then MsgBox "Could not start Veyral: " & Err.Description, vbCritical, "Veyral"
