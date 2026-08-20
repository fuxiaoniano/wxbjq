"use strict";

const http = require("http");
const { ensureDataStore } = require("./server/storage");
const { handleError, handleRequest } = require("./server/router");
const { loadConfig } = require("./server/config");
const { logError } = require("./server/logging");

function createAppServer(config) {
  return http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, config);
    } catch (error) {
      handleError(res, error);
    }
  });
}

async function startServer(config = loadConfig()) {
  await ensureDataStore(config);
  const server = createAppServer(config);
  server.on("clientError", (error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });
  await new Promise((resolve) => {
    server.listen(config.port, config.host, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`微信编辑器已启动：http://${config.host}:${port}${config.basePath || "/"}`);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    logError("startup", error || "服务器启动失败");
    process.exitCode = 1;
  });
}

module.exports = {
  createAppServer,
  loadConfig,
  startServer,
};
