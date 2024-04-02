import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import tf from '@tensorflow/tfjs-node';
import poseDetection from '@tensorflow-models/pose-detection';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let detector: poseDetection.PoseDetector;
async function initPoseDetector() {
  const model = poseDetection.SupportedModels.MoveNet;
  detector = await poseDetection.createDetector(model, {
    modelType: 'SinglePoseLightning',
  });
}
initPoseDetector();

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const tensor = tf.node.decodeImage(message as Buffer, 3);
      const poses = await detector.estimatePoses(tensor);
      ws.send(JSON.stringify(poses));
      tf.dispose(tensor);
    } catch (e) {
      console.error('Error processing image: ', e);
    }
  });
});

const port = 8000;
server.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});