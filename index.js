/* eslint-disable no-underscore-dangle */

const SpotifyWebApi = require("spotify-web-api-node");
const THREE = require("three"); // Import doesn't work.
const OrbitControls = require("three-orbit-controls")(THREE);
require("three-obj-loader")(THREE);

window.THREE = THREE;
const objLoader = new THREE.OBJLoader();

const khzSecond = 44100; // Represents one second of audio data.

const accessToken = window.location.hash
  .substr(window.location.hash.indexOf("access_token="))
  .split("&")[0]
  .split("=")[1];

const spotify = new SpotifyWebApi({
  clientId:     "b7e6e7cef1c74629ab74d4f89ec088c0",
  redirectUri:  "http://localhost:8080",
  accessToken,
});

const button = document.getElementById("spotify-access");
if (accessToken) {
  button.parentNode.removeChild(button);
} else {
  button.onclick = () => {
    const authorizeURL = "https://accounts.spotify.com/en/authorize?client_id=b7e6e7cef1c74629ab74d4f89ec088c0&response_type=token&redirect_uri=http:%2F%2Flocalhost:8080&scope=&state=";
    window.open(authorizeURL);
  };
}

/**
 * Globals that will be used at various points of the program.
 */
let scene;
let renderer;
let camera;
let controls;
let peaks;
let audioData;
let waveformData;
let totalCycles = 0;

/**
 * Functions to be executed once per frame
 */
const _executionQueue = [];

function _runExecutionQueue() {
  const queue = _executionQueue;

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    current((100 / current._numExecutions) * (current._currentExecution + 1));

    current._currentExecution += 1;
    if (current._numExecutions <= current._currentExecution) {
      console.log("Exceeded max executions");
      queue.splice(i, 1);
      if (current._afterExecution) {
        current._afterExecution();
      }
      i -= 1;
      if (!queue[i]) {
        return;
      }
    }
  }
}

function addToExecutionQueue(numEx, func, afterExFunc) {
  if (typeof func !== "function") {
    throw new Error("Expected a function to be added to the execution queue");
  }

  if (typeof numEx !== "number") {
    throw new Error("Expected the number of executions to be a number");
  }

  func._numExecutions = numEx;
  func._currentExecution = 0;

  if (afterExFunc) {
    func._afterExecution = afterExFunc;
  }

  _executionQueue.push(func);
}

function getValueInbetween(x, y, percentage) {
  return ((x / 100) * (100 - percentage)) + ((y / 100) * percentage);
}


/**
 * === SETTINGS ===
 *
 * An underscore means that the property should not be changed
 * without a setter.
 *
 * If a property
 */

// Common settings
const _antialias     = true; // It's not possible to change AA live, a reload is required.
const _useBackground = true;

/**
 * Notefrequency determines the frequency of peaks.
 * Peaks per second = second / noteFrequency.
 *
 * 1    = 1 peak  per second.
 * 0.5  = 2 peaks per second.
 * 0.25 = 4 peaks per second.
 */
const _noteFrequency = 0.25;
const _percentNotesToKeep = 0.75;

// Note settings
const _minMillisecondBetweenPeaks = 150; // No two notes may be closer than this.

// Camera settings
const _useOrbitControls = false; // Orbit helper
const _defaultCameraCoords = Object.freeze({
  x: 150,
  y: 920,
  z: 610,
});
const _defaultCameraRotation = Object.freeze({
  x: -0.84,
  y:  0.3,
  z:  6.2,
});

// Waveform settings
const _useWaveform = true;
const _waveformDataPointsPerFrame = 2;
const _waveformSpeed = 2;

// Wobble settings
let _useWobble        = true && !_useOrbitControls; // Wobble messes with orbit
let _wobbleRate       = 1;
let _wobbleWeight     = 1;
let _globalWobbleSync = 0;

// Shadow setttings
let   _useShadows = true;
const _shadowMapSize = 512;
const _shadowReceivers = {};

