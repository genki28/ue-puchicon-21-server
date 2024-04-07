const video = document.getElementById('video')
const ws = new WebSocket('ws:///localhost:8000')

ws.onopen = function () {
  console.log('connected')
}

let rightHandCount = 0;
let leftHandCount = 0;

ws.onmessage = function (event) {
  const results = document.getElementById('results');

  // {rightHandExtended: boolean, leftHandExtended: boolean}
  const result = JSON.parse(event.data);

  if (result.isLeftHandUp) rightHandCount++;
  if (result.isRightHandUp) leftHandCount++;


  results.innerHTML = '';

  // 右手の結果を表示
  const rightHandResult = document.createElement('p');
  rightHandResult.textContent = `右手が前に出た回数: ${rightHandCount}`;
  results.appendChild(rightHandResult);

  const leftHandResult = document.createElement('p');
  leftHandResult.textContent = `左手が前に出た回数: ${leftHandCount}`;
  results.appendChild(leftHandResult);
}

ws.onerror = function (error) {
  console.log('error', error)
}

navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(stream => {
  video.srcObject = stream;
  video.play()
})

function sendFrames() {
  video.addEventListener('play', () => {
    const canvas = document.createElement('canvas'); // canvas要素を作成

    (function sendFrame() {
      canvas
        .getContext('2d')
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => ws.send(blob), 'image/jpeg', 0.7);
      requestAnimationFrame(sendFrame);
    })();
  })
}

document.addEventListener('DOMContentLoaded', () => {
  sendFrames()
})
