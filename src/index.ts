import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import * as tf from '@tensorflow/tfjs-node';
import * as poseDetection from '@tensorflow-models/pose-detection';
import fs from 'fs';
import path from 'path';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

let referencePoses: {
  [key: string]: poseDetection.Pose[];
} = {
  leftHandUp: [],
  rightHandUp: [],
};

async function loadAndDetectPoseFromImage(imagePath: string) {
  const image = fs.readFileSync(imagePath);
  const tensor = tf.node.decodeImage(image, 3);
  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
  );
  const poses = await detector.estimatePoses(tensor);
  tf.dispose(tensor);
  return poses;
}

let isReferencePosesLoaded = false;

async function initReferencePoses() {
  const leftHandImage = path.join(__dirname, 'poseImage', 'leftHandUp.png');
  const rightHandImage = path.join(__dirname, 'poseImage', 'rightHandUp.png');
  try {
    referencePoses.leftHandUp = await loadAndDetectPoseFromImage(leftHandImage);
    referencePoses.rightHandUp = await loadAndDetectPoseFromImage(
      rightHandImage,
    );
    isReferencePosesLoaded = true;
  } catch (e) {
    console.error('Error loading reference poses: ', e);
  }
}

let detector: poseDetection.PoseDetector;
async function initPoseDetector() {
  const model = poseDetection.SupportedModels.MoveNet;
  detector = await poseDetection.createDetector(model, {
    modelType: 'SinglePose.Lightning',
  });
}

async function detectPose(imageBuffer: Buffer) {
  const tensor = tf.node.decodeImage(imageBuffer, 3);
  const poses = await detector.estimatePoses(tensor);
  tf.dispose(tensor);
  return poses;
}

function calculatePoseSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  let normVec1 = 0;
  let normVec2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normVec1 += vec1[i] * vec1[i];
    normVec2 += vec2[i] * vec2[i];
  }
  normVec1 = Math.sqrt(normVec1);
  normVec2 = Math.sqrt(normVec2);
  const similarity = dotProduct / (normVec1 * normVec2);
  return isNaN(similarity) ? 0 : similarity; // NaNチェック
}

const SCORE_THRESHOLD = 0.5;

function extractFeaturesFromKeypoints(keypoints: poseDetection.Keypoint[]) {
  let features = [];

  const rightWrist = keypoints.find((kp) => kp.name === 'right_wrist');
  const rightElbow = keypoints.find((kp) => kp.name === 'right_elbow');
  const rightShoulder = keypoints.find((kp) => kp.name === 'right_shoulder');
  if (
    rightWrist &&
    rightElbow &&
    rightShoulder &&
    (rightWrist.score ?? 0) > SCORE_THRESHOLD &&
    (rightElbow.score ?? 0) > SCORE_THRESHOLD &&
    (rightShoulder.score ?? 0) > SCORE_THRESHOLD
  ) {
    const shoulderToElbowRight = Math.sqrt(
      Math.pow(rightShoulder.x - rightElbow.x, 2) +
        Math.pow(rightShoulder.y - rightElbow.y, 2),
    );
    const elbowToWristRight = Math.sqrt(
      Math.pow(rightElbow.x - rightWrist.x, 2) +
        Math.pow(rightElbow.y - rightWrist.y, 2),
    );
    features.push(shoulderToElbowRight, elbowToWristRight);
  }

  const leftWrist = keypoints.find((kp) => kp.name === 'left_wrist');
  const leftElbow = keypoints.find((kp) => kp.name === 'left_elbow');
  const leftShoulder = keypoints.find((kp) => kp.name === 'left_shoulder');
  if (
    leftWrist &&
    leftElbow &&
    leftShoulder &&
    (leftWrist.score ?? 0) > SCORE_THRESHOLD &&
    (leftElbow.score ?? 0) > SCORE_THRESHOLD &&
    (leftShoulder.score ?? 0) > SCORE_THRESHOLD
  ) {
    const shoulderToElbowLeft = Math.sqrt(
      Math.pow(leftShoulder.x - leftElbow.x, 2) +
        Math.pow(leftShoulder.y - leftElbow.y, 2),
    );
    const elbowToWristLeft = Math.sqrt(
      Math.pow(leftElbow.x - leftWrist.x, 2) +
        Math.pow(leftElbow.y - leftWrist.y, 2),
    );
    features.push(shoulderToElbowLeft, elbowToWristLeft);
  }

  // featuresが空の場合、類似度計算に影響するので、適切に処理を行う必要がある
  return features.length > 0 ? features : null;
}

function comparePoses(
  pose1: poseDetection.Pose,
  pose2: poseDetection.Pose,
): number {
  // 必要なキーポイントがすべて存在するか確認
  const requiredKeypoints = [
    'right_wrist',
    'right_elbow',
    'right_shoulder',
    'left_wrist',
    'left_elbow',
    'left_shoulder',
  ];
  const pose1HasAllKeypoints = requiredKeypoints.every((keypoint) =>
    pose1.keypoints.some((kp) => kp.name === keypoint),
  );
  const pose2HasAllKeypoints = requiredKeypoints.every((keypoint) =>
    pose2.keypoints.some((kp) => kp.name === keypoint),
  );

  // 両方のポーズに必要なキーポイントがすべて存在する場合のみ類似度を計算
  if (pose1HasAllKeypoints && pose2HasAllKeypoints) {
    const features1 = extractFeaturesFromKeypoints(pose1.keypoints);
    const features2 = extractFeaturesFromKeypoints(pose2.keypoints);
    if (!features1 || !features2) {
      return 0;
    }
    return calculatePoseSimilarity(features1, features2);
  } else {
    // 必要なキーポイントが欠けている場合は類似度として0を返す
    return 0;
  }
}

initPoseDetector();

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    if (!isReferencePosesLoaded) {
      ws.send(JSON.stringify({ isLeftHandUp: false, isRightHandUp: false }));
      return;
    }
    try {
      if (!(message instanceof Buffer)) {
        throw new Error('Expected message to be a Buffer');
      }
      const detectedPose = await detectPose(message);
      const similarityToLeft = comparePoses(
        detectedPose[0],
        referencePoses.leftHandUp[0],
      );
      const similarityToRight = comparePoses(
        detectedPose[0],
        referencePoses.rightHandUp[0],
      );
      console.log(
        'right',
        detectedPose[0].keypoints.find((kp) => kp.name === 'right_wrist'),
      );
      // console.log(similarityToLeft, 'similarityToLeft');

      const threshold = 0.96;
      const isLeftHandUp = similarityToLeft > threshold;
      const isRightHandUp = similarityToRight > threshold;

      ws.send(JSON.stringify({ isLeftHandUp, isRightHandUp }));
    } catch (e) {
      console.error('Error processing image: ', e);
    }
  });
});

const port = 8000;
server.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
  initReferencePoses().then(() => {
    console.log('reference poses loaded');
  });
});
