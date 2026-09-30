using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Veyral")]
[assembly: AssemblyDescription("Veyral desktop launcher")]
[assembly: AssemblyCompany("Veyral")]
[assembly: AssemblyProduct("Veyral")]
[assembly: AssemblyVersion("0.1.0.0")]

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        string project = AppDomain.CurrentDomain.BaseDirectory;
        string electron = Path.Combine(project, "node_modules", "electron", "dist", "electron.exe");
        if (!File.Exists(electron))
        {
            MessageBox.Show("Electron is missing. Run start.cmd once to install dependencies.", "Veyral", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", null, EnvironmentVariableTarget.Process);
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = electron,
                Arguments = ".",
                WorkingDirectory = project,
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        catch (Exception error)
        {
            MessageBox.Show("Could not start Veyral: " + error.Message, "Veyral", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
