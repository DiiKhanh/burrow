## Install

Burrow runs on Macs with Apple Silicon and macOS 13 or later.

1. Download the `.dmg` and `SHA256SUMS` below. To check the download, run `shasum -a 256 -c SHA256SUMS` in Terminal, in the folder holding both: it prints `OK`.
2. Open the `.dmg` and drag Burrow to Applications.

## First open: Open Anyway

Burrow is free and has no paid Apple developer account, so it is signed ad hoc and not notarized. macOS blocks it the first time you open it. To allow it:

1. Open Burrow from Applications. macOS says it cannot check or verify Burrow: close that message with **Done** or **OK**, not **Move to Trash**.
2. Open **System Settings › Privacy & Security**, scroll down to **Security**, and click **Open Anyway** next to the message about Burrow. The button shows for about an hour after you tried to open Burrow.
3. Enter your login password, then confirm with **Open Anyway** (or **Open** on macOS 13 and 14).

Or, in Terminal, remove the quarantine macOS put on the download, then open Burrow as usual:

```sh
xattr -dr com.apple.quarantine /Applications/Burrow.app
```

Do this again for every new version.

## Full Disk Access, after every update

Burrow works without Full Disk Access but cannot read some places, such as the Trash. Each version has a new ad hoc signature, so macOS treats it as a new app and the access you gave the last one no longer applies. After installing a new version:

1. Open **System Settings › Privacy & Security › Full Disk Access**.
2. If Burrow is in the list, select it and remove it with **−**.
3. Click **+**, choose Burrow in Applications, and turn it on.
4. Quit and reopen Burrow.
