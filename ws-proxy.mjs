// WebSocket proxy: accepts wss:// connections locally and forwards to ws:// on robots
// Usage: node ws-proxy.mjs
// Proxies wss://localhost:9000/ws/{robot-host}/{port} → ws://{robot-host}:{port}

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 9100;

const server = createServer((req, res) => {
  res.writeHead(200);
  res.end('ws-proxy running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (client, req) => {
  // Parse path: /ws/{host}/{port}
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
  console.log(`WebSocket proxy listening on port ${PORT}`);
  console.log(`Route: wss://localhost:${PORT}/ws/{host}/{port} → ws://{host}:{port}`);
});
