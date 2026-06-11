# Icons

For the POC, Tauri will use a default placeholder icon if these files aren't here.
Before first `pnpm tauri dev`, run from project root:

```bash
pnpm tauri icon ./your-source.png
```

It generates all required sizes (32x32, 128x128, @2x, .icns) automatically.

If you don't have a logo yet, any 1024×1024 PNG works — even a solid colour with a J letter. The POC's purpose is to validate UX, not branding.
