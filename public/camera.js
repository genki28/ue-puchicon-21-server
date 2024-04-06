const video = document.getElementById('video')
const ws = new WebSocket('ws:///localhost:8000')

ws.onopen = function () {
  console.log('connected')
}

ws.onmessage = function (event) {
  const results = document.getElementById('results')
  const poses = JSON.parse(event.data)

  results.innerHTML = ''

  poses.forEach((pose, index) => {
    const poseElement = document.createElement('div')
    poseElement.textContent = `Pose ${index + 1}: ${JSON.stringify(pose)}`;
    results.appendChild(poseElement);
  })
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