// Fog settings
let _useFog   = true;
let _fogNear  =  900;
let _fogFar   = 3000;

const calcWobble = (axis, syncOff = 0, forceRate) => {
  const rate = forceRate || _wobbleRate;
  return _defaultCameraRotation[axis] +
    ((Math.sin((totalCycles / (10 / rate.toFixed(2))) +
      (Math.PI * (syncOff + _globalWobbleSync))) / 150) * _wobbleWeight /* * volume * 0.1) */);
};

function setWobbleRate(newRate) {
  if (typeof newRate !== "number") {
    throw new Error("Expected wobble rate to be a number.");
  }
  const initialRate = _wobbleRate;
  addToExecutionQueue(
    Math.max((Math.abs(newRate - initialRate) * 60), 1),
    (perc) => {
      _globalWobbleSync += (getValueInbetween(0, newRate - initialRate, perc) / (10 * Math.PI));
      console.log(_globalWobbleSync.toFixed(2));
    },
    () => {
      _wobbleRate = newRate;
    });
}

function setWobbleWeight(newWeight) {
  if (typeof newWeight !== "number") {
    throw new Error("Expected wobble weight to be a number.");
  }
  const initialWeight = _wobbleWeight;
  addToExecutionQueue(100, (percentage) => {
    _wobbleWeight = getValueInbetween(initialWeight, newWeight, percentage);
  });
}

function toggleWobble() {
  _useWobble = !_useWobble;
}

// Demonstration purposes
window.setWobbleWeight  = setWobbleWeight;
window.setWobbleRate    = setWobbleRate;
window.toggleWobble     = toggleWobble;

function toggleShadows() {
  _useShadows = !_useShadows;
  renderer.shadowMap.enabled = _useShadows;

  const keys = Object.keys(_shadowReceivers);
  for (let i = 0; i < keys.length; i += 1) {
    _shadowReceivers[keys[i]].material.needsUpdate = true; // Force a material redraw
  }
}

// Demonstration purposes
window.toggleShadows = toggleShadows;

function toggleFog() {
  _useFog = !_useFog;
  if (_useFog) {
    scene.fog.near  = _fogNear;
    scene.fog.far   = _fogFar;
  } else {
    /**
     * It's impossible to remove fog if it has been added to a scene
     * so we just make it effectively invisible.
     */
    scene.fog.near = 0.1;
    scene.fog.far = 0;
  }
}

function setFogNear(n) {
  if (typeof n !== "number") {
    throw new Error("Expected fogNear to be a number.");
  }
  _fogNear = n;
  scene.fog.near = _fogNear;
}

function setFogFar(n) {
  if (typeof n !== "number") {
    throw new Error("Expected fogNear to be a number.");
  }
  _fogFar = n;
  scene.fog.far = _fogFar;
}

// Demonstration purposes
window.toggleFog  = toggleFog;
window.setFogFar  = setFogFar;
window.setFogNear = setFogNear;

function receiveShadow(mesh) {
  mesh.receiveShadow = true;
  _shadowReceivers[mesh.uuid] = mesh;
}

/* We don't happen to need this function
function removeShadowReceiver(uuid) {
  if (_shadowReceivers[uuid]) {
    delete _shadowReceivers[uuid];
  }
}
*/


/**
 * startPoint is the point on the board on which the arrows start
 * endPoint is the point at which they disappear.
 * range is the distance between the end and start.
 */
const startPoint = -1400;
const endPoint = 500;
const range = Math.abs(startPoint) + endPoint;


const models = {}; // The meshes created from .obj 3D models that we will use.
const fonts = {}; // Font's loaded from .json files to use for 3D text.
const texts = {}; // The actual 3D meshes.


// The directions that the notes will use
const directions = ["LEFT", "UP", "DOWN", "RIGHT"];

