// Skii Pronos for Windows: the live site in its own window, always up to date (nothing to
// reinstall when the site changes). Links to other sites open in the normal browser.
const { app, BrowserWindow, shell, Menu } = require("electron");

const SITE = process.env.SKII_URL || "https://skii-pronos.vercel.app";
const HOST = new URL(SITE).host;

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function create() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 600,
    backgroundColor: "#07091a", title: "Skii Pronos", autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());
  win.loadURL(SITE);

  const outside = (url) => { try { return new URL(url).host !== HOST; } catch { return true; } };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (outside(url)) { shell.openExternal(url); return { action: "deny" }; }
    win.loadURL(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (outside(url)) { e.preventDefault(); shell.openExternal(url); } });
  // offline: show a retry page instead of a blank window
  win.webContents.on("did-fail-load", (_e, code) => {
    if (code === -3) return; // aborted navigation
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="background:#07091a;color:#f3f4fb;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Pas de connexion</h2><p style="color:#9097b3">Skii Pronos a besoin d'internet.</p><button onclick="location.href='${SITE}'" style="background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;border:0;border-radius:12px;padding:10px 20px;font-size:15px;cursor:pointer">Réessayer</button></div></body>`)}`);
  });
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
