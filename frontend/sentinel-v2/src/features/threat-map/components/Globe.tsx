import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { createGlobeTexture } from './GlobeTexture';

interface GlobeRef {
  addEvent: (lat: number, lon: number, isThreat: boolean) => void;
}

// Singapore — backend server location
const SERVER_LAT = 1.3521;
const SERVER_LON = 103.8198;

export const Globe = React.forwardRef<GlobeRef, {}>((props, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let animationId: number;
    let renderer: THREE.WebGLRenderer | null = null;
    let texture: THREE.CanvasTexture | null = null;
    let disposed = false;

    const init = async () => {
      try {
        // Load texture asynchronously — this is the key fix
        texture = await createGlobeTexture();
        if (disposed) { texture.dispose(); return; }
      } catch (err) {
        console.error('[Globe] Texture creation failed:', err);
        if (!disposed) setError('Failed to load globe texture.');
        return;
      }

      if (!mountRef.current || disposed) return;

      setLoading(false);

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.z = 3;

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(window.devicePixelRatio);
      mountRef.current.appendChild(renderer.domElement);

      // Group holds rotating earth + markers
      const earthGroup = new THREE.Group();
      scene.add(earthGroup);

      // Coordinate → 3D position helper
      const getCartesian = (lat: number, lon: number, radius = 1) => {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
          -(radius * Math.sin(phi) * Math.cos(theta)),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
      };

      // Globe mesh
      const geometry = new THREE.SphereGeometry(1, 64, 64);
      const material = new THREE.MeshBasicMaterial({ map: texture! });
      const globeMesh = new THREE.Mesh(geometry, material);
      earthGroup.add(globeMesh);

      // Atmosphere glow ring
      const atmosGeo = new THREE.SphereGeometry(1.015, 64, 64);
      const atmosMat = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.04,
        side: THREE.FrontSide,
      });
      earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

      // Server dot (blue — Singapore)
      const serverPos = getCartesian(SERVER_LAT, SERVER_LON, 1.001);
      const serverGeo = new THREE.CircleGeometry(0.02, 16);
      const serverMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide });
      const serverMesh = new THREE.Mesh(serverGeo, serverMat);
      serverMesh.position.copy(serverPos);
      serverMesh.lookAt(new THREE.Vector3(0, 0, 0));
      earthGroup.add(serverMesh);

      // Dynamic event tracking
      const LIFESPAN = 3000;
      const MAX_EVENTS = 50;
      let activeDots: { mesh: THREE.Mesh; createdAt: number }[] = [];
      let activeArcs: { line: THREE.Line; material: THREE.LineBasicMaterial; createdAt: number }[] = [];

      const addEvent = (lat: number, lon: number, isThreat: boolean) => {
        const color = isThreat ? 0xef4444 : 0x22c55e;

        // Source dot
        const pos = getCartesian(lat, lon, 1.002);
        const dotGeo = new THREE.CircleGeometry(0.015, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 1 });
        const dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.copy(pos);
        dotMesh.lookAt(new THREE.Vector3(0, 0, 0));
        earthGroup.add(dotMesh);
        activeDots.push({ mesh: dotMesh, createdAt: Date.now() });

        if (activeDots.length > MAX_EVENTS) {
          const old = activeDots.shift();
          if (old) { earthGroup.remove(old.mesh); old.mesh.geometry.dispose(); (old.mesh.material as THREE.Material).dispose(); }
        }

        // Arc to server
        const points = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const interpolated = new THREE.Vector3().lerpVectors(pos, serverPos, t);
          interpolated.normalize().multiplyScalar(1 + Math.sin(t * Math.PI) * 0.2);
          points.push(interpolated);
        }
        const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
        const arcMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        earthGroup.add(arcLine);
        activeArcs.push({ line: arcLine, material: arcMat, createdAt: Date.now() });

        if (activeArcs.length > MAX_EVENTS) {
          const old = activeArcs.shift();
          if (old) { earthGroup.remove(old.line); old.line.geometry.dispose(); old.material.dispose(); }
        }
      };

      // Expose addEvent via the forwarded ref
      if (ref && typeof ref !== 'function') {
        ref.current = { addEvent };
      }

      // Animation loop
      const animate = () => {
        animationId = requestAnimationFrame(animate);
        earthGroup.rotation.y += 0.001;

        const now = Date.now();
        activeDots.forEach(obj => {
          const progress = (now - obj.createdAt) / LIFESPAN;
          (obj.mesh.material as THREE.MeshBasicMaterial).opacity =
            progress >= 1 ? 0 : 1 - Math.pow(progress, 3);
        });
        activeArcs.forEach(obj => {
          const progress = (now - obj.createdAt) / LIFESPAN;
          obj.material.opacity = progress >= 1 ? 0 : 0.6 * (1 - Math.pow(progress, 2));
        });

        renderer!.render(scene, camera);
      };
      animate();

      const handleResize = () => {
        if (!mountRef.current || !renderer) return;
        const nw = mountRef.current.clientWidth;
        const nh = mountRef.current.clientHeight;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', handleResize);

      // Cleanup stored in closure so return below can reference it
      (init as any)._cleanup = () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer?.dispose();
        texture?.dispose();
        if (mountRef.current && renderer?.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      if ((init as any)._cleanup) (init as any)._cleanup();
    };
  }, [ref]);

  if (error) {
    return (
      <div className="w-full h-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error)', flexDirection: 'column', gap: 8 }}>
        <span className="material-icons" style={{ fontSize: 40 }}>public_off</span>
        <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>{error}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--on-surface-variant)' }}>
          <span className="material-icons" style={{ fontSize: 40, opacity: 0.4, animation: 'spin 2s linear infinite' }}>public</span>
          <span style={{ fontSize: '0.8125rem', opacity: 0.5 }}>Loading globe…</span>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full cursor-move" />
    </div>
  );
});

Globe.displayName = 'Globe';
