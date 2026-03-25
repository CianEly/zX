import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
console.log("Preload script starting...");
try {
	contextBridge.exposeInMainWorld("ipcRenderer", {
		send: (channel, ...args) => ipcRenderer.send(channel, ...args),
		on: (channel, listener) => {
			ipcRenderer.on(channel, (_event, ...args) => listener(...args));
		},
		off: (channel, listener) => {
			ipcRenderer.off(channel, (_event, ...args) => listener(...args));
		},
		invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
		getApiConfig: () => ipcRenderer.invoke("get-api-config"),
		getSshHosts: () => ipcRenderer.invoke("get-ssh-hosts"),
		connectSsh: (params) => ipcRenderer.invoke("connect-ssh", params),
		spawnLocalBackend: () => ipcRenderer.invoke("spawn-local-backend"),
		onConnectionProgress: (callback) => {
			ipcRenderer.on("connection-progress", (_event, data) => callback(data));
		}
	});
	console.log("IPC Bridge exposed successfully");
} catch (e) {
	console.error("Failed to expose IPC Bridge:", e);
}
//#endregion
