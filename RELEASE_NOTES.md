# Veyral v1.0

Veyral finds and checks public HTTP, SOCKS4, and SOCKS5 proxies, displays country, city, and TCP latency, and can route traffic through a selected server. It also supports importing a personal WireGuard `.conf` profile.

Downloads:

- Windows x64: portable `.exe`
- Linux x64: `.AppImage`
- macOS Intel and Apple Silicon: `.dmg`

The interface supports English, Russian, Turkish, German, French, and Spanish. English is the default. A running tunnel stays active when the window is hidden in the system tray.

The builds are unsigned. The TUN engine requires administrator permission on Windows and macOS; Linux uses Polkit and needs `pkexec` and `iproute2`. Public proxy availability changes frequently. Linux and macOS packages are built on their native GitHub Actions runners, but live tunnel routing on those systems has not yet been verified on physical machines.
