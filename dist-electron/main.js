import { join } from "node:path";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var _dirname = fileURLToPath(new URL(".", "" + import.meta.url));
var electron = await import("electron");
var { app, BrowserWindow } = electron.default || electron;
var mainWindow = null;
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: join(_dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (!mainWindow) return;
	mainWindow.setBackgroundColor("#0A0B0F");
	if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(join(_dirname, "../dist/index.html"));
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		mainWindow = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(createWindow);
//#endregion
