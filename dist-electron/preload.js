import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
contextBridge.exposeInMainWorld("ipcRenderer", {
	send: (channel, ...args) => ipcRenderer.send(channel, ...args),
	on: (channel, listener) => {
		ipcRenderer.on(channel, listener);
	},
	off: (channel, listener) => {
		ipcRenderer.off(channel, listener);
	},
	invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
//#endregion
