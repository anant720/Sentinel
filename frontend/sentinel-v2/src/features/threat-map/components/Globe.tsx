import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { createGlobeTexture } from './GlobeTexture';

interface DotProps {
  lat: number;
  lon: number;
  color: number;
  size: number;
  duration: number; // For fading arcs
  timestamp: number;
}

interface GlobeRef {
  addEvent: (lat: number, lon: number, isThreat: boolean) => void;
}

// Singapore Coordinates
const SERVER_LAT = 1.3521;
const SERVER_LON = 103.8198;

export const Globe = React.forwardRef<GlobeRef, {}>((props, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Core Setup
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 3;
    
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    
    // Group to hold the rotating earth + markers
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    // Coordinate Conversion Helper
    const getCartesian = (lat: number, lon: number, radius = 1) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -(radius * Math.sin(phi) * Math.cos(theta)),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    };
    
    // 1. Globe Mesh
    const texture = createGlobeTexture();
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const globeMesh = new THREE.Mesh(geometry, material);
    earthGroup.add(globeMesh);

    // 2. Server Dot (Blue)
    const serverPos = getCartesian(SERVER_LAT, SERVER_LON, 1.001);
    const serverGeo = new THREE.CircleGeometry(0.02, 16);
    const serverMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide });
    const serverMesh = new THREE.Mesh(serverGeo, serverMat);
    serverMesh.position.copy(serverPos);
    serverMesh.lookAt(new THREE.Vector3(0, 0, 0));
    earthGroup.add(serverMesh);
    
    // 3. Dynamic Tracking State
    let activeDots: { mesh: THREE.Mesh; createdAt: number }[] = [];
    let activeArcs: { line: THREE.Line; material: THREE.LineBasicMaterial; createdAt: number }[] = [];
    
    const LIFESPAN = 3000; // 3 seconds
    const MAX_EVENTS = 50;
    
    // Add Event Function exposed via ref
    const addEvent = (lat: number, lon: number, isThreat: boolean) => {
        const color = isThreat ? 0xef4444 : 0x22c55e; // Red if threat, Green if normal
        
        // --- Plot Dot ---
        const pos = getCartesian(lat, lon, 1.002);
        const dotGeo = new THREE.CircleGeometry(0.015, 12);
        const dotMat = new THREE.MeshBasicMaterial({ 
            color, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 1 
        });
        const dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.copy(pos);
        dotMesh.lookAt(new THREE.Vector3(0, 0, 0));
        earthGroup.add(dotMesh);
        
        activeDots.push({ mesh: dotMesh, createdAt: Date.now() });
        
        // Apply upper cap
        if (activeDots.length > MAX_EVENTS) {
            const old = activeDots.shift();
            if (old) {
                earthGroup.remove(old.mesh);
                old.mesh.geometry.dispose();
                (old.mesh.material as THREE.Material).dispose();
            }
        }
        
        // --- Draw Arc ---
        // Interpolate points between source and server to form arch
        const points = [];
        const numPoints = 20;
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            const interpolated = new THREE.Vector3().lerpVectors(pos, serverPos, t);
            interpolated.normalize();
            
            // Arch height parabola
            const archHeight = Math.sin(t * Math.PI) * 0.2; 
            interpolated.multiplyScalar(1 + archHeight);
            
            points.push(interpolated);
        }
        const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
        const arcMat = new THREE.LineBasicMaterial({ 
            color, 
            transparent: true, 
            opacity: 0.6 
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        earthGroup.add(arcLine);
        
        activeArcs.push({ line: arcLine, material: arcMat, createdAt: Date.now() });
        
        if (activeArcs.length > MAX_EVENTS) {
            const old = activeArcs.shift();
            if (old) {
                earthGroup.remove(old.line);
                old.line.geometry.dispose();
                old.material.dispose();
            }
        }
    };
    
    // Bind to the ref
    if (ref && typeof ref !== 'function') {
        ref.current = { addEvent };
    }

    // Single Animation Loop
    let animationId: number;
    const animate = () => {
        animationId = requestAnimationFrame(animate);
        
        // Continuous slow rotation
        earthGroup.rotation.y += 0.001;
        
        const now = Date.now();
        
        // Fade logic for dots
        activeDots.forEach((obj, idx) => {
            const age = now - obj.createdAt;
            const progress = age / LIFESPAN;
            const mat = obj.mesh.material as THREE.MeshBasicMaterial;
            if (progress >= 1) {
                mat.opacity = 0;
            } else {
                mat.opacity = 1 - Math.pow(progress, 3); // stay bright longer, fade quickly at end
            }
        });
        
        // Fade logic for arcs
        activeArcs.forEach((obj) => {
            const age = now - obj.createdAt;
            const progress = age / LIFESPAN;
            if (progress >= 1) {
                obj.material.opacity = 0;
            } else {
                obj.material.opacity = 0.6 * (1 - Math.pow(progress, 2));
            }
        });
        
        renderer.render(scene, camera);
    };
    animate();
    
    const handleResize = () => {
      if (!mountRef.current) return;
      const nw = mountRef.current.clientWidth;
      const nh = mountRef.current.clientHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      texture.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [ref]);

  return <div ref={mountRef} className="w-full h-full cursor-move" />;
});

Globe.displayName = 'Globe';
