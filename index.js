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
let firstLoad = true;
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

const toHexString = (hexNumber) => {
  let hex = hexNumber.toString(16);
  if (typeof hex !== "string") {
    throw new Error("Expected hex to be a string.");
  }
  while (hex.length < 6) {
    hex = "0" + hex;
  }
  return hex;
};


/**
 * === SETTINGS ===
 *
 * An underscore means that the property should not be changed
 * without a setter.
 *
 * If a property
 */

const bools = {};
const nums = {};

// Common settings
bools._antialias     = true; // It's not possible to change AA live, a reload is required.
const _useBackground = true;

// Color settings
const colors = {
  _fogColor         : 0x440033,
  _backgroundColor  : 0x01d1fe,
  _boardColor       : 0x006666,
  _arrowColor       : 0xff0000,
  _hitTextColor     : 0x3300ee,
  _missTextColor    : 0x444444,
  _targetColor      : 0x111111,
  _waveformColor    : 0xdd00dd,
  _rightLightColor  : 0x220044,
  _leftLightColor   : 0x990099,
  _textLightColor   : 0xffffff,
};

const _rightLightIntensity  = 1;
const _leftLightIntensity   = 2;
const _textLightIntensity   = 0.5;

const _lightCutoff = 10000;


/**
 * Notefrequency determines the frequency of peaks.
 * Peaks per second = second / noteFrequency.
 *
 * 1    = 1 peak  per second.
 * 0.5  = 2 peaks per second.
 * 0.25 = 4 peaks per second.
 */
nums._noteFrequency = 0.3;
nums._percentNotesToKeep = 0.8;

// Note settings
nums._minMillisecondBetweenPeaks = 175; // No two notes may be closer than this.

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
bools._useWaveform = true;
nums._waveformDataPointsPerFrame = 1;
nums._waveformSpeed = 2;

// Wobble settings
bools._useWobble   = true && !_useOrbitControls; // Wobble messes with orbit
nums._wobbleRate   = 1;
nums._wobbleWeight = 1;
let _globalWobbleSync = 0;

// Shadow setttings
bools._useShadows = false;
nums._shadowMapSize = 512;
const _shadowReceivers = {};

// Fog settings
const _useFog = true;
const _defaultFogNear =  800;
const _defaultFogFar  = 2750;
let _fogNear  = 1;
let _fogFar   = 0;


function genEl(type, c, text, attrs) {
  const el = document.createElement(type);

  if (typeof c === "string") {
    el.classList.add(c);
  } else if (Array.isArray(c)) {
    for (let i = 0; i < c.length; i += 1) {
      el.classList.add(c[i]);
    }
  }

  if (typeof text === "string") {
    el.appendChild(document.createTextNode(text));
  }

  if (attrs && typeof attrs === "object") {
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i += 1) {
      el[keys[i]] = attrs[keys[i]];
    }
  }

  setWithChildren(el);

  return el;
}

function genColorChanger(label, key) {
  const input = genEl("input", null, null, {
    value: `#${toHexString(colors[key])}`,
    type: "color",
  });
  input.onchange = (e) => {
    if (key === "_backgroundColor") {
      document.body.style.backgroundColor = e.target.value;
    }
    colors[key] = parseInt(e.target.value.substr(1), 16);
  };

  return genEl("label", "color-setting-label")
    .withChildren([
      genEl("div", null, label),
      input,
    ]);
}

function genBoolChanger(label, key) {
  const input = genEl("input", null, null, { type: "checkbox", checked: bools[key] });
  input.onchange = (e) => {
    bools[key] = e.target.checked;
    console.log(e.target.checked);
  };

  return genEl("label", "checkbox-label")
    .withChildren([
      genEl("div", null, label),
      input,
    ]);
}

function genNumChanger(label, key) {
  const input = genEl("input", null, null, { type: "number", value: nums[key], step: "0.1" });
  input.onchange = e => nums[key] = Number(e.target.value); // eslint-disable-line no-return-assign

  return genEl("label", "number-label")
    .withChildren([
      genEl("div", null, label),
      input,
    ]);
}

function genDifficultyNode() {
  const difficultySettings = [
    { label: "Easy",    freq: 0.4, keep: 0.75 },
    { label: "Medium",  freq: 0.3, keep: 0.80 },
    { label: "Hard",    freq: 0.2, keep: 0.85 },
  ];

  const buttonArr = [];

  for (let i = 0; i < difficultySettings.length; i += 1) {
    const button = genEl("button", "difficulty-button", difficultySettings[i].label, { type: "button" });
    if (difficultySettings[i].freq === nums._noteFrequency) {
      button.classList.add("active");
    }
    button.onclick = () => {
      nums._noteFrequency = difficultySettings[i].freq;
      nums._percentNotesToKeep = difficultySettings[i].keep;

      for (let j = 0; j < buttonArr.length; j += 1) {
        buttonArr[j].classList.remove("active");
      }

      button.classList.add("active");
      console.log(nums);
    };

    buttonArr.push(button);
  }

  return genEl("div")
    .withChildren(buttonArr);
}

