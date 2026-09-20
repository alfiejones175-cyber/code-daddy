import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const source = path.join(root, "icons/code-daddy/santa-coding.png")
const output = path.join(root, "icons/dev")
const temporary = await mkdtemp(path.join(tmpdir(), "code-daddy-icons-"))
const iconset = path.join(temporary, "Code Daddy.iconset")
await $`mkdir -p ${iconset}`.quiet()

const sizes = {
  "32x32.png": 32,
  "64x64.png": 64,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "dock.png": 256,
  "icon.png": 512,
  "StoreLogo.png": 50,
  ...Object.fromEntries([30, 44, 71, 89, 107, 142, 150, 284, 310].map((size) => [`Square${size}x${size}Logo.png`, size])),
}

await Promise.all(
  Object.entries(sizes).map(([name, size]) =>
    $`sips -z ${size} ${size} ${source} --out ${path.join(output, name)}`.quiet(),
  ),
)

await Promise.all(
  [16, 32, 128, 256, 512].flatMap((size) =>
    [1, 2].map((scale) => {
      const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`
      return $`sips -z ${size * scale} ${size * scale} ${source} --out ${path.join(iconset, name)}`.quiet()
    }),
  ),
)
await $`iconutil -c icns ${iconset} -o ${path.join(output, "icon.icns")}`.quiet()

// ICO supports PNG entries; use the same 256px image as the Dock icon.
const png = await Bun.file(path.join(output, "dock.png")).arrayBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.byteLength, 14)
header.writeUInt32LE(header.byteLength, 18)
await Bun.write(path.join(output, "icon.ico"), Buffer.concat([header, Buffer.from(png)]))
await rm(temporary, { recursive: true })
console.log(`Generated Code Daddy desktop icons in ${output}`)
