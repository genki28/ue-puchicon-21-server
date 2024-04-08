import WebSocket from 'ws';
import fs from 'fs';
import https from 'https';

const WSS_PORT = 8000;
const serverOptions = {
  key: fs.readFileSync('localhost+2-key.pem'),
  cert: fs.readFileSync('localhost+2.pem'),
};
const server = https.createServer(serverOptions);
const wss = new WebSocket.Server({ server });
const ueWs = new WebSocket.Server({ port: 8001 });

interface Client {
  id: number;
  ws: WebSocket;
}
const webFrontClientList = new Map<number, Client>();
const ueClientList = new Map<number, Client>();

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const parsedMessage = JSON.parse(message.toString());

    switch (parsedMessage.type) {
      case 'register':
        // webFrontは、clientTypeのみを送信。UEは、スマホに表示された4桁のパスワードを送信
        const { pass } = parsedMessage;
        const client = ueClientList.get(Number(pass));
        webFrontClientList.set(Number(pass), { id: Number(pass), ws });
        if (client) {
          client.ws.send(JSON.stringify({ type: 'webConnected' }));
        }
        break;
      case 'count':
        const { id, count } = parsedMessage;
        const client2 = ueClientList.get(Number(id));
        if (client2) {
          client2.ws.send(JSON.stringify({ type: 'count', count }));
        }
        break;
    }
  });

  ws.on('error', (e) => {
    console.error(e);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const sendGameStartMessage = (id: number) => {
  const client = webFrontClientList.get(id);
  if (client) {
    client.ws.send(JSON.stringify({ type: 'startGame' }));
  }
};

const sendFinishGameMessage = (id: number) => {
  const client = webFrontClientList.get(id);
  console.log('sendFinishGameMessage', id, client);
  if (client) {
    client.ws.send(JSON.stringify({ type: 'finishGame' }));
  }
};

server.listen(WSS_PORT, () => {
  console.log('web socket server started on port 8000');
});

ueWs.on('connection', (ws) => {
  ws.onmessage = (message) => {
    const parsedMessage = JSON.parse(message.data.toString());
    switch (parsedMessage.type) {
      case 'register':
        // 4桁のパスワードを生成
        const pass = Math.floor((1 - Math.random()) * 10000);
        ueClientList.set(pass, { id: pass, ws });
        ws.send(JSON.stringify({ type: 'registered', id: pass }));
        break;
      case 'startGame':
        const id = parsedMessage.id;
        console.log('startGame', id);
        sendGameStartMessage(Number(id));
        break;
      case 'finishGame':
        const id2 = parsedMessage.id;
        console.log('finishGame', id2);
        sendFinishGameMessage(Number(id2));
        break;
    }
  };
});
