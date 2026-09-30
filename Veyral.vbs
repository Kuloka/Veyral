Option Explicit

Dim files, shell, windows, project, electron, launcher, engine, compiler, source, manifest, status
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set windows = CreateObject("Shell.Application")
project = files.GetParentFolderName(WScript.ScriptFullName)
electron = files.BuildPath(project, "node_modules\electron\dist\electron.exe")
launcher = files.BuildPath(project, "Veyral.exe")
engine = files.BuildPath(project, "vendor\sing-box-1.14.1-windows-amd64\sing-box.exe")
compiler = files.BuildPath(shell.ExpandEnvironmentStrings("%WINDIR%"), "Microsoft.NET\Framework\v4.0.30319\csc.exe")
source = files.BuildPath(project, "Veyral.Launcher.cs")
manifest = files.BuildPath(project, "Veyral.manifest")
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

If Not files.FileExists(launcher) Then
    If Not files.FileExists(compiler) Then
        MsgBox "Windows .NET compiler is missing. Install .NET Framework 4.x or use the release installer.", vbCritical, "Veyral"
        WScript.Quit 1
    End If
    status = shell.Run("""" & compiler & """ /nologo /target:winexe /out:""" & launcher & """ /win32manifest:""" & manifest & """ /reference:System.Windows.Forms.dll """ & source & """", 0, True)
    If status <> 0 Or Not files.FileExists(launcher) Then
        MsgBox "Could not build the Veyral launcher. Use the release installer or check .NET Framework.", vbCritical, "Veyral"
        WScript.Quit 1
    End If
End If

On Error Resume Next
windows.ShellExecute launcher, "", project, "open", 1
If Err.Number <> 0 Then MsgBox "Could not start Veyral: " & Err.Description, vbCritical, "Veyral"