function genSettingsSectionContainer(type, c, title) {
  const el = genEl(type, c);
  const { withChildren } = el;

  const expander = genEl("div", ["expander", "settings-container"]);

  const expandButton = genEl("button", "setting-expand-button", null, { type: "button" });
  expandButton.onclick = () => {
    if (expander.classList.contains("expanded")) {
      expander.classList.remove("expanded");
      expandButton.classList.remove("active");
    } else {
      expander.classList.add("expanded");
      expandButton.classList.add("active");
    }
  };

  el.withChildren = (children) => withChildren([
    genEl("h3", "settings-section-title", title),
    expandButton,
    expander.withChildren(children),
  ]);

  return el;
}

function genSettingsNode() {
  return genEl("div", null, null, { id: "settings-container" })
    .withChildren([
      genEl("h2", "settings-title", "Settings"),
      genSettingsSectionContainer("div", "settings-section-container", "Difficulty")
        .withChildren([
          genDifficultyNode(),
        ]),
      genSettingsSectionContainer("div", "settings-section-container", "Color")
        .withChildren([
          genColorChanger("Fog", "_fogColor"),
          genColorChanger("Background", "_backgroundColor"),
          genColorChanger("Board", "_boardColor"),
          genColorChanger("Arrow", "_arrowColor"),
          genColorChanger("Target", "_targetColor"),
          genColorChanger("Hit text", "_hitTextColor"),
          genColorChanger("Miss text", "_missTextColor"),
          genColorChanger("Waveform", "_waveformColor"),
          genColorChanger("Right light", "_rightLightColor"),
          genColorChanger("Left light", "_leftLightColor"),
          genColorChanger("Text light", "_textLightColor"),
        ]),
      genSettingsSectionContainer("div", "settings-section-container", "Wobble")
        .withChildren([
          genBoolChanger("Use wobble", "_useWobble"),
          genNumChanger("Wobble weight", "_wobbleWeight"),
          genNumChanger("Wobble rate", "_wobbleRate"),
        ]),
      genSettingsSectionContainer("div", "settings-section-container", "Shadow")
        .withChildren([
          genBoolChanger("Use shadows", "_useShadows"),
          genNumChanger("Shadow quality", "_shadowMapSize"),
        ]),
      genSettingsSectionContainer("div", "settings-section-container", "Waveform")
        .withChildren([
          genBoolChanger("Use waveform", "_useWaveform"),
          genNumChanger("Waveform speed", "_waveformSpeed"),
          genNumChanger("Waveform detail", "_waveformDataPointsPerFrame"),
        ]),
    ]);
}

function genSettingsToggleButton() {
  const button = genEl("button", "toggle-settings-button", "Open settings", { type: "button" });
  button.onclick = () => {
    const el = document.getElementById("settings-container");
    if (el.classList.contains("expanded")) {
      el.classList.remove("expanded");
      button.classList.remove("active");
      button.innerHTML = "Open settings";
    } else {
      el.classList.add("expanded");
      button.classList.add("active");
      button.innerHTML = "Close settings";
    }
  };
  return button;
}

document.body.style.backgroundColor = `#${toHexString(colors._backgroundColor)}`;

const calcWobble = (axis, syncOff = 0, forceRate) => {
  const rate = forceRate || nums._wobbleRate;
  return _defaultCameraRotation[axis] +
    ((Math.sin((totalCycles / (10 / rate.toFixed(2))) +
      (Math.PI * (syncOff + _globalWobbleSync))) / 150) * nums._wobbleWeight /* * volume * 0.1) */);
};

function setWobbleRate(newRate) {
  if (typeof newRate !== "number") {
    throw new Error("Expected wobble rate to be a number.");
  }
  const initialRate = nums._wobbleRate;
  addToExecutionQueue(
    Math.max((Math.abs(newRate - initialRate) * 60), 1),
    (perc) => {
      _globalWobbleSync += (getValueInbetween(0, newRate - initialRate, perc) / (10 * Math.PI));
      console.log(_globalWobbleSync.toFixed(2));
    },
    () => {
      nums._wobbleRate = newRate;
    });
}

