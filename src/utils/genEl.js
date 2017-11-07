export default function genEl(type, c, text, attrs) {
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
  }

  return el;
}