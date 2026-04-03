import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';
// The world-atlas package is expected to provide countries-110m.json
import worldData from 'world-atlas/countries-110m.json';

export function createGlobeTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Failed to create canvas context for globe texture');
  }

  // Draw Ocean (base background)
  context.fillStyle = '#0f172a'; // Deep slate blue ocean
  context.fillRect(0, 0, width, height);

  // Setup D3 geographic projection mapped to the canvas size
  const projection = geoEquirectangular()
    .translate([width / 2, height / 2])
    .scale(width / (2 * Math.PI));

  // Create path generator bound to our canvas context
  const path = geoPath()
    .projection(projection)
    .context(context);

  // Extract the GeoJSON features from the TopoJSON geometry
  const countries = topojson.feature(
    worldData as any,
    (worldData as any).objects.countries
  );

  // Draw Countries
  context.beginPath();
  path(countries as any);
  context.fillStyle = '#1e293b'; // Slate countries
  context.fill();
  
  context.lineWidth = 1;
  context.strokeStyle = '#334155'; // Slightly lighter borders
  context.stroke();

  // Draw a subtle equator line for visual anchoring
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  context.lineWidth = 2;
  context.stroke();

  // Create standard Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
