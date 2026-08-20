"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const node = process.execPath;

function run(args, input) {
  const result = spawnSync(node, args, {
    cwd: root,
    input,
    encoding: "utf8",
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function listJs(dir) {
  const current = path.join(root, dir);
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJs(relative));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(relative);
    }
  }
  return files;
}

run(["--check", "server.js"]);
for (const file of listJs("server")) {
  run(["--check", file]);
}
for (const file of listJs("public/js")) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  run(["--check", "--input-type=module"], source);
}