function setWobbleWeight(newWeight) {
  if (typeof newWeight !== "number") {
    throw new Error("Expected wobble weight to be a number.");
  }
  const initialWeight = nums._wobbleWeight;
  addToExecutionQueue(100, (percentage) => {
    nums._wobbleWeight = getValueInbetween(initialWeight, newWeight, percentage);
  });
}

function toggleWobble() {
  bools._useWobble = !bools._useWobble;
}

// Demonstration purposes
window.setWobbleWeight  = setWobbleWeight;
window.setWobbleRate    = setWobbleRate;
window.toggleWobble     = toggleWobble;

function toggleShadows() {
  bools._useShadows = !bools._useShadows;
  renderer.shadowMap.enabled = bools._useShadows;

  const keys = Object.keys(_shadowReceivers);
  for (let i = 0; i < keys.length; i += 1) {
    _shadowReceivers[keys[i]].material.needsUpdate = true; // Force a material redraw
  }
}

// Demonstration purposes
window.toggleShadows = toggleShadows;

/*
function toggleFog() {
  _useFog = !_useFog;
  if (_useFog) {
    scene.fog.near  = _fogNear;
    scene.fog.far   = _fogFar;
  } else {
    /**
     * It's impossible to remove fog if it has been added to a scene
     * so we just make it effectively invisible.
     /
    scene.fog.near = 0.1;
    scene.fog.far = 0;
  }
}
*/


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

/**
 * The rgb value will not be 0-256 because the fog
 * uses a span of 0-1.
 */
function hexToRGB(hexNumber) {
  const hex = toHexString(hexNumber);

  const toSpan = i => parseInt(hex.substr(i, 2), 16) / 255;
  return {
    r: toSpan(0),
    g: toSpan(2),
    b: toSpan(4),
  };
}

console.log(hexToRGB(0x0fff00));

function fadeFogTo(near, far, color, numFrames, callback) {
  const initialNear = _fogNear;
  const initialFar  = _fogFar;

  const initialColor = {
    r: scene.fog.color.r,
    g: scene.fog.color.g,
    b: scene.fog.color.b,
  };

  const newColor = hexToRGB(color);

  addToExecutionQueue(numFrames, (percentage) => {
    setFogNear(getValueInbetween(initialNear, near, percentage));
    setFogFar(getValueInbetween(initialFar,   far,  percentage));

    const fields = ["r", "g", "b"];
    for (let i = 0; i < fields.length; i += 1) {
      scene.fog.color[fields[i]] = getValueInbetween(
        initialColor[fields[i]],
        newColor[fields[i]], percentage);
    }
  }, callback);
}

// Demonstration purposes
// window.toggleFog  = toggleFog;
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

const arrowContainer = document.getElementById("arrow-container");
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

function setWithChildren(el) {
  el.withChildren = function withChildren(children) {
    el.innerHTML = "";

    if (children && children.nodeType === Node.ELEMENT_NODE) {
      el.appendChild(children);
    } else if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (!(child && child.nodeType === Node.ELEMENT_NODE)) {
          throw new Error("Expected children to be an array of valid child nodes.");
        }
        el.appendChild(child);
      }
    }
    return el;
  };
  return el;
}

const uiContainer = setWithChildren(document.getElementById("ui-container"));

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

