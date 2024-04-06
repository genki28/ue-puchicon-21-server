import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import * as tf from '@tensorflow/tfjs-node';
import * as poseDetection from '@tensorflow-models/pose-detection';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let detector: poseDetection.PoseDetector;
async function initPoseDetector() {
  const model = poseDetection.SupportedModels.MoveNet;
  detector = await poseDetection.createDetector(model, {
    modelType: 'SinglePose.Lightning',
  });
}
initPoseDetector();

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    console.log('message', message);
    try {
      if (!(message instanceof Buffer)) {
        throw new Error('Expected message to be a Buffer');
      }
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
