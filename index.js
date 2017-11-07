/* eslint-disable no-underscore-dangle */

import shortid from "shortid";

import genEl from "./src/utils/genEl";
import "./styles.css";

const soundMap = {
  37: { sound: "a.wav", direction: "LEFT" },
  38: { sound: "b.wav", direction: "UP" },
  39: { sound: "c.wav", direction: "RIGHT" },
  40: { sound: "d.wav", direction: "DOWN" },
};

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

window.addEventListener("keydown", (e) => {
  arrowElMap[soundMap[e.keyCode].direction].classList.add("active");
});

window.addEventListener("keyup", (e) => {
  arrowElMap[soundMap[e.keyCode].direction].classList.remove("active");
});

const activeNodes = [];
const hittableNodes = [];

const noteContainer = document.getElementById("note-list-container");

function startNote(noteArr) {
  const dirArr = ["LEFT", "UP", "DOWN", "RIGHT"];

  function genNoteArrow(i) {
    const el = genEl("div", ["note", `note-${dirArr[i].toLowerCase()}`]);
    el.style.left = (25 * i) + "%";
    return el;
  }

  const el =
    genEl("div", "note-container")
      .withChildren(
        noteArr.map((active, i) => (
          active ? genNoteArrow(i) : null))
        .filter(exists => exists));

  noteContainer.appendChild(el);

  const item = {
    el,
    _percentComplete: 0,
    getPercentComplete() {
      return this._percentComplete;
    },
    addPercentComplete(p) {
      if (typeof p !== "number") {
        throw new Error("Expected percentage to be a number.");
      }
      this._percentComplete += p;
      return this._percentComplete;
    },
    remove(index) {
      this.el.parentNode.removeChild(this.el);
      activeNodes.splice(index, 1);
    },
    setNotePosition() {
      this.el.style.top = (100 - this.getPercentComplete()) + "%";
    },
  };
  activeNodes.push(item);
  hittableNodes.push(item);
  return item;
}

let playing = false;

function render() {
  for (let i = 0; i < activeNodes.length; i += 1) {
    const node = activeNodes[i];
    if (node.getPercentComplete() > 100) {
      node.remove(i);
      i -= 1;
      if (!activeNodes.length) {
        return;
      }
    } else {
      node.addPercentComplete(0.5);
      node.setNotePosition();
    }
  }

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

  return arr;
};

startNote(genRandomNote());
main();

document.getElementById("stop-render").onclick = () => {
  playing = false;
};

setInterval(() => startNote(genRandomNote()), 500);
