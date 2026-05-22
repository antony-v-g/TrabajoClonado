import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, "..", "dist");
const destDir = path.join(__dirname, "..", "backend", "wwwroot");

function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function syncBinWwwroot(projectRoot) {
  const binRoot = path.join(projectRoot, "backend", "bin");
  if (!fs.existsSync(binRoot)) return;

  const wwwrootDirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "wwwroot") wwwrootDirs.push(full);
        else walk(full);
      }
    }
  };
  walk(binRoot);

  for (const binWwwroot of wwwrootDirs) {
    console.log(`Syncing ${path.relative(projectRoot, binWwwroot)}...`);
    emptyDir(binWwwroot);
    copyDir(destDir, binWwwroot);
  }
}

if (fs.existsSync(srcDir)) {
  const projectRoot = path.join(__dirname, "..");
  console.log("Cleaning backend/wwwroot...");
  emptyDir(destDir);
  console.log("Copying frontend build files to backend wwwroot...");
  copyDir(srcDir, destDir);

  const buildId = new Date().toISOString();
  fs.writeFileSync(
    path.join(destDir, "build-id.txt"),
    buildId,
    "utf8"
  );
  console.log(`Build id: ${buildId}`);

  const indexPath = path.join(destDir, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");
    const cacheBust = buildId.replace(/[:.]/g, "-");
    html = html.replace(
      /(src|href)="(\/assets\/[^"]+)"/g,
      `$1="$2?v=${cacheBust}"`
    );
    fs.writeFileSync(indexPath, html, "utf8");
  }

  syncBinWwwroot(projectRoot);
  console.log("Frontend files copied successfully!");
} else {
  console.log("dist directory not found. Run npm run build first.");
  process.exit(1);
}