let hitNoteCount = 0;
let missedNoteCount = 0;

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
        missedNoteCount += 1;
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
        hitNoteCount += 1;
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

  const barMaterial = new THREE.MeshPhongMaterial({
    color: colors._waveformColor,
    specular: 0x666666,
    shininess: 15,
  });

  const waveformRange = range * nums._waveformSpeed;
  const waveformStart = startPoint * nums._waveformSpeed;

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

  scene = new THREE.Scene();
  if (_useFog) {
    // We will fade into the fog color on load.
    scene.fog = new THREE.Fog(colors._backgroundColor, _fogNear, _fogFar);
  }
  if (_useBackground) {
    scene.background = new THREE.Color(colors._backgroundColor);
  }

  score = 0;
  arrowContainer.classList.remove("hidden");
  scoreContainer.classList.remove("hidden");
  fadeFogTo(_defaultFogNear, _defaultFogFar, colors._fogColor, 181, () => {
    document.getElementById("audio").play();

    setTimeout(() => {
      arrowContainer.classList.add("hidden");
      scoreContainer.classList.add("hidden");
      fadeFogTo(1, 0, colors._backgroundColor, 181, () => {
        setWobbleWeight(0);

        const totalNoteCount = hitNoteCount + missedNoteCount;
        let hitPercent = ((hitNoteCount / totalNoteCount) * 100).toString();

        if (hitPercent.length > 5) {
          hitPercent = hitPercent.substr(0, 5);
        }

        let message;

        if (Number(hitPercent) > 80) {
          message = "Great job!";
        } else if (Number(hitPercent) > 60) {
          message = "Pretty good!";
        } else if (Number(hitPercent) > 40) {
          message = "Not too bad.";
        } else {
          message = "Please stop.";
        }

        const form = genEl("form")
          .withChildren([
            genEl("h2", null, `You hit ${hitPercent}% of the notes! ${message}`),
            genEl("p", null, "How about playing again?"),
            genEl("input", null, null, { type: "text", id: "song-input" }),
            genEl("button", "start-song-button", "Find song", { type: "submit" }),
            genSettingsToggleButton(),
            genSettingsNode(),
          ]);
        form.onsubmit = (e) => {
          e.preventDefault();
          const song = document.getElementById("song-input").value;

          uiContainer.innerHTML = "";
          uiContainer.withChildren([
            genEl("div", "loader"),
            genEl("p", null, null, { id: "loader-status" }),
          ]);

          getSong(song) // eslint-disable-line no-use-before-define
            .then(() => {
              setWobbleWeight(1);
              onLoad(); // eslint-disable-line no-use-before-define
            });
        };

        playing = false;
        const canvas = document.body.lastChild;
        canvas.remove();
        uiContainer.classList.add("active");
        uiContainer.withChildren(form);
      });
    }, 1000 * 30);
  });

  const totalTime = 22050 * 60;
  const percent = totalTime / 100;
  setTimeout(() => {
    for (let i = 0; i < peaks.length; i += 1) {
      const percentage = peaks[i].pos / percent;
      const timeout = (30000 / 100) * percentage;
      setTimeout(() => startNote(genRandomNote()), timeout);
    }
  }, 1000);

  const boardGeometry = new THREE.BoxGeometry(
    400,
    30,
    2400);
  const boardMaterial = new THREE.MeshPhongMaterial({
    color: colors._boardColor,
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
    color: colors._targetColor,
    specular: 0x555555,
    shininess: 10,
  });

  const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
  targetMesh.position.y = 100;
  targetMesh.position.z = startPoint + (range * 0.8);

  scene.add(boardMesh);
  scene.add(targetMesh);

  function doStuffWithLight(light) {
    light.castShadow = true;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 5000;
    light.shadow.mapSize.width  = nums._shadowMapSize;
    light.shadow.mapSize.height = nums._shadowMapSize;
    scene.add(light);
    // scene.add(new THREE.PointLightHelper(light, 3));
    // scene.add(new THREE.CameraHelper(light.shadow.camera));
  }

  const lights = [
    {
      color:      colors._rightLightColor,
      intensity:  _rightLightIntensity,
      cutoff:     _lightCutoff,
      pos: [500, 3500, 0],
    },
    {
      color:      colors._leftLightColor,
      intensity:  _leftLightIntensity,
      cutoff:     _lightCutoff,
      pos: [-500, 3500, 0],
    },
    {
      color:      colors._textLightColor,
      intensity:  _textLightIntensity,
      cutoff:     _lightCutoff,
      pos: [-800, -500, 1000],
    },
  ];

  for (let i = 0; i < lights.length; i += 1) {
    const { color, intensity, cutoff, pos } = lights[i];
    const light = new THREE.PointLight(color, intensity, cutoff);
    light.position.set(...pos);
    doStuffWithLight(light);
  }


  const ambLight = new THREE.AmbientLight(0x404040);
  scene.add(ambLight);

  renderer = new THREE.WebGLRenderer({ antialias: bools._antialias });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = bools._useShadows;
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
  if (activeWaveformFrames.length > 350) {
    return "Active wave forms exceeded 350.";
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

  for (let i = 0; i < framesElapsed; i += 1) {
    _runExecutionQueue();
  }

  const waveformOffset = 60;
  for (let i = 0; i < framesElapsed; i += 1) {
    if (bools._useWaveform && waveformData[totalCycles - waveformOffset - i]) {
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

  if (bools._useWaveform) {
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

  if (bools._useWobble) {
    camera.rotation.x = calcWobble("x", 0);
    camera.rotation.y = calcWobble("y", 0.5);
  }

  renderer.render(scene, camera);
}

function onLoad() {
  uiContainer.classList.remove("active");

  if (bools._useWaveform) {
    const hzPerFrame = ((audioData.length - 1) / 30 / 60 / nums._waveformDataPointsPerFrame);

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
    for (let i = 0; i < data.length; i += nums._waveformDataPointsPerFrame) {
      const frame = [];
      for (let j = 0; j < nums._waveformDataPointsPerFrame; j += 1) {
        frame.push(data[Math.floor(i) + j]);
      }
      waveformData.push(frame);
    }
  }

  // Initializing the arrows
  if (firstLoad) {
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

  if (firstLoad) {
    window.addEventListener("keydown", (e) => {
      if (!directionMap[e.keyCode]) {
        return;
      }
      arrowElMap[directionMap[e.keyCode]].classList.add("active");
      const dir = directionMap[e.keyCode];
      if (hittableNotes.length) {
        hittableNotes[0].hitNote(dir);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (!directionMap[e.keyCode]) {
        return;
      }
      arrowElMap[directionMap[e.keyCode]].classList.remove("active");
    });
  }

  firstLoad = false;
}

const arrowMaterial = new THREE.MeshPhongMaterial({
  color: colors._arrowColor,
  specular: 0x444444,
  shininess: 10,
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

  document.getElementById("loader-status").innerHTML = "Loading models...";
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
          for (let j = 0; j < mesh.children.length; j += 1) {
            mesh.children[j].material = assets[i].material;
          }
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

  document.getElementById("loader-status").innerHTML = "Loading fonts...";
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
        color: colors._missTextColor,
        wireframe: false,
        metalness: 0.7,
      }),
      opts: {
        font: fonts.shrikhand,
        height: 0,
        size: 50,
      },
    },
    {
      name: "hit",
      text: "Great!",
      material: new THREE.MeshStandardMaterial({
        color: colors._hitTextColor,
        metalness: 0.8,
      }),
      opts: {
        font: fonts.shrikhand,
        height: 0,
        size: 50,
      },
    },
  ];

  document.getElementById("loader-status").innerHTML = "Creating text meshes...";
  for (let i = 0; i < textStyles.length; i += 1) {
    const { name, text, material, opts } = textStyles[i];

    const textGeometry = new THREE.TextGeometry(text, opts);
    // const textGeo = new THREE.ShapeGeometry(text, opts);

    const textMesh = new THREE.Mesh(textGeometry, material);
    texts[name] = textMesh;
  }

  console.log(texts);

  resolve();
});

function getPeaks(data) {
  const partSize = khzSecond * nums._noteFrequency;
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

  const minMs = nums._minMillisecondBetweenPeaks * ((khzSecond) / 1000);

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
    .splice(0, Math.round(peaks.length * nums._percentNotesToKeep)) // Only keep a certain percentile
    .sort((a, b) => (a.pos - b.pos)); // Then sort back to positions
}

const getSong = query => new Promise((resolve, reject) => {
  document.getElementById("loader-status").innerHTML = "Loading song...";
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
        document.getElementById("loader-status").innerHTML = "Could not find song.";
        reject("COULD_NOT_FIND_SONG");
      }
    }))
    .catch(err => reject(err));
});