// This contains the elements that represent the arrow keys in the UI.
const arrowElMap = {};

{
  // Initializing the arrows
  const arrowContainer = document.getElementById("arrow-container");

  const genArrowId = direction => `arrow-${direction.toLowerCase()}`;

  for (let i = 0; i < directions.length; i += 1) {
    const direction = directions[i];
    const el = document.createElement("div");
    el.classList.add("arrow");
    el.classList.add(genArrowId(direction));
    el.id = genArrowId(direction);
    arrowElMap[direction] = el;
    arrowContainer.appendChild(el);
  }
}

const scoreContainer = document.getElementById("score-container");

let score = 0;
const scoreMultiplier = 1;

function addScore(s) {
  if (typeof s !== "number") {
    throw new Error("Expected score to be a number.");
  }
  score += (s * scoreMultiplier);
  return score;
}

/*
function getScore() {
  return score;
}
*/


function genNoteMesh(index) { // Index being a note index from 0-3.
  const mesh = models.arrow.clone();
  mesh.castShadow = true;

  // left, up, down, right
  const rotationMultipliers = [2, 3, 1, 0];

  mesh.rotation.x = (90 * Math.PI) / 180;
  mesh.rotation.z = ((90 * rotationMultipliers[index]) * Math.PI) / 180;

  /**
   * Spread is the distance between the X coord of the leftmost
   * arrow and the X coords of the rightmost arrow.
   */
  const spread = 300;

  mesh.position.y = 80;
  mesh.position.x = -(spread / 2) + (index * (spread / 3));
  mesh.castShadow = true;

  return mesh;
}

/**
 * hittableNotes acts as a queue, first in first out. This allows
 * us to efficiently check whether a note was hit or not since the
 * first node in the array would be the one the user would hit.
 *
 * Nodes should be removed from the queue when they reach
 * 90 percent completion.
 *
 * Even though notes are not hittable until 70 percent completion,
 * they will still be present from 0 to 90 for simplicity's sake.
 */
const hittableNotes = [];

/**
 * All nodes to be rendered to the user should be in activeNotes.
 * Not all nodes in activeNotes are hittable, but they should
 * still slide off screen.
 */
const activeNotes = [];

/**
 * Functions in the same way as activeNotes, except this is for
 * the waveform mesh groups.
 */
const activeWaveformFrames = [];

const visualOffsetPerc = 5;

// Generates a note and appends it the to the noteContainer.
function startNote(noteArr) {
  const group = new THREE.Group(); // The note mesh container

  // Create a mesh for all of the active notes.
  for (let i = 0; i < noteArr.length; i += 1) {
    if (noteArr[i]) {
      const noteMesh = genNoteMesh(i);
      noteMesh.direction = directions[i];
      group.add(noteMesh);
    }
  }

  scene.add(group);

  const item = {
    uuid: group.uuid,
    group,
    _isHittable: true,
    _percentComplete: 0,
    isHittable() {
      return this._isHittable;
    },
    getPercentComplete() {
      return this._percentComplete;
    },
    remove(i) {
      if (this.isHittable()) {
        this.setUnhittable(); // To make sure it isn't kept in the unhittable array.
      }
      scene.remove(this.group);
      activeNotes.splice(i, 1);
    },
    update(moveHowManyFrames = 1) {
      this._percentComplete += ((60 / 100) * moveHowManyFrames);
      const perc = this._percentComplete;
      this.group.position.z = startPoint + (((perc + visualOffsetPerc) / 100) * range);
      this.group.position.y += Math.sin(perc * 0.1); // Makes the arrow fluctuate

      if (this.isHittable() && perc > (85 - visualOffsetPerc)) {
        this.setUnhittable();
      }
    },
    setUnhittable() {
      hittableNotes.shift();
      this._isHittable = false;
    },
    isHit: false,
    notes: [...noteArr],
    hitNote(which) {
      if (!this.isHittable()) {
        throw new Error("Attempted to hit an unhittable node.");
      }

      const directionIndex = directions.indexOf(which.toUpperCase());
      if (directionIndex < 0) {
        throw new Error("Invalid direction provided");
      }

      if (this.getPercentComplete() < (75 - visualOffsetPerc)) {
        const text = texts.miss.clone();
        text.position.y = 0;
        text.position.x = -500;
        scene.add(text);
        addToExecutionQueue(150,
          () => {
            text.position.y += 10;
          },
          () => scene.remove(text));
        return;
      }

      if (this.notes[directionIndex]) {
        this.notes[directionIndex] = 0;
      } else {
        console.log("WRONG NOTE");

        // Creating the miss text
        const text = texts.miss.clone();
        text.position.y = 0;
        text.position.x = -500;
        scene.add(text);
        addToExecutionQueue(150,
          () => {
            text.position.y += 10;
          },
          () => scene.remove(text));
      }

      // Runs if all notes have been hit
      if (!this.notes.reduce((x, y) => (x || y), 0)) {
        // Creating the hit text
        const text = texts.hit.clone();
        text.position.y = 0;
        text.position.x = -500;
        scene.add(text);
        addToExecutionQueue(150,
          () => {
            text.position.y += 10;
          },
          () => scene.remove(text));
        this.setUnhittable();
        this.isHit = true;
        addScore(50);
        this.group.position.y += 100;
      }
    },
  };
  activeNotes.push(item);
  hittableNotes.push(item);
  return item;
}

