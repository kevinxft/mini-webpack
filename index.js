import fs from "fs";
import path from "path";
import parser from "@babel/parser";
import traverse from "@babel/traverse";
import ejs from "ejs";
import { transformFromAst } from "babel-core";
import { jsonLoader } from "./jsonLoader.js";
import { ChangeOutputPath } from "./ChangeOutputPath.js";
import { SyncHook } from "tapable";
let id = 0;

const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.json$/,
        use: [jsonLoader],
      },
    ],
  },
  plugins: [new ChangeOutputPath()],
};

const hooks = {
  emitFile: new SyncHook(["context"]), //这里要生命参数
};

function createAsset(filePath) {
  // 获取内容
  // 获取依赖关系
  let source = fs.readFileSync(filePath, { encoding: "utf8" });
  console.log(source);

  // initLoader
  const loaders = webpackConfig.module.rules;
  const loaderContext = {
    addDeps(dep) {
      console.log("addDeps", dep);
    },
  };

  loaders.forEach(({ test, use }) => {
    if (test.test(filePath)) {
      if (Array.isArray(use)) {
        use.reverse().forEach(fn => {
          source = fn.call(loaderContext, source);
        });
      } else {
        source = use.call(loaderContext, source);
      }
    }
  });

  const ast = parser.parse(source, { sourceType: "module" });

  const deps = [];
  traverse.default(ast, {
    ImportDeclaration({ node }) {
      deps.push(node.source.value);
    },
  });
  const { code } = transformFromAst(ast, null, {
    presets: ["env"],
  });
  console.log(code);

  return {
    filePath,
    code,
    deps,
    mapping: {},
    id: id++,
  };
}

// const asset = createAsset()
// console.log(asset)

function createGraph() {
  const mainAsset = createAsset("./example/main.js");

  const queue = [mainAsset];

  for (const asset of queue) {
    asset.deps.forEach(relativePath => {
      const child = createAsset(path.resolve("./example", relativePath));
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  return queue;
}

function initPlugins() {
  const plugins = webpackConfig.plugins;

  plugins.forEach(plugin => {
    plugin.apply(hooks);
  });
}
initPlugins();
const graph = createGraph();

function build(graph) {
  const template = fs.readFileSync("./bundle.ejs", { encoding: "utf8" });

  const data = graph.map(asset => {
    const { id, code, mapping } = asset;
    return {
      id,
      code,
      mapping,
    };
  });
  console.log(data);
  let outputPath = "./dist/bundle.js";
  const code = ejs.render(template, { data });
  const context = {
    changeOutputPath(path) {
      outputPath = path;
    },
  };
  hooks.emitFile.call(context);

  fs.writeFileSync(outputPath, code);
}
build(graph);
