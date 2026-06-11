#!/usr/bin/env bash
# Generates the icon set Tauri needs to compile.
# Creates placeholder teal icons (matches the JARVIS brand palette).
# Run once before first `pnpm tauri dev`. Replace with real artwork later
# via `pnpm tauri icon path/to/your-logo.png`.
#
# Uses macOS built-ins (python3 + tauri CLI) — no extra dependencies.

set -e

cd "$(dirname "$0")/.."

# 1. Generate a 1024x1024 solid teal PNG using Python stdlib (zlib + struct).
#    Hex 0d8073 = JARVIS brand "deep teal".
python3 - <<'PYEOF'
import struct, zlib

def make_png(filename, size, rgb):
    def chunk(ctype, data):
        crc = zlib.crc32(ctype + data) & 0xffffffff
        return struct.pack('>I', len(data)) + ctype + data + struct.pack('>I', crc)
    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))  # 8-bit RGB
    row  = bytes([0]) + bytes(rgb) * size                                       # filter byte + pixels
    png += chunk(b'IDAT', zlib.compress(row * size))
    png += chunk(b'IEND', b'')
    with open(filename, 'wb') as f:
        f.write(png)

make_png('icon-source.png', 1024, [0x0d, 0x80, 0x73])
print("Generated 1024x1024 teal source PNG")
PYEOF

# 2. Let Tauri's CLI generate every required size + .icns + .ico.
echo ""
echo "Generating Tauri icon set (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico)..."
pnpm tauri icon icon-source.png

# 3. Cleanup
rm -f icon-source.png

echo ""
echo "Icons generated in src-tauri/icons/. Next:"
echo "  pnpm tauri dev"
