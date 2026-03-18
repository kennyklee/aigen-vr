// Combined HTTP static server + WebSocket proxy
// Usage: node ws-proxy.mjs
// Serves static files and proxies /ws/{robot-host}/{port} → ws://{robot-host}:{port}

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const PORT = 8090;
const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.mp3':  'audio/mpeg',
  '.glb':  'model/gltf-binary',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    let filePath = join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error');
  }
});

const wss = new WebSocketServer({ noServer: true });

// Only accept WebSocket upgrades on /ws/... paths
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws/')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    wss.emit('connection', client, req);
  });
});

wss.on('connection', (client, req) => {
  const match = req.url.match(/^\/ws\/([^/]+)\/(\d+)$/);
  if (!match) {
    console.error(`Bad path: ${req.url}`);
    client.close(4000, 'Bad path. Use /ws/{host}/{port}');
    return;
  }

  const [, host, port] = match;
  const target = `ws://${host}:${port}`;
  console.log(`Proxying ${req.url} → ${target}`);

  const remote = new WebSocket(target);
  remote.binaryType = 'arraybuffer';

  remote.on('open', () => {
    console.log(`  Connected to ${target}`);
  });

  remote.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  remote.on('close', () => {
    client.close();
  });

  remote.on('error', (err) => {
    console.error(`  Remote error (${target}):`, err.message);
    client.close(4001, 'Remote connection failed');
  });

  client.on('close', () => {
    remote.close();
  });

  client.on('error', (err) => {
    console.error(`  Client error:`, err.message);
    remote.close();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Static files: http://localhost:${PORT}/`);
  console.log(`WS proxy: ws://localhost:${PORT}/ws/{host}/{port} → ws://{host}:{port}`);
});
