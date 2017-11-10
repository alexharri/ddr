/* eslint-disable no-underscore-dangle */

import genEl from "./src/utils/genEl";
import "./styles.css";

const THREE = require("three"); // Import doesn't work.
const OrbitControls = require("three-orbit-controls")(THREE);
require("three-obj-loader")(THREE);

window.THREE = THREE;
const objLoader = new THREE.OBJLoader();


let scene;
let renderer;
let camera;
let controls;

let totalCycles = 0;

/**
 * Functions to be executed
 */
const _executionQueue = [];
const _postExecutionQueue = [];

function _runExecutionQueue(post) {
  const queue = post
    ? _postExecutionQueue
    : _executionQueue;

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

function addToExecutionQueue(numEx, func, afterExFunc, opts = {}) {
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

  if (opts.post) {
    _postExecutionQueue.push(func);
  } else {
    _executionQueue.push(func);
  }
}

function getValueInbetween(x, y, percentage) {
  return ((x / 100) * (100 - percentage)) + ((y / 100) * percentage);
}


/**
 * SETTINGS
 */
const antialias     = true; // It's not possible to change AA live, a reload is required.
const useBackground = true;

// Camera settings

const USE_ORBIT_CONTROLS = false; // Orbit helper

const defaultCameraCoords = Object.freeze({
  x: 150,
  y: 920,
  z: 610,
});


const defaultCameraRotation = Object.freeze({
  x: -0.84,
  y:  0.3,
  z:  6.2,
});


// Wobble settings
let _useWobble     = true && !USE_ORBIT_CONTROLS; // Wobble messes with orbit
let _wobbleRate    = 1;
let _wobbleWeight  = 1;
let _globalWobbleSync = 0;

const calcWobble = (axis, syncOff = 0, forceRate) => {
  const rate = forceRate || _wobbleRate;
  return defaultCameraRotation[axis] +
    ((Math.sin((totalCycles / (10 / rate.toFixed(2))) +
      (Math.PI * (syncOff + _globalWobbleSync))) / 150) * _wobbleWeight);
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
      /*
      const initialX = camera.rotation.x;
      camera.rotation.x = getValueInbetween()
      addToExecutionQueue(60, () => {
        camera.rotation
      }, null, { post: true });
      */
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

window.setWobbleWeight  = setWobbleWeight;
window.setWobbleRate    = setWobbleRate;
window.toggleWobble     = toggleWobble;


// Shadow setttings

let   _useShadows = true;
const _shadowReceivers = {};

function toggleShadows() {
  _useShadows = !_useShadows;
  renderer.shadowMap.enabled = _useShadows;

  const keys = Object.keys(_shadowReceivers);
  for (let i = 0; i < keys.length; i += 1) {
    _shadowReceivers[keys[i]].material.needsUpdate = true;
  }
}

// Memory leak debugging
// window.getNumShadowReceivers = () => Object.keys(_shadowReceivers).length;

// Fog settings
let _useFog    = true;
let _fogNear  = 900;
let _fogFar   = 3000;

function toggleFog() {
  _useFog = !_useFog;
  if (_useFog) {
    scene.fog.near  = _fogNear;
    scene.fog.far   = _fogFar;
  } else {
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

window.toggleFog  = toggleFog;
window.setFogFar  = setFogFar;
window.setFogNear = setFogNear;

window.toggleShadows = toggleShadows;

function receiveShadow(mesh) {
  mesh.receiveShadow = true;
  _shadowReceivers[mesh.uuid] = mesh;
}

/* We don't happen to use this function
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


// The directios that the notes will use
const directions = ["LEFT", "UP", "DOWN", "RIGHT"];

/**
 * This contains the elements that represent the arrow keys
 * in the UI.
 */
const arrowElMap = {};

{
  // Initializing the arrows
  const arrowContainer = document.getElementById("arrow-container");

  const genArrowId = direction => `arrow-${direction.toLowerCase()}`;

  for (let i = 0; i < directions.length; i += 1) {
    const direction = directions[i];
    const el = genEl(
      "div",
      ["arrow", genArrowId(direction)],
      null,
      { id: genArrowId(direction) });
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
    getPercentComplete() {
      return this._percentComplete;
    },
    addPercentComplete(p) {
      this._percentComplete += p;
    },
    remove(i) {
      scene.remove(this.group);
      activeNotes.splice(i, 1);
    },
    setNotePosition() {
      const perc = this.getPercentComplete();
      this.group.position.z = startPoint + ((perc / 100) * range);
      this.group.position.y += Math.sin(perc * 0.1); // Makes the arrow fluctuate
    },
    setUnhittable() {
      // Make notes transparent
      hittableNotes.shift();
      this.isHittable = false;
    },
    isHittable() {
      return this._isHittable;
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

      if (this.getPercentComplete() < 75) {
        console.log("TOO EARLY");
        return;
      }

      if (this.notes[directionIndex]) {
        this.notes[directionIndex] = 0;
      } else {
        console.log("WRONG NOTE");

        // Creating the miss text
        const text = texts.miss.clone();
        text.position.y = 0;
        text.position.x = -400;
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
        text.position.x = -400;
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

let playing = false;

document.getElementById("stop-render").onclick = () => {
  playing = !playing;
  if (playing) {
    render();
  }
};

function createPerspectiveCamera() {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    50,
    10000,
  );

  if (USE_ORBIT_CONTROLS) {
    controls = new OrbitControls(camera, renderer.domElement);
    // controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.3;
    controls.rotateSpeed = 2;
  }

  camera.position.x = defaultCameraCoords.x;
  camera.position.y = defaultCameraCoords.y;
  camera.position.z = defaultCameraCoords.z;

  camera.rotation.order = "YXZ";
  camera.rotation.x = defaultCameraRotation.x;
  camera.rotation.y = defaultCameraRotation.y;
  camera.rotation.z = defaultCameraRotation.z;
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

function main() {
  playing = true;


  const boardGeometry = new THREE.BoxGeometry(
    400,
    30,
    2000);
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
  if (useBackground) {
    scene.background = new THREE.Color(0x103b56);
  }
  scene.add(boardMesh);
  scene.add(targetMesh);

  function doStuffWithLight(light) {
    light.castShadow = true;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 5000;
    light.shadow.mapSize.width  = 512;
    light.shadow.mapSize.height = 512;
    scene.add(light);
    // scene.add(new THREE.PointLightHelper(light, 3));
    // scene.add(new THREE.CameraHelper(light.shadow.camera));
  }

  const lights = [
    { color: 0x0033ff, intensity: 1.5, cutoff: 10000, pos: [500, 3500, 0] },
    { color: 0x00ff00, intensity: 2.3, cutoff: 10000, pos: [-500, 3500, 0] },
    { color: 0xff0000, intensity: 2.3, cutoff: 10000, pos: [-500, -500, 1000] },
  ];

  for (let i = 0; i < lights.length; i += 1) {
    const { color, intensity, cutoff, pos } = lights[i];
    const light = new THREE.PointLight(color, intensity, cutoff);
    light.position.set(...pos);
    doStuffWithLight(light);
  }


  const ambLight = new THREE.AmbientLight(0x404040);
  scene.add(ambLight);

  renderer = new THREE.WebGLRenderer({ antialias });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = _useShadows;
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  console.log({ renderer });

  window.renderer = renderer;
  document.body.appendChild(renderer.domElement);

  createPerspectiveCamera();
}

const genRandomNote = () => {
  const arr = [];

  for (let i = 0; i < 4; i += 1) {
    arr.push(Math.random() > 0.75 ? 1 : 0);
  }

  if (
    !arr.reduce((x, y) => (x || y), 0) || // No notes
    arr.reduce((sum, val) => (sum + val), 0) > 2 // More than 2 notes
  ) {
    return genRandomNote();
  }

  return arr;
};

const cyclesRequired = 30;
let renderCycles = 0;

function render() {
  if (playing) {
    requestAnimationFrame(render);
  } else {
    return;
  }

  totalCycles += 1;

  _runExecutionQueue();

  if (renderCycles === cyclesRequired) {
    startNote(genRandomNote());
    renderCycles = 0;
  } else {
    renderCycles += 1;
  }

  for (let i = 0; i < activeNotes.length; i += 1) {
    const note = activeNotes[i];
    const percentageComplete = note.getPercentComplete();
    if (note.isHittable && percentageComplete > 85) {
      note.setUnhittable(); // The user can't hit the note anymore
    }
    if (percentageComplete > 130) {
      note.remove(i); // Removes it from the scene and activeNotes array
      i -= 1; // The next node will be at the current index.

      if (note.isHittable) {
        note.setUnhittable(); // To make sure it isn't kept in the unhittable array.
      }

      if (!activeNotes.length) {
        return; // No more nodes to loop through
      }
    } else {
      note.addPercentComplete(0.5);
      note.setNotePosition();
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
  main();
  startNote(genRandomNote());
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

loadModels()
  .then(loadFonts)
  .then(createTextMeshes)
  .then(onLoad);
