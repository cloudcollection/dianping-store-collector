const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("extension/content.js", "utf8");
const listeners = new Set();
const context = {
  chrome: {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.add(listener);
        },
        removeListener(listener) {
          listeners.delete(listener);
        }
      }
    }
  },
  console,
  URL,
  Set,
  Map,
  Promise,
  String,
  Number,
  Array,
  Boolean,
  RegExp,
  setTimeout,
  clearTimeout
};

vm.createContext(context);
vm.runInContext(source, context);
assert.equal(listeners.size, 1);
const firstListener = [...listeners][0];

vm.runInContext(source, context);
assert.equal(listeners.size, 1);
assert.notEqual([...listeners][0], firstListener);
assert.equal(listeners.has(firstListener), false);
assert.equal(source.includes("offerSectionDetected"), true);
assert.equal(source.includes("offerParseFailed"), true);
assert.equal(source.includes('"优惠券信息": []'), true);
assert.equal(
  source.includes('querySelectorAll("button, a, [role=button], div, span")'),
  true
);
assert.equal(
  source.includes("!Array.from(node.children || []).some(isAction)"),
  true
);

console.log("content reinjection test passed");
