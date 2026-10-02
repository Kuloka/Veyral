# Veyral v1.0.3

This update pins the Windows tunnel's upstream network interface to the interface used to reach the selected server before changing system routes. It is intended to prevent Wi-Fi traffic from looping back into the tunnel. If Windows cannot identify an active route to the server, Veyral stops before changing the system route.

Veyral finds and checks public HTTP, SOCKS4, and SOCKS5 proxies, displays country, city, and TCP latency, and can route traffic through a selected server. It also supports importing a personal WireGuard `.conf` profile.

Downloads:

- Windows x64: setup `.exe`
- Linux x64: `.AppImage`
- macOS Intel and Apple Silicon: available only when Apple signing and notarization credentials are configured; the previous unsigned v1.0.2 DMGs remain available

The interface supports English, Russian, Turkish, German, French, and Spanish. English is the default. A running tunnel stays active when the window is hidden in the system tray.

Windows and Linux builds are unsigned. The TUN engine requires administrator permission on Windows and macOS; Linux uses Polkit and needs `pkexec` and `iproute2`. Public proxy availability changes frequently. Live tunnel routing on Linux and macOS has not yet been verified on physical machines.
