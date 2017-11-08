/* eslint-disable no-underscore-dangle */

import genEl from "./src/utils/genEl";
import "./styles.css";

const THREE = require("three"); // Import doesn't work.
require("three-orbit-controls")(THREE);
require("three-obj-loader")(THREE);

const loader = new THREE.OBJLoader();


let scene;
let renderer;
let camera;
let controls;

/**
 * startPoint is the point on the board on which the arrows start
 * endPoint is the point at which they disappear.
 * range is the distance between the end and start.
 */
const startPoint = -1400;
const endPoint = 500;
const range = Math.abs(startPoint) + endPoint;


// The meshes created from .obj 3D models that we will use.
const models = {};

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
const scoreMultiplier = 0;

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
      }

      // Runs if all notes have been hit
      if (!this.notes.reduce((x, y) => (x || y), 0)) {
        // Render hit animation or something
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
  playing = false;
};

function createPerspectiveCamera() {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    50,
    10000,
  );

  /*
  controls = new OrbitControls(camera, renderer.domElement)
  // controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = .3;
  controls.rotateSpeed = 2;
  controls.addEventListener("change", () => {
    console.log(camera.rotation, camera.position);
  });
  */

  camera.position.x = 150;
  camera.position.y = 920;
  camera.position.z = 610;

  camera.rotation.order = "YXZ";
  camera.rotation.x = -0.84;
  camera.rotation.y = 0.3;
  camera.rotation.z = 6.2;
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
  boardMesh.receiveShadow = true;


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
  scene.fog = new THREE.Fog(0x000077, 900, 3000);
  scene.background = new THREE.Color(0x103b56);
  scene.add(boardMesh);
  scene.add(targetMesh);

  function doStuffWithLight(light) {
    light.castShadow = true;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 5000;
    light.shadow.mapSize.width  = 1800;
    light.shadow.mapSize.height = 1800;
    scene.add(light);
    // scene.add(new THREE.PointLightHelper(light, 3));
    // scene.add(new THREE.CameraHelper(light.shadow.camera));
  }

  const lights = [
    { color: 0x0033ff, intensity: 1.5, cutoff: 10000, pos: [500, 3500, 0] },
    { color: 0x00ff00, intensity: 2.3, cutoff: 10000, pos: [-500, 3500, 0] },
  ];

  for (let i = 0; i < lights.length; i += 1) {
    const { color, intensity, cutoff, pos } = lights[i];
    const light = new THREE.PointLight(color, intensity, cutoff);
    light.position.set(...pos);
    doStuffWithLight(light);
  }


  const ambLight = new THREE.AmbientLight(0x404040);
  scene.add(ambLight);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  console.log({ renderer });

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

let totalCycles = 0;
const cyclesRequired = 30;
let renderCycles = 0;

const youWantAHeadache = true;
const wobbleRate = 1;
const wobble = 1;

function render() {
  if (playing) {
    requestAnimationFrame(render);
  } else {
    return;
  }

  totalCycles += 1;

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
      // Render miss
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

  if (youWantAHeadache) {
    const rate = 10 / wobbleRate;

    camera.rotation.x += (Math.sin(totalCycles / rate) / 1500) * wobble;
    camera.rotation.y += (Math.sin((totalCycles / rate) + (Math.PI / 2)) / 1500) * wobble;
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

const arrowScale = {
  x: 65,
  y: 65,
  z: 200,
};

const assets = [
  { path: "models/arrow.obj", name: "arrow", material: arrowMaterial, scale: arrowScale },
];

(function loadNext(i = 0) {
  if (assets[i]) {
    loader.load(assets[i].path, (mesh) => {
      mesh.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      if (assets[i].metarial) {
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
    onLoad();
  }
}());
