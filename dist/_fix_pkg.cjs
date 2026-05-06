const fs = require("fs");
const [, , srcDir, version, outPath, stripShared] = process.argv;
let raw = fs.readFileSync(srcDir + "/package.json", "utf8");
// Strip trailing commas — many editors leave them in hand-maintained JSON
raw = raw.replace(/,\s*([\]}])/g, "$1");
const p = JSON.parse(raw);
p.version = version;
if (stripShared === "true" && p.dependencies && p.dependencies["@vtstech/pi-shared"]) {
  delete p.dependencies["@vtstech/pi-shared"];
  if (Object.keys(p.dependencies).length === 0) delete p.dependencies;
}
fs.writeFileSync(outPath, JSON.stringify(p, null, 2) + "\n");
