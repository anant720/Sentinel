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

    constructor(modulesDir: string = path.join(process.cwd(), 'modules')) {
        this.modulesDir = modulesDir;
        if (!fs.existsSync(this.modulesDir)) {
            fs.mkdirSync(this.modulesDir, { recursive: true });
        }
    }

    async loadModules(fastify?: FastifyInstance) {
        const files = fs.readdirSync(this.modulesDir);

        for (const file of files) {
            const fullPath = path.join(this.modulesDir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory() || file.endsWith('.ts') || file.endsWith('.js')) {
                try {
                    const modulePath =
                        file.endsWith('.ts') || file.endsWith('.js')
                            ? fullPath
                            : path.join(fullPath, 'index.ts');

                    const imported = await import(`file://${modulePath}`);
                    const plugin: DetectionModule = imported.default || imported;

                    if (this.validateModule(plugin)) {
                        this.loadedModules.set(plugin.name, plugin);
                        logger.info(`📦 Module loaded: ${plugin.name}`);
                    }
                } catch (err) {
                    logger.error(`Failed to load module ${file}`, err);
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
