import { BrowserWindow, app, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os, { homedir, userInfo } from "node:os";
import * as net from "node:net";
import { Client } from "ssh2";
//#region node_modules/ssh-config/lib/glob.js
function escapeChars(text, chars) {
	for (let char of chars) text = text.replace(new RegExp("\\" + char, "g"), "\\" + char);
	return text;
}
function match$1(pattern, text) {
	pattern = escapeChars(pattern, "\\()[]{}.+^$|");
	pattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".?");
	return new RegExp("^(?:" + pattern + ")$").test(text);
}
/**
* A helper function to match input against [pattern-list](https://www.freebsd.org/cgi/man.cgi?query=ssh_config&sektion=5#PATTERNS).
* According to `man ssh_config`, negated patterns shall be matched first.
*
* @param {string|string[]} patternList one or more glob patterns to match
* @param {string} text the text to match
*/
function glob(patternList, text) {
	const patterns = Array.isArray(patternList) ? patternList : patternList.split(/,/);
	let result = false;
	for (const pattern of patterns) if (pattern[0] == "!" && match$1(pattern.slice(1), text)) return false;
	else if (match$1(pattern, text)) result = true;
	return result;
}
//#endregion
//#region node_modules/ssh-config/lib/ssh-config.js
var RE_SPACE = /\s/;
var RE_LINE_BREAK = /\r|\n/;
var RE_SECTION_DIRECTIVE = /^(Host|Match)$/i;
var RE_MULTI_VALUE_DIRECTIVE = /^(GlobalKnownHostsFile|Host|IPQoS|SendEnv|UserKnownHostsFile|ProxyCommand|Match|CanonicalDomains)$/i;
var RE_QUOTE_DIRECTIVE = /^(?:CertificateFile|IdentityFile|IdentityAgent|User)$/i;
var RE_SINGLE_LINE_DIRECTIVE = /^(Include|IdentityFile)$/i;
/**
* A type of line in an ssh-config file. Differentiates between directives,
* comments, and empty lines.
*/
var LineType;
(function(LineType) {
	/** line with a directive in an ssh-config file */
	LineType[LineType["DIRECTIVE"] = 1] = "DIRECTIVE";
	/** line with a comment in an ssh-config file */
	LineType[LineType["COMMENT"] = 2] = "COMMENT";
	/** empty line in an ssh-config file */
	LineType[LineType["EMPTY"] = 3] = "EMPTY";
})(LineType || (LineType = {}));
var REPEATABLE_DIRECTIVES = [
	"IdentityFile",
	"LocalForward",
	"RemoteForward",
	"DynamicForward",
	"CertificateFile"
];
function compare(line, opts) {
	return opts.hasOwnProperty(line.param) && opts[line.param] === line.value;
}
function getIndent(config) {
	for (const line of config) if (line.type === LineType.DIRECTIVE && "config" in line) {
		for (const subline of line.config) if (subline.before) return subline.before;
	}
	return "  ";
}
function match(criteria, context) {
	const testCriterion = (key, criterion) => {
		switch (key.toLowerCase()) {
			case "all": return true;
			case "final":
				if (context.inFinalPass) return true;
				context.doFinalPass = true;
				return false;
			case "exec": return spawnSync(`function main {
          ${criterion}
        }
        main`, { shell: true }).status === 0;
			case "host": return glob(criterion, context.params.HostName);
			case "originalhost": return glob(criterion, context.params.OriginalHost);
			case "user": return glob(criterion, context.params.User);
			case "localuser": return glob(criterion, context.params.LocalUser);
		}
	};
	for (const key in criteria) {
		const criterion = criteria[key];
		if (!testCriterion(key, Array.isArray(criterion) ? criterion.map(({ val }) => val) : criterion)) return false;
	}
	return true;
}
/**
* Represents parsed SSH config. Main element of this library.
*
* A parsed SSH config is modelled as an array of {@link Line}s.
*/
var SSHConfig = class SSHConfig extends Array {
	/** shortcut to access {@link LineType.DIRECTIVE} */
	static DIRECTIVE = LineType.DIRECTIVE;
	/** shortcut to access {@link LineType.COMMENT} */
	static COMMENT = LineType.COMMENT;
	/** shortcut to access {@link LineType.EMPTY} */
	static EMPTY = LineType.EMPTY;
	/**
	* Parse SSH config text into structured object.
	*/
	static parse(text) {
		return parse(text);
	}
	/**
	* Stringify structured object into SSH config text.
	*/
	static stringify(config) {
		return stringify(config);
	}
	compute(opts, computeOpts) {
		if (typeof opts === "string") opts = { Host: opts };
		let userInfo;
		try {
			userInfo = os.userInfo();
		} catch {
			userInfo = { username: process.env.USER || process.env.USERNAME || "" };
		}
		const context = {
			params: {
				Host: opts.Host,
				HostName: opts.Host,
				OriginalHost: opts.Host,
				User: userInfo.username,
				LocalUser: userInfo.username
			},
			inFinalPass: false,
			doFinalPass: false
		};
		const obj = {};
		const setProperty = (name, value) => {
			const key = computeOpts?.ignoreCase ? name.toLowerCase() : name;
			let val;
			if (Array.isArray(value)) if (/ProxyCommand/i.test(key)) val = value.map(({ val, separator, quoted }) => {
				return `${separator}${quoted ? `"${val.replace(/"/g, "\\\"")}"` : val}`;
			}).join("").trim();
			else val = value.map(({ val }) => val);
			else val = value;
			const val0 = Array.isArray(val) ? val[0] : val;
			if (REPEATABLE_DIRECTIVES.some((d) => d.toLowerCase() === name.toLowerCase())) (obj[key] || (obj[key] = [])).push(...[].concat(val));
			else if (obj[key] == null) {
				if (name === "HostName") context.params.HostName = val0;
				else if (name === "User") context.params.User = val0;
				obj[key] = val;
			}
		};
		if (opts.User !== void 0) setProperty("User", opts.User);
		const doPass = () => {
			for (const line of this) {
				if (line.type !== LineType.DIRECTIVE) continue;
				if (/^host$/i.test(line.param) && glob(Array.isArray(line.value) ? line.value.map(({ val }) => val) : line.value, context.params.Host)) {
					let canonicalizeHostName = false;
					let canonicalDomains = [];
					setProperty(line.param, line.value);
					for (const subline of line.config) if (subline.type === LineType.DIRECTIVE) {
						setProperty(subline.param, subline.value);
						if (/^CanonicalizeHostName$/i.test(subline.param) && subline.value === "yes") canonicalizeHostName = true;
						if (/^CanonicalDomains$/i.test(subline.param) && Array.isArray(subline.value)) canonicalDomains = subline.value.map(({ val }) => val);
					}
					if (canonicalDomains.length > 0 && canonicalizeHostName && context.params.Host === context.params.OriginalHost) for (const domain of canonicalDomains) {
						const host = `${context.params.OriginalHost}.${domain}`;
						const { status, stderr } = spawnSync("nslookup", [host]);
						if (status === 0 && !/can't find/.test(stderr.toString())) {
							context.params.Host = host;
							setProperty("Host", host);
							doPass();
							break;
						}
					}
				} else if (/^match$/i.test(line.param) && "criteria" in line && match(line.criteria, context)) {
					for (const subline of line.config) if (subline.type === LineType.DIRECTIVE) setProperty(subline.param, subline.value);
				} else if (!/^(host|match)$/i.test(line.param)) setProperty(line.param, line.value);
			}
		};
		doPass();
		if (context.doFinalPass) {
			context.inFinalPass = true;
			context.params.Host = context.params.HostName;
			doPass();
		}
		return obj;
	}
	find(opts) {
		if (typeof opts === "function") return super.find(opts);
		if (!(opts && ("Host" in opts || "Match" in opts))) throw new Error("Can only find by Host or Match");
		return super.find((line) => "param" in line && compare(line, opts));
	}
	remove(opts) {
		let index;
		if (typeof opts === "function") index = super.findIndex(opts);
		else if (!(opts && ("Host" in opts || "Match" in opts))) throw new Error("Can only remove by Host or Match");
		else index = super.findIndex((line) => "param" in line && compare(line, opts));
		if (index >= 0) return this.splice(index, 1);
	}
	/**
	* Convert this SSH config to its textual presentation via {@link stringify}.
	*/
	toString() {
		return stringify(this);
	}
	/**
	* Append new section to existing SSH config.
	*/
	append(opts) {
		const indent = getIndent(this);
		const lastEntry = this.length > 0 ? this[this.length - 1] : null;
		let config = lastEntry && lastEntry.config || this;
		let configWas = this;
		let lastLine = config.length > 0 ? config[config.length - 1] : lastEntry;
		if (lastLine && !lastLine.after) lastLine.after = "\n";
		let sectionLineFound = config !== configWas;
		for (const param in opts) {
			const value = opts[param];
			const line = {
				type: LineType.DIRECTIVE,
				param,
				separator: " ",
				value: Array.isArray(value) ? value.map((val, i) => ({
					val,
					separator: i === 0 ? "" : " "
				})) : value,
				before: sectionLineFound ? indent : indent.replace(/  |\t/, ""),
				after: "\n"
			};
			if (RE_SECTION_DIRECTIVE.test(param)) {
				sectionLineFound = true;
				line.before = indent.replace(/  |\t/, "");
				config = configWas;
				if (lastLine && lastLine.after === "\n") lastLine.after += "\n";
				config.push(line);
				config = line.config = new SSHConfig();
			} else config.push(line);
			lastLine = line;
		}
		return configWas;
	}
	/**
	* Prepend new section to existing SSH config.
	*/
	prepend(opts, beforeFirstSection = false) {
		const indent = getIndent(this);
		let config = this;
		let i = 0;
		if (beforeFirstSection) {
			while (i < this.length && !("config" in this[i])) i += 1;
			if (i >= this.length) return this.append(opts);
		}
		let sectionLineFound = false;
		let processedLines = 0;
		for (const param in opts) {
			processedLines += 1;
			const value = opts[param];
			const line = {
				type: LineType.DIRECTIVE,
				param,
				separator: " ",
				value: Array.isArray(value) ? value.map((val, i) => ({
					val,
					separator: i === 0 ? "" : " "
				})) : value,
				before: "",
				after: "\n"
			};
			if (RE_SECTION_DIRECTIVE.test(param)) {
				line.before = indent.replace(/  |\t/, "");
				config.splice(i, 0, line);
				config = line.config = new SSHConfig();
				sectionLineFound = true;
				continue;
			}
			if (processedLines === Object.keys(opts).length) line.after += "\n";
			if (!sectionLineFound) {
				config.splice(i, 0, line);
				i += 1;
				if (RE_SINGLE_LINE_DIRECTIVE.test(param)) line.after += "\n";
				continue;
			}
			line.before = indent;
			config.push(line);
		}
		return config;
	}
};
/**
* Parse SSH config text into structured object.
*/
function parse(text) {
	const input = typeof text === "string" ? text : text.toString("utf-8");
	let i = 0;
	let chr = next();
	let config = new SSHConfig();
	let configWas = config;
	function next() {
		return input[i++];
	}
	function space() {
		let spaces = "";
		while (RE_SPACE.test(chr)) {
			spaces += chr;
			chr = next();
		}
		return spaces;
	}
	function linebreak() {
		let breaks = "";
		while (RE_LINE_BREAK.test(chr)) {
			breaks += chr;
			chr = next();
		}
		return breaks;
	}
	function parameter() {
		let param = "";
		while (chr && /[^ \t=]/.test(chr)) {
			param += chr;
			chr = next();
		}
		return param;
	}
	function separator() {
		let sep = space();
		if (chr === "=") {
			sep += chr;
			chr = next();
		}
		return sep + space();
	}
	function value() {
		let val = "";
		let quoted = false;
		let escaped = false;
		while (chr && !RE_LINE_BREAK.test(chr)) {
			if (escaped) {
				val += chr === "\"" ? chr : `\\${chr}`;
				escaped = false;
			} else if (chr === "\"" && (!val || quoted)) quoted = !quoted;
			else if (chr === "\\") escaped = true;
			else if (chr === "#" && !quoted) break;
			else val += chr;
			chr = next();
		}
		if (quoted || escaped) throw new Error(`Unexpected line break at ${val}`);
		return val.trim();
	}
	function comment() {
		const type = LineType.COMMENT;
		let content = "";
		while (chr && !RE_LINE_BREAK.test(chr)) {
			content += chr;
			chr = next();
		}
		return {
			type,
			content,
			before: "",
			after: ""
		};
	}
	function values() {
		const results = [];
		let val = "";
		let valQuoted = false;
		let valSeparator = " ";
		let quoted = false;
		let escaped = false;
		while (chr && !RE_LINE_BREAK.test(chr)) {
			if (escaped) {
				val += chr === "\"" ? chr : `\\${chr}`;
				escaped = false;
			} else if (chr === "\"") quoted = !quoted;
			else if (chr === "\\") escaped = true;
			else if (quoted) {
				val += chr;
				valQuoted = true;
			} else if (/[ \t=]/.test(chr)) {
				if (val) {
					results.push({
						val,
						separator: valSeparator,
						quoted: valQuoted
					});
					val = "";
					valQuoted = false;
					valSeparator = chr;
				}
			} else if (chr === "#" && results.length > 0) break;
			else val += chr;
			chr = next();
		}
		if (quoted || escaped) throw new Error(`Unexpected line break at ${results.map(({ val }) => val).concat(val).join(" ")}`);
		if (val) results.push({
			val,
			separator: valSeparator,
			quoted: valQuoted
		});
		return results.length > 1 ? results : results[0].val;
	}
	function directive() {
		const type = LineType.DIRECTIVE;
		const param = parameter();
		const multiple = RE_MULTI_VALUE_DIRECTIVE.test(param);
		const result = {
			type,
			param,
			separator: separator(),
			quoted: !multiple && chr === "\"",
			value: multiple ? values() : value(),
			before: "",
			after: ""
		};
		if (!result.quoted) delete result.quoted;
		if (/^Match$/i.test(param)) {
			const criteria = {};
			if (typeof result.value === "string") result.value = [{
				val: result.value,
				separator: "",
				quoted: result.quoted
			}];
			let i = 0;
			while (i < result.value.length) {
				const { val: keyword } = result.value[i];
				switch (keyword.toLowerCase()) {
					case "all":
					case "canonical":
					case "final":
						criteria[keyword] = [];
						i += 1;
						break;
					default:
						if (i + 1 >= result.value.length) throw new Error(`Missing value for match criteria ${keyword}`);
						criteria[keyword] = result.value[i + 1].val;
						i += 2;
						break;
				}
			}
			result.criteria = criteria;
		}
		return result;
	}
	function line() {
		const before = space();
		const node = chr === "#" ? comment() : directive();
		const after = linebreak();
		node.before = before;
		node.after = after;
		return node;
	}
	while (chr) {
		let node = line();
		if (node.type === LineType.DIRECTIVE && RE_SECTION_DIRECTIVE.test(node.param)) {
			config = configWas;
			config.push(node);
			config = node.config = new SSHConfig();
		} else if (node.type === LineType.DIRECTIVE && !node.param) if (config.length === 0) if (configWas.length === 0) configWas.push({
			type: LineType.EMPTY,
			before: "",
			after: node.before
		});
		else configWas[configWas.length - 1].after += node.before;
		else config[config.length - 1].after += node.before;
		else config.push(node);
	}
	return configWas;
}
/**
* Stringify structured object into SSH config text.
*/
function stringify(config) {
	let str = "";
	function formatValue(value, quoted) {
		if (Array.isArray(value)) {
			let result = "";
			for (const { val, separator, quoted } of value) result += (result ? separator : "") + formatValue(val, quoted || RE_SPACE.test(val));
			return result;
		}
		return quoted ? `"${value}"` : value;
	}
	function formatDirective(line) {
		const quoted = line.quoted || RE_QUOTE_DIRECTIVE.test(line.param) && typeof line.value === "string" && RE_SPACE.test(line.value);
		const value = formatValue(line.value, quoted);
		return `${line.param}${line.separator}${value}`;
	}
	const format = (line) => {
		str += line.before;
		if (line.type === LineType.COMMENT) str += line.content;
		else if (line.type === LineType.DIRECTIVE && REPEATABLE_DIRECTIVES.includes(line.param)) (Array.isArray(line.value) ? line.value : [line.value]).forEach((value, i, values) => {
			str += formatDirective({
				...line,
				value: typeof value !== "string" ? value.val : value
			});
			if (i < values.length - 1) str += `\n${line.before}`;
		});
		else if (line.type === LineType.DIRECTIVE) str += formatDirective(line);
		str += line.after;
		if ("config" in line) line.config.forEach(format);
	};
	config.forEach(format);
	return str;
}
//#endregion
//#region electron/main.ts
var currentTunnelPort = null;
var _dirname = dirname(fileURLToPath(import.meta.url));
var username = userInfo().username;
async function getSSHConfigForHost(hostAlias) {
	const configPath = join(homedir(), ".ssh", "config");
	try {
		await access(configPath, constants.R_OK);
		const content = await readFile(configPath, "utf8");
		const resolved = SSHConfig.parse(content).compute(hostAlias);
		return {
			host: resolved.HostName || hostAlias,
			user: resolved.User || username,
			port: parseInt(resolved.Port || "22"),
			identityFile: Array.isArray(resolved.IdentityFile) ? resolved.IdentityFile[0] : resolved.IdentityFile
		};
	} catch {
		return {
			host: hostAlias,
			user: username,
			port: 22
		};
	}
}
var mainWindow = null;
var backendProcess = null;
var sshClient = null;
var tunnelServer = null;
var API_PORT = process.env.ZX_PORT || "8000";
var API_TOKEN = randomBytes(32).toString("hex");
ipcMain.handle("get-api-config", () => {
	return {
		port: currentTunnelPort || API_PORT,
		token: API_TOKEN
	};
});
ipcMain.handle("spawn-local-backend", async (event) => {
	try {
		currentTunnelPort = null;
		spawnBackend();
		let attempts = 0;
		let success = false;
		while (attempts < 10) {
			try {
				if ((await fetch(`http://127.0.0.1:${API_PORT}/health`, { headers: { Authorization: `Bearer ${API_TOKEN}` } })).ok) {
					success = true;
					break;
				}
			} catch {}
			attempts++;
			await new Promise((res) => setTimeout(res, 500));
		}
		if (!success) return {
			success: false,
			error: "Backend failed to start or health check timed out"
		};
		return { success: true };
	} catch (e) {
		return {
			success: false,
			error: e.message
		};
	}
});
ipcMain.handle("get-ssh-hosts", async () => {
	try {
		const configPath = join(homedir(), ".ssh", "config");
		try {
			await access(configPath, constants.R_OK);
		} catch {
			return [];
		}
		const content = await readFile(configPath, "utf8");
		return SSHConfig.parse(content).filter((line) => line.type === SSHConfig.DIRECTIVE && line.param === "Host").map((line) => line.value).filter((host) => host !== "*" && !host.includes("?"));
	} catch (e) {
		console.error("Error reading SSH config:", e);
		return [];
	}
});
function spawnBackend() {
	const backendDir = join(_dirname, "..", "backend");
	const uvPath = join(homedir(), ".local/bin/uv");
	console.log("Spawning local backend...");
	backendProcess = spawn(uvPath, [
		"run",
		"zx-backend",
		"--port",
		API_PORT
	], {
		cwd: backendDir,
		env: {
			...process.env,
			ZX_API_TOKEN: API_TOKEN,
			ZX_PORT: API_PORT,
			PYTHONUNBUFFERED: "1"
		}
	});
	backendProcess.stdout?.on("data", (data) => console.log(`[Backend]: ${data}`));
	backendProcess.stderr?.on("data", (data) => {
		const msg = data.toString();
		console.error(`[Backend Error]: ${msg}`);
		if (msg.includes("address already in use")) mainWindow?.webContents.send("connection-progress", {
			step: 1,
			status: "error",
			sub: `Port ${API_PORT} in use. Kill existing process or use ZX_PORT.`
		});
	});
	backendProcess.on("close", (code) => {
		console.log(`Backend process exited with code ${code}`);
		if (code !== 0 && code !== null) mainWindow?.webContents.send("connection-progress", {
			step: 0,
			status: "error",
			sub: `Backend exited with code ${code}`
		});
	});
}
ipcMain.handle("connect-ssh", async (event, { host: hostAlias, tunnelPort, user, password, identityFile }) => {
	if (sshClient) sshClient.end();
	if (tunnelServer) tunnelServer.close();
	currentTunnelPort = tunnelPort;
	const config = await getSSHConfigForHost(hostAlias);
	sshClient = new Client();
	const sshUser = user || config.user;
	const sshIdentityFile = identityFile || config.identityFile;
	let privateKey;
	if (sshIdentityFile && !password) try {
		privateKey = await readFile(sshIdentityFile.startsWith("~/") ? join(homedir(), sshIdentityFile.slice(2)) : sshIdentityFile);
	} catch (e) {
		console.warn("Could not read identity file:", e);
	}
	event.sender.send("connection-progress", {
		step: 1,
		status: "active",
		sub: "connecting..."
	});
	return new Promise((resolve, reject) => {
		sshClient.on("ready", () => {
			console.log(`SSH Client Ready: ${sshUser}@${config.host}`);
			event.sender.send("connection-progress", {
				step: 1,
				status: "done",
				sub: "connected"
			});
			setupRemoteEnvironment(sshClient, tunnelPort, event.sender).then(() => resolve({ success: true })).catch((err) => reject(err));
		}).on("error", (err) => {
			console.error("SSH Connection Error:", err);
			event.sender.send("connection-progress", {
				step: 1,
				status: "error",
				sub: err.message
			});
			reject(err);
		}).connect({
			host: config.host,
			port: config.port,
			username: sshUser,
			password: password || void 0,
			privateKey: privateKey || void 0,
			agent: !password && !privateKey ? process.env.SSH_AUTH_SOCK : void 0
		});
	});
});
async function setupRemoteEnvironment(conn, localPort, webContents) {
	const sendProgress = (step, status, sub) => {
		webContents.send("connection-progress", {
			step,
			status,
			sub
		});
	};
	try {
		sendProgress(2, "active", "installing uv...");
		await executeRemote(conn, "curl -LsSf https://astral.sh/uv/install.sh | sh");
		sendProgress(2, "done", "uv installed");
		await executeRemote(conn, "mkdir -p ~/.zx/backend");
		sendProgress(3, "active", "deploying backend wheel...");
		await uploadFile(conn, join(_dirname, "..", "backend", "dist", "zx_backend-0.1.0-py3-none-any.whl"), ".zx/backend/zx_backend-0.1.0-py3-none-any.whl");
		sendProgress(3, "done", "backend deployed");
		sendProgress(4, "active", "setting up python venv...");
		await executeRemote(conn, "~/.local/bin/uv venv ~/.zx/python --clear");
		await executeRemote(conn, "export PATH=\"$HOME/.local/bin:$PATH\" && ~/.local/bin/uv pip install ~/.zx/backend/zx_backend-0.1.0-py3-none-any.whl --python ~/.zx/python/bin/python");
		sendProgress(4, "done", "venv ready");
		await executeRemote(conn, "pkill -f 'zx.main' || true");
		sendProgress(5, "active", "starting remote server...");
		const remoteCmd = `
    export ZX_API_TOKEN=${API_TOKEN} && \
    export ZX_PORT=8000 && \
    ~/.zx/python/bin/python -m zx.main
    `;
		conn.exec(remoteCmd, (err, stream) => {
			if (err) console.error("Error starting remote backend:", err);
			stream.on("data", (data) => console.log(`[Remote Backend]: ${data}`));
			stream.stderr.on("data", (data) => console.error(`[Remote Backend Error]: ${data}`));
		});
		sendProgress(6, "active", `tunneling localhost:${localPort} ↔ 8000`);
		tunnelServer = net.createServer((sock) => {
			conn.forwardOut(sock.remoteAddress, sock.remotePort, "127.0.0.1", 8e3, (err, stream) => {
				if (err) return sock.end();
				sock.pipe(stream).pipe(sock);
			});
		}).listen(localPort, "127.0.0.1");
		sendProgress(6, "done", "tunnel established");
		let attempts = 0;
		let success = false;
		await new Promise((res) => setTimeout(res, 500));
		while (attempts < 10) {
			try {
				if ((await fetch(`http://127.0.0.1:${localPort}/health`, { headers: { Authorization: `Bearer ${API_TOKEN}` } })).ok) {
					success = true;
					break;
				}
			} catch {}
			attempts++;
			await new Promise((res) => setTimeout(res, 500));
		}
		if (success) {
			console.log("✅ Backend ready");
			sendProgress(5, "done", "remote backend ready");
		} else {
			console.warn("⚠️ Backend may not be ready yet");
			sendProgress(5, "error", "backend not reachable");
		}
	} catch (err) {
		sendProgress(0, "error", err.message);
		throw err;
	}
}
function executeRemote(conn, cmd) {
	return new Promise((resolve, reject) => {
		conn.exec(cmd, (err, stream) => {
			if (err) return reject(err);
			stream.on("close", () => resolve()).on("data", (data) => console.log(`[SSH STDOUT]: ${data}`)).stderr.on("data", (data) => console.error(`[SSH STDERR]: ${data}`));
		});
	});
}
function uploadFile(conn, localPath, remotePath) {
	return new Promise((resolve, reject) => {
		conn.sftp((err, sftp) => {
			if (err) return reject(err);
			sftp.fastPut(localPath, remotePath, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	});
}
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: join(_dirname, "preload.cjs"),
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
	if (backendProcess) backendProcess.kill();
	if (sshClient) sshClient.end();
	if (tunnelServer) tunnelServer.close();
	if (process.platform !== "darwin") app.quit();
});
app.on("quit", () => {
	if (backendProcess) backendProcess.kill();
	if (sshClient) sshClient.end();
	if (tunnelServer) tunnelServer.close();
});
app.disableHardwareAcceleration();
app.whenReady().then(() => {
	createWindow();
});
//#endregion