if (accessToken) {
  // Render the screen for the user to pick the song.
  uiContainer.innerHTML = "";
  setTimeout(() => uiContainer.classList.add("active"));

  const form = genEl("form")
    .withChildren([
      genEl("h1", null, "Spotify DDR"),
      genEl("p", null, "Search for any song from Spotify and start playing!"),
      genEl("input", null, null, { type: "text", id: "song-input" }),
      genEl("button", "start-song-button", "Find song", { type: "submit" }),
      genSettingsToggleButton(),
      genSettingsNode(),
    ]);

  form.onsubmit = (e) => {
    e.preventDefault();
    const song = document.getElementById("song-input").value;

    uiContainer.classList.add("loading");
    uiContainer.innerHTML = "";
    uiContainer.withChildren([
      genEl("div", "loader"),
      genEl("p", null, null, { id: "loader-status" }),
    ]);

    getSong(song)
      .then(loadModels)
      .then(loadFonts)
      .then(createTextMeshes)
      .then(onLoad);
  };

  uiContainer.appendChild(form);
} else {
  // Show the spotify screen
  setTimeout(() => uiContainer.classList.add("active"));

  const button = genEl("button", null, "Get access token");
  button.onclick = () => window.location.href = "https://accounts.spotify.com/en/authorize?client_id=b7e6e7cef1c74629ab74d4f89ec088c0&response_type=token&redirect_uri=http:%2F%2Flocalhost:8080&scope=&state="; // eslint-disable-line no-return-assign

  uiContainer.withChildren([
    genEl("h1", null, "Spotify DDR"),
    genEl("p", null, "This game requires access to spotify."),
    genEl("p", null, "Click the button below to get an access token."),
    button,
  ]);
}
