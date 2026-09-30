using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public sealed class WinInetConnectionState
{
    public int Flags { get; set; }
    public string AutoConfigUrl { get; set; }
    public string ProxyServer { get; set; }
}

public static class WinInetProxy
{
    [StructLayout(LayoutKind.Explicit)]
    private struct OptionValue
    {
        [FieldOffset(0)] public int Number;
        [FieldOffset(0)] public IntPtr Text;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ConnectionOption
    {
        public int Kind;
        public OptionValue Value;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ConnectionOptionList
    {
        public int Size;
        public IntPtr Connection;
        public int Count;
        public int Error;
        public IntPtr Options;
    }

    [DllImport("wininet.dll", EntryPoint = "InternetQueryOptionW", SetLastError = true)]
    private static extern bool Query(IntPtr handle, int option, ref ConnectionOptionList list, ref int length);

    [DllImport("wininet.dll", EntryPoint = "InternetSetOptionW", SetLastError = true)]
    private static extern bool SetList(IntPtr handle, int option, ref ConnectionOptionList list, int length);

    [DllImport("wininet.dll", EntryPoint = "InternetSetOptionW", SetLastError = true)]
    private static extern bool Refresh(IntPtr handle, int option, IntPtr data, int length);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GlobalFree(IntPtr memory);

    private static ConnectionOptionList AllocateList(out int optionSize)
    {
        optionSize = Marshal.SizeOf(typeof(ConnectionOption));
        var list = new ConnectionOptionList
        {
            Size = Marshal.SizeOf(typeof(ConnectionOptionList)),
            Connection = IntPtr.Zero,
            Count = 3,
            Options = Marshal.AllocHGlobal(optionSize * 3)
        };
        Marshal.StructureToPtr(new ConnectionOption { Kind = 1 }, list.Options, false);
        Marshal.StructureToPtr(new ConnectionOption { Kind = 4 }, IntPtr.Add(list.Options, optionSize), false);
        Marshal.StructureToPtr(new ConnectionOption { Kind = 2 }, IntPtr.Add(list.Options, optionSize * 2), false);
        return list;
    }

    public static WinInetConnectionState Read()
    {
        int optionSize;
        var list = AllocateList(out optionSize);
        try
        {
            int length = list.Size;
            if (!Query(IntPtr.Zero, 75, ref list, ref length))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            var flags = (ConnectionOption)Marshal.PtrToStructure(list.Options, typeof(ConnectionOption));
            var url = (ConnectionOption)Marshal.PtrToStructure(IntPtr.Add(list.Options, optionSize), typeof(ConnectionOption));
            var server = (ConnectionOption)Marshal.PtrToStructure(IntPtr.Add(list.Options, optionSize * 2), typeof(ConnectionOption));
            var state = new WinInetConnectionState
            {
                Flags = flags.Value.Number,
                AutoConfigUrl = url.Value.Text == IntPtr.Zero ? "" : Marshal.PtrToStringUni(url.Value.Text),
                ProxyServer = server.Value.Text == IntPtr.Zero ? "" : Marshal.PtrToStringUni(server.Value.Text)
            };
            if (url.Value.Text != IntPtr.Zero) GlobalFree(url.Value.Text);
            if (server.Value.Text != IntPtr.Zero) GlobalFree(server.Value.Text);
            return state;
        }
        finally { Marshal.FreeHGlobal(list.Options); }
    }

    public static void Apply(int flags, string autoConfigUrl, string proxyServer)
    {
        int optionSize;
        var list = AllocateList(out optionSize);
        IntPtr urlPointer = Marshal.StringToHGlobalUni(autoConfigUrl ?? "");
        IntPtr serverPointer = Marshal.StringToHGlobalUni(proxyServer ?? "");
        try
        {
            var flagsOption = new ConnectionOption { Kind = 1, Value = new OptionValue { Number = flags } };
            var urlOption = new ConnectionOption { Kind = 4, Value = new OptionValue { Text = urlPointer } };
            var serverOption = new ConnectionOption { Kind = 2, Value = new OptionValue { Text = serverPointer } };
            Marshal.StructureToPtr(flagsOption, list.Options, false);
            Marshal.StructureToPtr(urlOption, IntPtr.Add(list.Options, optionSize), false);
            Marshal.StructureToPtr(serverOption, IntPtr.Add(list.Options, optionSize * 2), false);
            if (!SetList(IntPtr.Zero, 75, ref list, list.Size))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            Refresh(IntPtr.Zero, 95, IntPtr.Zero, 0);
            Refresh(IntPtr.Zero, 39, IntPtr.Zero, 0);
            Refresh(IntPtr.Zero, 37, IntPtr.Zero, 0);
        }
        finally
        {
            Marshal.FreeHGlobal(urlPointer);
            Marshal.FreeHGlobal(serverPointer);
            Marshal.FreeHGlobal(list.Options);
        }
    }
}
