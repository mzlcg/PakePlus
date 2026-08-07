const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

class Element {
  constructor(id = "") {
    this.id = id;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.min = "";
    this.max = "";
    this.className = "";
    this.clientWidth = 900;
    this.clientHeight = 420;
    this.listeners = {};
  }
  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
}

function buildContext(file) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const elements = {};
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    elements[match[1]] = new Element(match[1]);
  }

  const localStorageStore = {};
  const context = {
    console,
    window: {},
    document: {
      getElementById(id) {
        if (!elements[id]) elements[id] = new Element(id);
        return elements[id];
      },
    },
    localStorage: {
      getItem(key) {
        return localStorageStore[key] || null;
      },
      setItem(key, value) {
        localStorageStore[key] = String(value);
      },
    },
    echarts: {
      init(el) {
        return {
          el,
          option: null,
          setOption(option) {
            this.option = option;
          },
          resize() {},
          dispose() {},
        };
      },
    },
  };
  context.window = context;
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  context.window.clearTimeout = clearTimeout;
  context.window.setTimeout = (fn) => {
    if (typeof fn === "function") fn();
    return 0;
  };
  context.ResizeObserver = class {
    constructor(handler) {
      this.handler = handler;
    }
    observe() {}
    disconnect() {}
  };
  context.G6 = {
    Graph: class {
      data() {}
      render() {}
      destroy() {}
    },
  };
  context.ElementPlus = {};
  context.Vue = {
    createApp(definition) {
      return {
        use() {
          return this;
        },
        mount() {
          if (definition.setup) definition.setup();
          return this;
        },
      };
    },
    ref(value) {
      return { value };
    },
    computed(fn) {
      return { get value() { return fn(); } };
    },
    nextTick(fn) {
      if (fn) fn();
    },
    onMounted(fn) {
      if (fn) fn();
    },
    onBeforeUnmount() {},
    watch() {},
  };

  vm.createContext(context);
  const srcScripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi)]
    .map((match) => match[1])
    .filter((src) => !/^https?:\/\//i.test(src));

  for (const script of srcScripts) {
    vm.runInContext(fs.readFileSync(path.join(root, script), "utf8"), context, {
      filename: script,
    });
  }
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of inlineScripts.entries()) {
    const code = match[1].trim();
    if (code) vm.runInContext(code, context, { filename: `${file}#script${index + 1}` });
  }
  return { elements, context };
}

for (const file of ["index.html", "data-management.html", "algorithm-config.html", "analysis.html"]) {
  buildContext(file);
  console.log(`smoked ${file}`);
}
