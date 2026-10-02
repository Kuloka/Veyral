# Veyral

Website: https://veyralvpn.vercel.app/ The site source lives in `website/` and builds to `website/dist/`.

### Cloudflare Pages setup

To host the same site in Cloudflare Dashboard, open **Workers & Pages → Create → Pages → Connect to Git** and choose `Kuloka/Veyral`. Use `main` as the production branch, no framework preset, set the build command to `cd website && npm ci && npm run build`, and set the build output directory to `website/dist`. Keep the repository root directory at `/`. When you own a domain, add it under the Pages project's **Custom domains** tab; Cloudflare will create the DNS record for a domain managed in the same Cloudflare account. Registering a new domain is a separate step under **Register domains**.

If you connected the repository as a **Worker** instead, the root `wrangler.jsonc` deploys only `website/dist/` as static assets. Set the build command to `cd website && npm ci && npm run build`, the deploy command to `npx wrangler deploy`, and leave the root directory at `/`.

Veyral is a desktop VPN and proxy client for Windows, Linux, and macOS. It finds working public HTTP, SOCKS4, and SOCKS5 proxies, shows their country, city, and TCP latency, and routes traffic through a selected server using a TUN interface. You can also import your own WireGuard client profile. English is the default interface language. Change it in **Settings → Language** to Russian, Turkish, German, French, or Spanish.

## Requirements

- Windows 10/11 (x64), Linux (x64), or macOS (Intel or Apple Silicon)
- Administrator permission for the TUN network interface; Linux needs Polkit (`pkexec`) and `iproute2`
- Node.js 22 and npm when running from source

## Run

Download the appropriate executable from [GitHub Releases](https://github.com/Kuloka/Veyral/releases): a setup `.exe` for Windows, `.AppImage` for Linux, or `.dmg` for macOS. Windows builds are currently unsigned, so SmartScreen may ask for confirmation. Windows requests administrator permission on launch; Linux and macOS request it when starting the tunnel. macOS releases through v1.0.2 were unsigned; future macOS releases require Developer ID signing and Apple notarization.

### macOS release signing

For a downloadable DMG that opens normally under Gatekeeper, enroll in the [Apple Developer Program](https://developer.apple.com/programs/), create a **Developer ID Application** certificate, and export it **with its private key** as a password-protected `.p12`. A Developer ID Installer certificate is only needed for a `.pkg`, not this project's `.dmg`. Create an [app-specific password](https://account.apple.com/) for notarization.

Set these GitHub Actions repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `MAC_CSC_LINK` | Base64 of the `.p12` file |
| `MAC_CSC_KEY_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password, not the account password |
| `APPLE_TEAM_ID` | Ten-character Apple Developer Team ID |

On macOS, encode the certificate with `base64 -i DeveloperID.p12 | tr -d '\n'` and paste the output into `MAC_CSC_LINK`. Do not commit the `.p12`, passwords, or API keys. When all five secrets are present, the release workflow signs, notarizes, staples, and verifies the app before uploading the DMG. If none are present, macOS artifacts are skipped; incomplete credentials fail the build. Existing unsigned releases are not retroactively signed.

To run from source, install Node.js 22 and run `npm install`, then `npm start`. The `prestart` script downloads the official sing-box binary for your OS and verifies its archive checksum. On Windows, `start.cmd` is a quiet first-launch shortcut that installs dependencies and the engine if needed, then builds the local `Veyral.exe` launcher from `Veyral.Launcher.cs` if it is missing. Generated executables stay out of Git.

Veyral does not connect automatically. Select a location from the list and press **Connect**. Press **Disconnect** to stop the tunnel. While connected, closing the window hides Veyral in the system tray and keeps the tunnel running. Double-click the tray icon to reopen it. The tray menu also provides **Disconnect** and **Quit Veyral**; quitting stops the tunnel. When disconnected, closing the window exits the app on Windows and Linux.

## How it works

Veyral retrieves proxy lists from [ProxyScrape](https://github.com/ProxyScrape/free-proxy-list), [HProxy](https://github.com/hproxy-com/free-proxy-list), and [monosans](https://github.com/monosans/proxy-list). It checks up to 360 addresses in the background, with at most 12 concurrent checks. The displayed ping is the median of three TCP connection times to the proxy, with a two-second timeout per sample. A server enters the list only after an HTTPS request through it succeeds. Successful results are cached for one hour, so the list can appear immediately on the next launch.

The globe uses [Natural Earth](https://github.com/nvkelso/natural-earth-vector) geometry. The app obtains country, city, and approximate exit IP coordinates from [ipwho.is](https://ipwhois.io/documentation) and caches them for one day. If geolocation is unavailable, it falls back to the country supplied by the proxy source.

When connecting, Veyral tries the chosen proxy and up to two alternatives from the same country concurrently, preferring the same city. It then starts the bundled [sing-box 1.14.1](https://github.com/SagerNet/sing-box/releases/tag/v1.14.1) TUN engine. Its license is included with the downloaded engine. Connection stages and timings are recorded in Electron's Veyral user-data directory (`%APPDATA%\veyral-desktop` on Windows). Reliability history is stored there too.

## Settings

**Routing** can cover the entire computer, only selected programs, or every program except selected ones. Change routing before connecting. System DNS requests use the tunnel; reconnect after changing routing. In selected-app mode, check the exit IP inside one of those apps.

**WireGuard** accepts a client `.conf` profile for a server you control, with `AllowedIPs = 0.0.0.0/0`. Its private key is stored using Electron's OS-backed secure storage, when available. Importing a profile adds it to the location list. Without a profile, the WireGuard list shows the Veyral logo and an import prompt.

## Limits and privacy

Public proxies can disappear without notice. HTTP and SOCKS4 proxies primarily support TCP; DNS is sent through the selected proxy using DoH, and other UDP traffic is blocked for these proxy types. Some games and voice apps may therefore fail. Local network traffic remains directly accessible. A public proxy does not by itself encrypt the whole path to that proxy; use HTTPS for sensitive traffic. WireGuard behavior depends on your own server and profile.

The **Google: where am I** button opens a separate window through the selected proxy. Google may require a CAPTCHA. Other browsers can retain location history or use device geolocation, so their displayed location may differ from the current exit IP.

To rebuild the globe bundle after editing `globe-entry.mjs`:

```powershell
npx.cmd esbuild ./globe-entry.mjs --bundle --platform=browser --format=iife --outfile=assets/globe.js --minify
```
