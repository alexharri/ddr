/* eslint-disable no-underscore-dangle */

import shortid from "shortid";

import genEl from "./src/utils/genEl";
import "./styles.css";

const soundMap = {
  37:                   { sound: "a.wav", direction: "LEFT" },
  38:                   { sound: "b.wav", direction: "UP" },
  39:                   { sound: "c.wav", direction: "RIGHT" },
  40:                   { sound: "d.wav", direction: "DOWN" },
  ["H".charCodeAt(0)]:  { sound: "a.wav", direction: "LEFT" },
  ["J".charCodeAt(0)]:  { sound: "b.wav", direction: "UP" },
  ["K".charCodeAt(0)]:  { sound: "d.wav", direction: "DOWN" },
  ["L".charCodeAt(0)]:  { sound: "c.wav", direction: "RIGHT" },
};

console.log(soundMap);

const arrowElMap = {};

const genArrowId = direction => `arrow-${direction.toLowerCase()}`;

{
  const container = document.getElementById("arrow-container");

  const keys = Object.keys(soundMap);
  for (let i = 0; i < keys.length; i += 1) {
    const direction = soundMap[keys[i]].direction;
    const el = genEl(
      "div",
      ["arrow", genArrowId(direction)],
      null,
      { id: genArrowId(direction) });
    arrowElMap[direction] = el;
    container.appendChild(el);
  }
}

/**
 * hittableNodes acts as a queue, first in first out. This allows
 * us to efficiently check whether a note was hit or not since the
 * first node in the array would be the one the user would hit.
 *
 * Nodes should be removed from the queue when they reach
 * 85 percent completion.
 */
const hittableNodes = [];

/**
 * All nodes to be rendered to the user should be in activeNodes.
 * Not all nodes in activeNodes are hittable, but they should
 * still slide off screen.
 */
const activeNodes = [];


const noteContainer = document.getElementById("note-list-container");

/**
 * Generates a note and appends it the to the noteContainer.
 */
function startNote(noteArr) {
  const dirArr = ["left", "up", "down", "right"];

  function genNoteArrow(i) {
    const el = genEl("div", ["note", `note-${dirArr[i]}`]);
    el.style.left = `calc(${Math.round(33.3333 * i)}% - ${(80 / 3) * i}px)`
    return el;
  }

  const el =
    genEl("div", "note-container")
      .withChildren(noteArr
        .map((active, i) => (active ? genNoteArrow(i) : null))
        .filter(exists => exists)); // Removing the nulls

  noteContainer.appendChild(el);

  const item = {
    el,
    id: shortid(),
    _isHittable: true,
    _percentComplete: 0,
    getPercentComplete() {
      return this._percentComplete;
    },
    addPercentComplete(p) {
      return this._percentComplete += p;
    },
    remove() {
      this.el.parentNode.removeChild(this.el);
    },
    setNotePosition() {
      this.el.style.top = (100 - this.getPercentComplete()) + "%";
    },
    setUnhittable() {
      this.el.style.opacity = 0.5;
      hittableNodes.shift();
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

      const directionIndex = dirArr.indexOf(which.toLowerCase());
      if (directionIndex < 0) {
        throw new Error("Invalid direction provided");
      }

      if (this.notes[directionIndex]) {
        this.notes[directionIndex] = 0;
      } else {
        // Render miss
      }

      let hasAnyLeft = false;

      if (!this.notes.reduce((x, y) => (x || y), 0)) {
        // Render hit animation or something
        this.setUnhittable();
        this.isHit = true;
        this.el.style.background = "red";
        addScore(50);
      }
    },
  };
  activeNodes.push(item);
  hittableNodes.push(item);
  return item;
}

let playing = false;

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

function render() {
  for (let i = 0; i < activeNodes.length; i += 1) {
    const node = activeNodes[i];
    const percentageComplete = node.getPercentComplete();
    if (node.isHittable && percentageComplete > 85) {
      node.setUnhittable(); // The user can't hit the note anymore
      // Render miss
    }
    if (percentageComplete > 100) {
      node.remove(i); // Removes it from the DOM
      activeNodes.splice(i, 1);
      i -= 1; // The next node will be at the current index.

      if (node.isHittable) {
        node.setUnhittable(); // To make sure it isn't kept in the unhittable array.
      }

      if (!activeNodes.length) {
        return; // No more nodes to loop through
      }
    } else {
      node.addPercentComplete(0.5);
      node.setNotePosition();
    }
  }

  scoreContainer.innerHTML = score.toString();

  if (playing) {
    requestAnimationFrame(render);
  }
}

function main() {
  playing = true;
  render();
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

startNote(genRandomNote());
main();

document.getElementById("stop-render").onclick = () => {
  playing = false;
};

setInterval(() => startNote(genRandomNote()), 500);

window.addEventListener("keydown", (e) => {
  arrowElMap[soundMap[e.keyCode].direction].classList.add("active");
  const dir = soundMap[e.keyCode].direction;
  if (hittableNodes.length) {
    hittableNodes[0].hitNote(dir);
  }
});

window.addEventListener("keyup", (e) => {
  arrowElMap[soundMap[e.keyCode].direction].classList.remove("active");
});