/**
 * src/core/plugin-loader.ts — Canonical PluginLoader location.
 * Moved from src/lib/plugin-loader.ts. lib version re-exports this.
 */
import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';

import { DetectionModule } from './detection.types.js';

export class PluginLoader {
    private modulesDir: string;
    private loadedModules: Map<string, DetectionModule> = new Map();

    constructor(modulesDir?: string) {
        // Resolve modules relative to the current source/dist directory
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const normalizedDir = process.platform === 'win32' ? __dirname.substring(1) : __dirname;
        
        this.modulesDir = modulesDir || path.resolve(normalizedDir, '..', 'modules');
        
        if (!fs.existsSync(this.modulesDir)) {
            logger.warn(`Modules directory not found at ${this.modulesDir}, creating...`);
            fs.mkdirSync(this.modulesDir, { recursive: true });
        }
    }

    async loadModules(fastify?: FastifyInstance) {
        const files = fs.readdirSync(this.modulesDir);
        logger.debug(`Scanning ${this.modulesDir} for modules. Found ${files.length} files.`);

        for (const file of files) {
            const fullPath = path.join(this.modulesDir, file);
            const stat = fs.statSync(fullPath);

            // In production (dist), we load .js. In development (src), we load .ts.
             const isLoadable = (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts');
 
             if (stat.isFile() && isLoadable) {
                try {
                    // Correct absolute path for ESM import on Linux/Render
                    const fileUrl = `file://${fullPath}`;
                    const imported = await import(fileUrl);
                    const plugin: DetectionModule = imported.default || imported;

                    if (this.validateModule(plugin)) {
                        this.loadedModules.set(plugin.name, plugin);
                        logger.info(`📦 Module loaded: ${plugin.name}`);
                    }
                } catch (err) {
                    logger.error(`Failed to load module ${file}:`, err);
                }
            }
        }

        if (fastify) void fastify; // fastify reference kept for future hook registration
    }

    private validateModule(plugin: unknown): plugin is DetectionModule {
        const required = ['name', 'subscribesTo', 'execute'];
        for (const field of required) {
            if (!(plugin as Record<string, unknown>)[field]) {
                logger.warn(`Invalid module skipped: Missing ${field}`);
                return false;
            }
        }
        return true;
    }

    getModule(name: string) {
        return this.loadedModules.get(name);
    }

    getAllModules() {
        return Array.from(this.loadedModules.values());
    }
}
