import * as THREE from "three";

const WHITE = "#f2ede1";
const ORANGE = "#e56a1a";
const ORANGE_DEEP = "#c95712";
const GREY = "#9aa0a6";
const GREY_DARK = "#6d737a";

/**
 * Movie-style body: six circular tool-bay panels (orange ring, white core,
 * orange hub), pole caps, and grey technical details, drawn on an
 * equirectangular canvas so they wrap the sphere without floating geometry.
 */
export function makeBodyTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return finish(canvas);
  }

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  drawPoleCap(ctx, W, H, true);
  drawPoleCap(ctx, W, H, false);

  // Four equatorial panels at longitudes 45/135/225/315 (away from the UV
  // seam). Builders Club die layout: six panels, nearly touching.
  // Panel circles measure 35 degrees of angular radius on the prop
  // (rimstar.org), which is 199px on a 1024px-tall equirect map.
  const centers = [0.125, 0.375, 0.625, 0.875].map((u) => u * W);
  const spokeAngles = [0.6, 2.4, 4.1, 5.5];
  centers.forEach((cx, i) => {
    drawPanel(ctx, cx, H / 2, 199, spokeAngles[i]);
  });

  // Grey ports and greebles in the triangular gaps between panels.
  for (const u of [0.25, 0.5, 0.75]) {
    drawPort(ctx, u * W, H / 2);
    for (const y of [H / 2 - 300, H / 2 + 300]) {
      ctx.fillStyle = GREY;
      ctx.fillRect(u * W - 26, y - 7, 52, 14);
      ctx.fillStyle = GREY_DARK;
      ctx.fillRect(u * W - 26, y - 2, 52, 4);
    }
  }

  return finish(canvas);
}

/** Head: thin orange stripe, wide orange band, grey trim near the rim. */
export function makeHeadTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return finish(canvas);
  }

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 128, W, 16);
  ctx.fillRect(0, 176, W, 38);

  ctx.fillStyle = GREY;
  ctx.fillRect(0, 228, W, 14);
  ctx.fillStyle = GREY_DARK;
  ctx.fillRect(0, 246, W, 10);

  return finish(canvas);
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  spokeAngle: number,
): void {
  // Outer orange ring with a thin echo line just inside, like the film panels.
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  // Faint inner ring.
  ctx.strokeStyle = GREY;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();

  // Hub: orange ring with white core and orange dot.
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ORANGE_DEEP;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.3 + 8, 0, Math.PI * 2);
  ctx.stroke();

  // One orange wedge between hub and inner ring, angle varies per panel.
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, spokeAngle, spokeAngle + 0.9);
  ctx.stroke();

  // Small grey bolts around the inner ring.
  ctx.fillStyle = GREY_DARK;
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i + 0.35;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(a) * radius * 0.7,
      cy + Math.sin(a) * radius * 0.7,
      7,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawPoleCap(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  top: boolean,
): void {
  // The pole panels are the same size as the side ones (die layout); a circle
  // centered on the pole becomes full-width bands in equirect UV.
  const band = (v0: number, height: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(0, top ? v0 : H - v0 - height, W, height);
  };

  band(0, 26, ORANGE); // pole dot
  band(52, 14, ORANGE); // hub ring
  band(112, 8, GREY); // faint inner ring
  band(162, 10, ORANGE); // echo line
  band(182, 32, ORANGE); // main panel ring at 35 degrees
  band(228, 6, GREY); // trim
}

function drawPort(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.strokeStyle = GREY;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = GREY_DARK;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
