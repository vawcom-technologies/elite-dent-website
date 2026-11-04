/**
 * Shrinks a GLB without changing how it looks:
 *   - texture: PNG -> WebP at the same resolution
 *   - geometry: meshopt compression of the already-quantized vertices. Positions are NOT
 *     re-quantized, because the smile and neck shaders in site-guide-agent.js use raw mesh
 *     coordinates.
 *   Used for: femalebot/femalebot-guide-lite.glb -> femalebot-guide-web.glb (guide avatar),
 *             shinytooth/tooth-lite.glb -> tooth-web.glb (services hero)
 *
 *   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
 *     @gltf-transform/functions@4.5.1 meshoptimizer@0.22.0
 *   node scripts/optimize-glb.cjs <in.glb> <out.glb>   (needs cwebp on PATH)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } = require("@gltf-transform/extensions");
const { reorder } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer");

const [IN, OUT] = process.argv.slice(2);

(async () => {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(IN);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avatar-"));
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() !== "image/png") continue;
    const png = path.join(tmp, "t.png");
    const webp = path.join(tmp, "t.webp");
    fs.writeFileSync(png, tex.getImage());
    execFileSync("cwebp", ["-quiet", "-q", "90", "-m", "6", png, "-o", webp]);
    tex.setImage(fs.readFileSync(webp)).setMimeType("image/webp").setURI("");
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);

  await doc.transform(reorder({ encoder: MeshoptEncoder }));
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await io.write(OUT, doc);
  console.log(`${(fs.statSync(IN).size / 1e6).toFixed(2)} MB -> ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
})();
