// Playlist cover generation — runs entirely client-side on a canvas.
//
// Freshly created API playlists have NO cover, so link previews (iMessage,
// Discord) unfurl blank. We compose one from the playlist's own album art:
//   4+ images → 2×2 mosaic; 1–3 → first image full-bleed; 0 (or CORS/taint
//   failure) → branded fallback (zinc gradient + green equalizer + title).
// Output is a base64 JPEG (no data: prefix) for PUT /playlists/{id}/images,
// which caps covers at 256 KB.

const COVER_SIZE = 640
const MAX_BASE64_BYTES = 256 * 1024

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Spotify's CDN (i.scdn.co) serves `access-control-allow-origin: *`, so
    // anonymous CORS keeps the canvas untainted (toDataURL would throw otherwise).
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), 5000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

// Draw an image into a square cell, cropped center like CSS object-fit: cover.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number
): void {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  ctx.drawImage(img, sx, sy, side, side, x, y, size, size)
}

// Branded fallback when no album art is drawable: dark gradient, the app's
// green equalizer motif, and the playlist title. Matches design.md tokens.
function drawFallback(ctx: CanvasRenderingContext2D, title: string): void {
  const s = COVER_SIZE
  const bg = ctx.createLinearGradient(0, 0, s, s)
  bg.addColorStop(0, '#18181b') // zinc-900
  bg.addColorStop(1, '#09090b') // zinc-950
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, s, s)

  // Equalizer bars (static take on the robot-eq motif)
  const heights = [0.16, 0.34, 0.24, 0.4, 0.2]
  const barW = 28
  const gap = 22
  const totalW = heights.length * barW + (heights.length - 1) * gap
  const baseY = s * 0.58
  ctx.fillStyle = '#22c55e' // green-500
  heights.forEach((h, i) => {
    const barH = s * h
    const x = (s - totalW) / 2 + i * (barW + gap)
    ctx.beginPath()
    ctx.roundRect(x, baseY - barH, barW, barH, barW / 2)
    ctx.fill()
  })

  // Title (clipped to two rough lines' worth of characters)
  ctx.fillStyle = '#fafafa'
  ctx.font = '600 44px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  const label = title.length > 24 ? `${title.slice(0, 23)}…` : title
  ctx.fillText(label, s / 2, s * 0.78, s * 0.86)
}

// Compose the cover and return base64 JPEG (no data: prefix), or null if the
// canvas can't produce one (taint, encoding failure). Never throws.
export async function generatePlaylistCover(
  artUrls: Array<string | null | undefined>,
  title: string
): Promise<string | null> {
  try {
    // Unique, non-empty URLs — same-album tracks shouldn't repeat a tile.
    const unique = [...new Set(artUrls.filter((u): u is string => Boolean(u)))]
    const images = (await Promise.all(unique.slice(0, 8).map(loadImage))).filter(
      (i): i is HTMLImageElement => i !== null
    )

    const canvas = document.createElement('canvas')
    canvas.width = COVER_SIZE
    canvas.height = COVER_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    if (images.length >= 4) {
      const half = COVER_SIZE / 2
      drawCover(ctx, images[0], 0, 0, half)
      drawCover(ctx, images[1], half, 0, half)
      drawCover(ctx, images[2], 0, half, half)
      drawCover(ctx, images[3], half, half, half)
    } else if (images.length > 0) {
      drawCover(ctx, images[0], 0, 0, COVER_SIZE)
    } else {
      drawFallback(ctx, title)
    }

    // Step quality down until we're under Spotify's 256 KB base64 cap.
    for (const quality of [0.85, 0.7, 0.5]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (base64.length <= MAX_BASE64_BYTES) return base64
    }
    return null
  } catch {
    // SecurityError from a tainted canvas, or anything else — cover is optional.
    return null
  }
}