function genWaveformFrame(frameVolumeArr, frameOffset = 0) {
  const group = new THREE.Group(); // The note mesh container

  if (frameOffset > 0) {
    console.log(frameOffset);
  }

  const barMaterial = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    specular: 0x666666,
    shininess: 15,
  });

  const waveformRange = range * _waveformSpeed;
  const waveformStart = startPoint * _waveformSpeed;

  const frameWidthY = waveformRange / 60;
  const yPeak = frameWidthY / frameVolumeArr.length; // Width of each datapoint

  for (let i = 0; i < frameVolumeArr.length; i += 1) {
    const xPeak = Math.ceil(500 * frameVolumeArr[i]); // Height of datapoint (volume)

    const barGeometry = new THREE.ShapeGeometry(new THREE.Shape([
      new THREE.Vector2(0,      0), // offset
      new THREE.Vector2(0,      0),
      new THREE.Vector2(xPeak,  0),
      new THREE.Vector2(xPeak,  yPeak),
      new THREE.Vector2(0,      yPeak),
    ]));

    const mesh = new THREE.Mesh(barGeometry, barMaterial);
    mesh.rotation.x -= Math.PI / 4; // So the plane faces the right direction
    mesh.position.z += yPeak * i;
    // mesh.position.x -= (xPeak / 2); // center waveform

    group.add(mesh);
  }

  scene.add(group);
  // group.position.y = 30; // Above the board
  group.position.x = 200;

  return {
    group,
    _percentComplete: frameOffset * (60 / 100),
    getPercentComplete() {
      return this._percentComplete;
    },
    remove(i) {
      scene.remove(this.group);
      activeWaveformFrames.splice(i, 1);
    },
    update(moveHowManyFrames = 1) {
      this._percentComplete += (60 / 100) * moveHowManyFrames;
      this.group.position.z = waveformStart + ((this._percentComplete / 100) * waveformRange);
    },
  };
}

let playing = false;

function createPerspectiveCamera() {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    50,
    10000,
  );

  if (_useOrbitControls) {
    controls = new OrbitControls(camera, renderer.domElement);
    // controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.3;
    controls.rotateSpeed = 2;
  }

  camera.position.x = _defaultCameraCoords.x;
  camera.position.y = _defaultCameraCoords.y;
  camera.position.z = _defaultCameraCoords.z;

  camera.rotation.order = "YXZ";
  camera.rotation.x = _defaultCameraRotation.x;
  camera.rotation.y = _defaultCameraRotation.y;
  camera.rotation.z = _defaultCameraRotation.z;
}

