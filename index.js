/* eslint-disable no-underscore-dangle */
// global THREE


import genEl from "./src/utils/genEl";
import "./styles.css";

const THREE = require("three"); // Import doesn't work.
const OrbitControls = require("three-orbit-controls")(THREE);
const OBJLoader = require("three-obj-loader")(THREE);
const loader = new THREE.OBJLoader();
let scene;
let renderer;
let camera;
let controls;

const startPoint = -1.4;
const endPoint = 0.5;
const range = Math.abs(startPoint) + endPoint;

/**
 * The 3D .obj models that we will use.
 */
const models = {};

// The directios that the notes will use
const directions = ["LEFT", "UP", "DOWN", "RIGHT"];

// A map with an element for each direction in the array above.
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

/**
 * hittableNotes acts as a queue, first in first out. This allows
 * us to efficiently check whether a note was hit or not since the
 * first node in the array would be the one the user would hit.
 *
 * Nodes should be removed from the queue when they reach
 * 90 percent completion.
 */
const hittableNotes = [];

/**
 * All nodes to be rendered to the user should be in activeNotes.
 * Not all nodes in activeNotes are hittable, but they should
 * still slide off screen.
 */
const activeNotes = [];

function genNoteMesh(index) { // Index being a note index from 0-3.
  const boxDim = 0.05;
  const box = new THREE.BoxGeometry(boxDim, boxDim, boxDim);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6F6CC5,
    // specular: 0x111111,
    // shininess: 1,
    wireframe: false,
    metalness: 0.7,
  });

  const boardRange = 0.3;
  
  const mesh = new THREE.Mesh(box, material);
  mesh.position.y += 0.08;
  mesh.position.x = (-(boardRange / 2)) + (index * (boardRange / 3));

  return mesh;
}

/**
 * Generates a note and appends it the to the noteContainer.
 */
function startNote(noteArr) {
  const group = new THREE.Group(); // The note mesh container

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
    getNoteMesh(direction) {
      const index =
        this.group.children
          .map(mesh => mesh.direction)
            .indexOf(directions[direction]);
      if (index > -1) {
        return this.group.children[index];
      }
      return null;
    },
    getPercentComplete() {
      return this._percentComplete;
    },
    addPercentComplete(p) {
      return this._percentComplete += p;
    },
    remove(i) {
      /*
      const children = scene.children;
      const groupIndex = children.map(group => group.uuid).indexOf(this.uuid);
      if (groupIndex < 0) {
        throw new Error("Expected mesh group to be a child of the scene.");
      }
      */
      scene.remove(this.group);
      activeNotes.splice(i, 1);
    },
    setNotePosition() {
      this.group.position.z = startPoint + ((this.getPercentComplete() / 100) * range);
      this.group.position.y += Math.sin(this.getPercentComplete() * 0.1) * .001;
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
        this.group.position.y += .1;
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

const scoreContainer = document.getElementById("score-container");

let score = 0;
const multiplier = 0;

function addScore(s) {
  if (typeof s !== "number") {
    throw new Error("Expected score to be a number.");
  }
  score += (s * multiplier);
  return score;
}

function getScore() {
  return score;
}

function createPerspectiveCamera() {
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 10);
  window.camera = camera;

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

  camera.position.x = 0.15;
  camera.position.y = 0.92;
  camera.position.z = 0.61;
  
  camera.rotation.order = "YXZ";
  camera.rotation.x = -0.84;
  camera.rotation.y = 0.3;
  camera.rotation.z = 6.2;

}

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

function main() {
  playing = true;


  const boardGeometry = new THREE.BoxGeometry(0.4, 0.05, 2);
  const boardMaterial = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    specular: 0x666666,
    shininess: 15,
  });

  const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
  boardMesh.position.z = -0.75;


  const targetGeometry = new THREE.BoxGeometry(0.5, 0.05, 0.01);
  const targetMaterial = new THREE.MeshPhongMaterial({
    color: 0x0000ff,
    specular: 0x555555,
    shininess: 10,
  });

  const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
  targetMesh.position.y = .1;
  targetMesh.position.z = startPoint + (range * 0.8);

  
  scene = new THREE.Scene();
  scene.add(boardMesh);
  scene.add(targetMesh);

  const blueLight = new THREE.PointLight(0x0033ff, 1.5, 150);
  blueLight.position.set(0.5, 3.5, 0);
  scene.add(blueLight);
  scene.add(new THREE.PointLightHelper(blueLight, 3));

  const redLight = new THREE.PointLight(0x00ff00, 1.5, 150);
  redLight.position.set(-0.5, 3.5, 0);
  scene.add(redLight);
  scene.add(new THREE.PointLightHelper(redLight, 3));

  const ambLight = new THREE.AmbientLight(0x404040);
  scene.add(ambLight);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  createPerspectiveCamera();
}

const cyclesRequired = 30;
let renderCycles = 0;

function render() {
  if (playing) {
    requestAnimationFrame(render);
  } else {
    return;
  }
  // boxes[i].mesh.position.z -= 0.01;

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
  renderer.render(scene, camera);
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

const assets = [
  { path: "models/arrow.obj", name: "arrow" },
];

(function loadNext(i = 0) {
  if (assets[i]) {
    loader.load(assets[i].path, (obj) => {
      models[assets[i].name] = obj;
      loadNext(i + 1);
    });
  } else {
    onLoad();
  }
}());
