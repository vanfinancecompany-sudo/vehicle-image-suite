import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const children = [];
let shuttingDown = false;

function start(command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows && command.endsWith(".cmd"),
  });

  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code) {
      process.exit(code);
    }
  });
}

function stop() {
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

start(process.execPath, ["server/server.js"]);
start(isWindows ? "npm.cmd" : "npm", ["exec", "vite"]);

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