/*
function createIsometricCamera() {
  const scale = .001;

  const width  = window.innerWidth * scale;
  const height = window.innerHeight * scale;

  camera = new THREE.OrthographicCamera(-width, width, height, -height, 0.01, 10);
  camera.position.x = 0.15;
  camera.position.y = .1;
  camera.position.z = 1;

  camera.rotation.order = "YXZ";
  camera.rotation.y = - Math.PI / 4;
  camera.rotation.x = Math.atan( - 1 / Math.sqrt( 2 ) );

  camera.updateProjectionMatrix();
}
*/

const genRandomNote = () => {
  const arr = [];

  for (let i = 0; i < 4; i += 1) {
    arr.push(Math.random() > 0.9 ? 1 : 0);
  }

  if (
    !arr.reduce((x, y) => (x || y), 0) || // No notes
    arr.reduce((sum, val) => (sum + val), 0) > 2 // More than 2 notes
  ) {
    return genRandomNote();
  }

  return arr;
};

let startTimeStamp;

function main() {
  startTimeStamp = Date.now();
  playing = true;
  setTimeout(() => {
    document.getElementById("audio").play();
  }, 2015);

  const totalTime = 22050 * 60;
  const percent = totalTime / 100;
  for (let i = 0; i < peaks.length; i += 1) {
    const percentage = peaks[i].pos / percent;
    const timeout = (30000 / 100) * percentage;
    setTimeout(() => startNote(genRandomNote()), timeout);
  }

  const boardGeometry = new THREE.BoxGeometry(
    400,
    30,
    2400);
  const boardMaterial = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    specular: 0x666666,
    shininess: 15,
  });

  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
  boardMesh.position.z = -750;
  receiveShadow(boardMesh);

  const targetGeometry = new THREE.BoxGeometry(
    500,
    50,
    10);
  const targetMaterial = new THREE.MeshPhongMaterial({
    color: 0x0000ff,
    specular: 0x555555,
    shininess: 10,
  });

  const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
  targetMesh.position.y = 100;
  targetMesh.position.z = startPoint + (range * 0.8);


  scene = new THREE.Scene();
  if (_useFog) {
    scene.fog = new THREE.Fog(0x000077, _fogNear, _fogFar);
  }
  if (_useBackground) {
    scene.background = new THREE.Color(0x103b56);
  }
  scene.add(boardMesh);
  scene.add(targetMesh);

  function doStuffWithLight(light) {
    light.castShadow = true;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 5000;
    light.shadow.mapSize.width  = _shadowMapSize;
    light.shadow.mapSize.height = _shadowMapSize;
    scene.add(light);
    // scene.add(new THREE.PointLightHelper(light, 3));
    // scene.add(new THREE.CameraHelper(light.shadow.camera));
  }

  const lights = [
    { color: 0x0033ff, intensity: 1.5, cutoff: 10000, pos: [500, 3500, 0] },
    { color: 0x00ff00, intensity: 2.3, cutoff: 10000, pos: [-500, 3500, 0] },
    { color: 0xffffff, intensity: 0.5, cutoff: 10000, pos: [-800, -500, 1000] },
  ];

  for (let i = 0; i < lights.length; i += 1) {
    const { color, intensity, cutoff, pos } = lights[i];
    const light = new THREE.PointLight(color, intensity, cutoff);
    light.position.set(...pos);
    doStuffWithLight(light);
  }


  const ambLight = new THREE.AmbientLight(0x404040);
  scene.add(ambLight);

  renderer = new THREE.WebGLRenderer({ antialias: _antialias });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = _useShadows;
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  console.log({ renderer });

  window.renderer = renderer;
  document.body.appendChild(renderer.domElement);

  createPerspectiveCamera();
}

