# abletonPatcherGUI

> Electron + Node.js GUI + CLI that wraps a `util/patcher.js` module. This repository is an enhanced adaptation of the `rufoa/ableton` project and contains code that can produce Ableton "crack"-style authorization files. This README emphasizes that the code is provided for **educational, research, and code-review** purposes only and does not include instructions to perform any license-bypassing or illegal actions.

---

## Repo layout
```
.
├─ index.js            # Electron main process (GUI bootstrap + IPC)
├─ cli.js              # CLI wrapper for same functionality
├─ renderer/           # HTML / renderer JS for the GUI
├─ util/
│  ├─ patcher.js       # Critical: key/DSA/ASN.1 handling + binary-replace
│  └─ preload.js       # IPC preload bridge
└─ config/
   └─ cache.json
```

---

## Quick safe setup (clone & deps)
These steps prepare the repo for **code inspection and development only** — they do **not** run or trigger any patching logic.

```bash
# clone
git clone https://github.com/ReXulEc/abletonPatcherGUI.git
cd abletonPatcherGUI

# install dependencies
npm install

# for gui
npm run start

# for cli
npm run cli

```

---

## Legal & Safety — **READ THIS**
> **LEGAL WARNING:** This repository contains code that appears designed to modify or replace signature data in binary files and to produce signed files. Using software to bypass, remove, or alter licensing mechanisms for commercial/proprietary products may be illegal in many jurisdictions and can expose you to civil and criminal liability.  
>
> **SAFETY WARNING:** Running patching code against real files can irreversibly corrupt software or data. Do not execute any patching or signing code on production systems or on devices containing valuable data.  
>
> If your goal is legitimate research, reverse-engineering for interoperability (where permitted), or security testing, do so only with proper authorization, and prefer controlled environments (isolated VMs, snapshots, and test-only files). This README does not authorize illegal activity and is not legal advice. Proceed at your own risk.
