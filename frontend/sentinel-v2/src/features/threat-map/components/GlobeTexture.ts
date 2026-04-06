import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';

export async function createGlobeTexture(): Promise<THREE.CanvasTexture> {
  const width = 2048;
  const height = 1024;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to create canvas context for globe texture');
  }

  // Ocean base
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, width, height);

  try {
    // Fetch topology from public folder (reliable in all prod bundlers)
    const response = await fetch('/countries-110m.json');
    if (!response.ok) throw new Error(`Failed to fetch topology: ${response.status}`);
    const worldData = await response.json();

    const projection = geoEquirectangular()
      .translate([width / 2, height / 2])
      .scale(width / (2 * Math.PI));

    const path = geoPath().projection(projection).context(context);

    const countries = topojson.feature(
      worldData as any,
      (worldData as any).objects.countries
    );

    // Countries fill
    context.beginPath();
    path(countries as any);
    context.fillStyle = '#1e293b';
    context.fill();

    // Country borders
    context.lineWidth = 1;
    context.strokeStyle = '#334155';
    context.stroke();

    // Equator guide line
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    context.lineWidth = 2;
    context.stroke();
  } catch (err) {
    // Fallback: render a simple grid pattern so the globe is visible even without topology
    console.warn('[Globe] Topology load failed — using fallback texture:', err);
    context.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    context.lineWidth = 1;
    // Longitude lines
    for (let x = 0; x <= width; x += width / 18) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    // Latitude lines
    for (let y = 0; y <= height; y += height / 9) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