function hasPerfError() {
  /**
   * These checks should be checking for potential memory leaks
   * or other performance killers.
   *
   * If any of these checks return a value, kill the application.
   */
  if (activeWaveformFrames.length > 300) {
    return "Active wave forms exceeded 300.";
  }
  if (activeNotes.length > 60) {
    return "Active notes exceeded 60";
  }
  return false;
}


const msPerFrame = 1000 / 60;

let totalFramesElapsed = 0;

function render() {
  const lastTotalFramesElapsed = totalFramesElapsed;

  const now = Date.now();
  const msElapsedFromStart = now - startTimeStamp;

  totalFramesElapsed = Math.floor(msElapsedFromStart / msPerFrame);

  const framesElapsed = totalFramesElapsed - lastTotalFramesElapsed;

  const hasErr = hasPerfError();
  if (hasErr) { throw new Error(hasErr); }

  if (playing) {
    requestAnimationFrame(render);
  } else {
    return;
  }

  totalCycles += framesElapsed;

  _runExecutionQueue();

  const waveformOffset = 0;
  for (let i = 0; i < framesElapsed; i += 1) {
    if (_useWaveform && waveformData[totalCycles - waveformOffset - i]) {
      activeWaveformFrames.push(
        genWaveformFrame(waveformData[totalCycles - waveformOffset - i], i));
    }
  }

  for (let i = 0; i < activeNotes.length; i += 1) {
    const note = activeNotes[i];
    note.update(framesElapsed);
    if (note.getPercentComplete() > 130) {
      note.remove(i); // Removes it from the scene and activeNotes array
      i -= 1; // The next node will be at the current index.
    }
  }

  if (_useWaveform) {
    for (let i = 0; i < activeWaveformFrames.length; i += 1) {
      const bar = activeWaveformFrames[i];
      if (bar.getPercentComplete() > 130) {
        bar.remove(i);
        i -= 1;
      } else {
        bar.update(framesElapsed);
      }
    }
  }

  scoreContainer.innerHTML = score.toString();
  if (controls) {
    controls.update();
  }

  if (_useWobble) {
    camera.rotation.x = calcWobble("x", 0);
    camera.rotation.y = calcWobble("y", 0.5);
  }

  renderer.render(scene, camera);
}

function onLoad() {
  if (_useWaveform) {
    const hzPerFrame = ((audioData.length - 1) / 30 / 60 / _waveformDataPointsPerFrame);

    /**
     * Creates a shorter version of the raw audio data that has
     * just enough datapoints to generate the waveform with.
     */
    const data = [];
    for (let i = 0; i < audioData.length; i += hzPerFrame) {
      let volume = 0;
      for (let j = 0; j < hzPerFrame; j += 1) {
        volume += Math.abs(audioData[Math.floor(i) + j]);
      }
      data.push(volume / hzPerFrame);
      volume = 0;
    }

    waveformData = [];
    for (let i = 0; i < data.length; i += _waveformDataPointsPerFrame) {
      const frame = [];
      for (let j = 0; j < _waveformDataPointsPerFrame; j += 1) {
        frame.push(data[Math.floor(i) + j]);
      }
      waveformData.push(frame);
    }

    console.log(audioData.length, waveformData.length, hzPerFrame);
  }


  main();
  render();

  const directionMap = {
    37:                   "LEFT",
    38:                   "UP",
    39:                   "RIGHT",
    40:                   "DOWN",
    ["H".charCodeAt(0)]:  "LEFT",
    ["J".charCodeAt(0)]:  "UP",
    ["K".charCodeAt(0)]:  "DOWN",
    ["L".charCodeAt(0)]:  "RIGHT",
  };

  window.addEventListener("keydown", (e) => {
    arrowElMap[directionMap[e.keyCode]].classList.add("active");
    const dir = directionMap[e.keyCode];
    if (hittableNotes.length) {
      hittableNotes[0].hitNote(dir);
    }
  });

  window.addEventListener("keyup", (e) => {
    arrowElMap[directionMap[e.keyCode]].classList.remove("active");
  });

  // Pause and play
  document.getElementById("stop-render").onclick = () => {
    playing = !playing;
    if (playing) { render(); }
  };
}

