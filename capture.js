const pattern = "00110011001100110011";
const video = document.getElementById("video");
const button = document.getElementById("btn");
const imgContainer = document.getElementById("img-container");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let stream = null;
let videoTrack = null;
let trackProcessor = null;
let encoder = null;
let decoder = null;
let frameCounter = 0;
let reader = null;

const encoderConfig = {
  codec: "vp8",
  width: 640,
  height: 480,
  bitrate: 1_000_000, // 1 Mbps
  framerate: 2,
};

const toggleScreenColor = (color) => {
  try {
    const body = document.body;
    body.style.backgroundColor =
      color.toLowerCase() === "white" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
  } catch (err) {
    console.log(err);
  }
};

const handleFrame = (frame) => {
  try {
    ctx.drawImage(frame, 0, 0);
    const img = document.createElement("img");
    img.src = canvas.toDataURL();
    imgContainer.appendChild(img);
    frame.close();
  } catch (error) {
    console.log(error);
  }
};

const decoderInit = {
  output: handleFrame,
  error: (err) => {
    console.log(err.message);
  },
};

const encodeFrames = async (encodedVideoChunk, metadata) => {
  try {
    const chunkData = new Uint8Array(encodedVideoChunk.byteLength);
    encodedVideoChunk.copyTo(chunkData);
    const chunk = new EncodedVideoChunk({
      timestamp: encodedVideoChunk.timestamp,
      type: encodedVideoChunk.type,
      data: chunkData,
    });
    const { supported } = await VideoDecoder.isConfigSupported(
      metadata.decoderConfig
    );
    if (!supported) {
      alert("decoder config not supported");
    } else {
      decoder = new VideoDecoder(decoderInit);
      decoder.configure(metadata.decoderConfig);
      decoder.decode(chunk);
      await decoder.flush();
    }
  } catch (error) {
    console.log(error);
  }
};

const encoderInit = {
  output: encodeFrames,
  error: (err) => {
    console.log(err.message);
  },
};

const startRecording = async () => {
  try {
    imgContainer.innerHTML = null;
    button.disabled = true;
    await main();
    button.innerText = "Stop";
    button.disabled = false;
    videoTrack = stream.getVideoTracks()[0];
    trackProcessor = new MediaStreamTrackProcessor(videoTrack);
    reader = trackProcessor.readable.getReader();
    while (frameCounter < 20) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      let frame = result.value;
      if (frame === null) {
        console.log("No frame available");
        continue;
      }
      const { supported } = await VideoEncoder.isConfigSupported(encoderConfig);
      if (supported) {
        encoder = new VideoEncoder(encoderInit);
        encoder.configure(encoderConfig);
        if (encoder.encodeQueueSize > 2) {
          console.log("frame overload");
        } else {
          frameCounter++;
          toggleScreenColor(pattern[frameCounter] === "0" ? "black" : "white");
          await encoder.encode(frame);
          frame.close();
        }
      } else {
        console.log("encoder not supported");
      }
    }
    if (frameCounter == 20) {
      stopRecording();
    }
  } catch (error) {
    console.log(error.message);
  }
};

const stopRecording = () => {
  try {
    videoTrack.stop();
    videoTrack = null;
    stream.getTracks().forEach((track) => track.stop());
    reader.cancel();
    reader = null;
    encoder.close();
    encoder = null;
    decoder.close();
    decoder = null;
    frameCounter = 0;
    button.innerText = "Start";
    toggleScreenColor("white");
  } catch (error) {
    console.log(error);
  }
};

button.onclick = () => {
  switch (button.innerText) {
    case "Start":
      startRecording();
      break;
    case "Stop":
      stopRecording();
      break;
  }
};

const main = async () => {
  let constraints = {
      width: 640,
      height: 480,
      frameRate: { ideal: 2 },
  };
  const devices = await navigator.mediaDevices.enumerateDevices();
  const frontCameras = devices.filter(device => device.kind === 'videoinput' || device.label.includes('front'));
  if (frontCameras.length === 0) {
    console.error('No camera available');
    return;
  }
  const sortedCameras = frontCameras.sort((a, b) => {
    const aResolution = a.getCapabilities().width + a.getCapabilities().height;
    const bResolution = b.getCapabilities().width + b.getCapabilities().height;
    return bResolution - aResolution;
  });
  const bestFrontCamera = sortedCameras[0];
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: bestFrontCamera.deviceId,
      facingMode: 'user',
      ...constraints
    }, 
    audio: false
  });
  video.srcObject = stream;
};