const arrowMaterial = new THREE.MeshStandardMaterial({
  color: 0x6F6CC5,
  wireframe: false,
  metalness: 0.7,
});

function loadModels() {
  const assets = [
    {
      path: "models/arrow.obj",
      name: "arrow",
      material: arrowMaterial,
      scale: { x: 65, y: 65, z: 200 },
    },
  ];

  return new Promise(resolve => (function loadNext(i = 0) {
    if (assets[i]) {
      objLoader.load(assets[i].path, (mesh) => {
        mesh.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
          }
        });

        if (assets[i].material) {
          mesh.material = assets[i].material;
        }

        if (assets[i].scale) {
          const { scale } = assets[i];
          const keys = Object.keys(scale);
          for (let j = 0; j < keys.length; j += 1) {
            mesh.scale[keys[j]] = scale[keys[j]];
          }
        }

        models[assets[i].name] = mesh;
        loadNext(i + 1);
      });
    } else {
      resolve();
    }
  }()));
}

function loadFonts() {
  const FontLoader = new THREE.FontLoader();
  const assets = [
    {
      path: "fonts/shrikhand_regular.json",
      name: "shrikhand",
    },
  ];
  return new Promise(resolve => (function loadNext(i = 0) {
    if (assets[i]) {
      FontLoader.load(assets[i].path, (font) => {
        fonts[assets[i].name] = font;
        loadNext(i + 1);
      });
    } else {
      resolve();
    }
  }()));
}

const createTextMeshes = () => new Promise((resolve) => {
  const textStyles = [
    {
      name: "miss",
      text: "Miss!",
      material: new THREE.MeshStandardMaterial({
        color: 0x444444,
        wireframe: false,
        metalness: 0.7,
      }),
      opts: {
        font: fonts.shrikhand,
        size: 50,
        height: 5,
      },
    },
    {
      name: "hit",
      text: "Great!",
      material: new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.8,
      }),
      opts: {
        font: fonts.shrikhand,
        size: 50,
        height: 5,
      },
    },
  ];

  for (let i = 0; i < textStyles.length; i += 1) {
    const { name, text, material, opts } = textStyles[i];

    const textGeometry = new THREE.TextGeometry(text, opts);

    const textMesh = new THREE.Mesh(textGeometry, material);
    texts[name] = textMesh;
  }

  console.log(texts);

  resolve();
});

function getPeaks(data) {
  const partSize = khzSecond * _noteFrequency;
  const numParts = data[0].length / partSize;

  peaks = [];

  /**
   * Each part represents a span of time in the audio.
   *
   * We find the peak datapoint in each part and return an array
   * of the peaks with the volumes and positions.
   *
   * A flaw with this method is that two parts next to each other
   * could peak on the same beat and would be right next to each
   * other.
   *
   * This is circumvented by going through the peaks and removing
   * peaks that are too close. "Too close" can be defined dynamically
   * by a ms value.
   */
  for (let partIndex = 0; partIndex < numParts; partIndex += 1) {
    const peak = { vol: 0, pos: null };

    for (let i = partIndex * partSize; i < ((partIndex + 1) * partSize); i += 1) {
      const vol = (Math.abs(data[0][i]) + Math.abs(data[1][i])) / 2; // Stereo audio
      if (vol > peak.vol) {
        peak.pos = i;
        peak.vol = vol;
      }
    }

    peaks.push(peak);
  }

  const minMs = _minMillisecondBetweenPeaks * ((khzSecond) / 1000);

  /**
   * Removing peaks that are too close to a certain millisecond value.
   */
  for (let i = 0; (i + 1) < peaks.length; i += 1) {
    if (Math.abs(peaks[i].pos - peaks[i + 1].pos) < minMs) {
      // Less than x many ms between "peaks", remove the lower one.
      peaks.splice(i + ((peaks[i].vol > peaks[i + 1].vol) ? 1 : 0), 1);
      i -= 1; // Whether or not the first or second peak was removed, we reprocess.
    }
  }

  /**
   * Songs will have loud and silent sections. By removing the lowest
   * x percent of peaks we can make the frequency of notes in the louder
   * parts of the song higher and decrease the frequency in calmer parts.
   */
  peaks = peaks
    .sort((a, b) => (b.vol - a.vol)) // Sort by volume
    .splice(0, Math.round(peaks.length * _percentNotesToKeep)) // Only keep a certain percentile
    .sort((a, b) => (a.pos - b.pos)); // Then sort back to positions
}

const getSong = query => new Promise((resolve, reject) => {
  spotify.searchTracks(query, { limit: 1 })
    .then(((res) => {
      if (
        res &&
        res.body &&
        res.body.tracks &&
        res.body.tracks.items &&
        res.body.tracks.items[0]
      ) {
        spotify.getTrack(res.body.tracks.items[0].id).then(({ body }) => {
          const track = body;
          const previewUrl = track.preview_url; // The audio we will play

          document.getElementById("audio").src = previewUrl;

          const request = new XMLHttpRequest();
          request.open("GET", previewUrl, true);
          request.responseType = "arraybuffer";

          /**
           * We load and process the audio before we resolve so that there
           * is no delay when playing/starting the game.
           */
          request.onload = () => {
            // Create offline context
            const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            const offlineContext = new OfflineContext(2, 30 * khzSecond, khzSecond);

            offlineContext.decodeAudioData(request.response, (buffer) => {
              const source = offlineContext.createBufferSource();
              source.buffer = buffer;

              /**
               * Beats/drums/etc apparently typically occur between around
               * 100 - 150hz so to get a better peak map we can filter out
               * the other frequencies.
               *
               * Adult men also typically have a frequency within 85 - 185hz
               * so that is ideal for hip-hop/rap
               *
               * We do this with a combination of a lowpass and a highpass.
               *
               * A better explanation can be found here.
               * https://www.teachmeaudio.com/mixing/techniques/audio-spectrum/
               *
               * "Most bass signals in modern music tracks lie around the 90-200"
               */
              const lowpass = offlineContext.createBiquadFilter();
              lowpass.type = "lowpass";
              lowpass.frequency.value = 150; // Allows hz lower than

              const highpass = offlineContext.createBiquadFilter();
              highpass.type = "highpass";
              highpass.frequency.value = 100; // Allows hz higher than

              /**
               * The connect function sends the output to a certain
               * destination.
               *
               * So we can make the source feed the data through the lowpass,
               * which then feeds it to the highpass, which finally feeds it
               * to the offlineContext that we will actually use.
               */
              source.connect(lowpass);
              lowpass.connect(highpass);
              highpass.connect(offlineContext.destination);

              source.start(0);
              offlineContext.startRendering();
            });

            // After the audio processing is done
            offlineContext.oncomplete = ({ renderedBuffer }) => {
              // Two channels because of stereo audio.
              const channelA = renderedBuffer.getChannelData(0);
              const channelB = renderedBuffer.getChannelData(1);

              getPeaks([channelA, channelB]);
              audioData = channelA;

              resolve();
            };
          };

          request.send();
        });
      } else {
        reject("COULD_NOT_FIND_SONG");
      }
    }))
    .catch(err => reject(err));
});

if (accessToken) {
  loadModels()
    .then(loadFonts)
    .then(createTextMeshes)
    .then(() => getSong("glow"))
    .then(onLoad);
} else {
  // Show the spotify screen
}
