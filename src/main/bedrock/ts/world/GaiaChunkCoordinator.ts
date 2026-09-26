import { 
    world, 
    system, 
    Dimension, 
    Player, 
    Vector3, 
    BlockPermutation, 
    ScoreboardObjective,
    Block
} from "@minecraft/server";

declare module "@minecraft/server" {
    interface Dimension {
        placeFeature(featureIdentifier: string, location: Vector3): boolean;
        getTopmostBlock?(location: { x: number; z: number } | Vector3): Block | undefined;
    }
}

export const GAIA_DIMENSION_ID: string = "gaiadimension:gaia_dimension";
export const GAIA_FEATURE_ID: string = "gaiadimension:gen/base/chunk_sequence";
export const SCOREBOARD_OBJECTIVE_GAIA: string = "gaia_chunks";
export const MAX_TICK_BUDGET_MS: number = 0.45;
export const MAX_PLACEMENTS_PER_TICK: number = 6;
export const DEFAULT_RADIUS: number = 3;

export interface ChunkCoord {
    cx: number;
    cz: number;
}

export interface CandidateChunk extends ChunkCoord {
    ring: number;
    distSq: number;
}

/** L1 Hot In-Memory Cache of generated chunk keys: `${GAIA_DIMENSION_ID}:${cx},${cz}` */
export const generatedChunks: Set<string> = new Set<string>();

/** Active chunk generation queue tracking prioritized ungenerated chunks */
export const chunkGenerationQueue: CandidateChunk[] = [];

/**
 * Bitpacks two 32-bit signed chunk coordinates into an unsigned 64-bit compact hex key.
 * Guaranteed deterministic and invertible across the entire Minecraft coordinate space.
 */
export function packChunkCoords(cx: number, cz: number): string {
    const ux = BigInt.asUintN(32, BigInt(Math.floor(cx)));
    const uz = BigInt.asUintN(32, BigInt(Math.floor(cz)));
    return (ux | (uz << 32n)).toString(16);
}

/**
 * Unpacks a 64-bit hexadecimal key back into 32-bit signed chunk coordinates.
 */
export function unpackChunkCoords(key: string): ChunkCoord {
    const val = BigInt("0x" + key);
    const cx = Number(BigInt.asIntN(32, val & 0xFFFFFFFFn));
    const cz = Number(BigInt.asIntN(32, val >> 32n));
    return { cx, cz };
}

/**
 * Retrieves or registers the world scoreboard objective for persistent chunk tracking.
 */
export function getScoreboardObjective(): ScoreboardObjective | null {
    try {
        if (!world || !world.scoreboard) return null;
        let obj = world.scoreboard.getObjective(SCOREBOARD_OBJECTIVE_GAIA);
        if (!obj) {
            obj = world.scoreboard.addObjective(SCOREBOARD_OBJECTIVE_GAIA, SCOREBOARD_OBJECTIVE_GAIA);
        }
        return obj ?? null;
    } catch {
        return null;
    }
}

/**
 * Checks whether a chunk is already generated via hot L1 cache or persistent world scoreboard.
 */
export function isChunkGenerated(cx: number, cz: number): boolean {
    const memKey = `${GAIA_DIMENSION_ID}:${cx},${cz}`;
    if (generatedChunks.has(memKey)) return true;

    const obj = getScoreboardObjective();
    if (!obj) return false;

    const hexKey = packChunkCoords(cx, cz);
    try {
        if (typeof (obj as any).getScore === "function") {
            const score = obj.getScore(hexKey);
            if (score !== undefined) {
                generatedChunks.add(memKey);
                return true;
            }
        }
        if (typeof (obj as any).hasParticipant === "function" && (obj as any).hasParticipant(hexKey)) {
            generatedChunks.add(memKey);
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

/**
 * Marks a chunk as generated in both L1 memory cache and persistent world scoreboard database.
 */
export function markChunkGenerated(cx: number, cz: number): void {
    const memKey = `${GAIA_DIMENSION_ID}:${cx},${cz}`;
    generatedChunks.add(memKey);

    const obj = getScoreboardObjective();
    if (!obj) return;

    const hexKey = packChunkCoords(cx, cz);
    try {
        obj.setScore(hexKey, 1);
    } catch {
        // Safe fallback
    }
}

/**
 * Checks whether a chunk in Gaia Dimension is physically missing terrain (air at bedrock level y=0).
 */
export function isChunkPhysicallyMissing(dimension: Dimension, cx: number, cz: number): boolean {
    if (!dimension || typeof dimension.getBlock !== "function") return false;
    try {
        const b = dimension.getBlock({ x: cx * 16 + 8, y: 0, z: cz * 16 + 8 });
        return b !== undefined && b !== null && b.typeId === "minecraft:air";
    } catch {
        return false;
    }
}

/**
 * Builds a safe 5x5 landing platform at y=64 and clears air at y=65..67.
 */
export function buildSafeLandingPlatform(
    dimension: Dimension, 
    x: number | { x: number; y?: number; z: number } = 0, 
    y: number = 65, 
    z: number = 0
): void {
    if (typeof x === "object" && x !== null) {
        y = x.y !== undefined ? x.y : 65;
        z = x.z !== undefined ? x.z : 0;
        x = x.x !== undefined ? x.x : 0;
    }

    const cx = Math.floor(x as number);
    const cz = Math.floor(z);
    const targetY = Math.floor(y);
    const floorY = targetY - 1; // Default 64 at spawn

    let platformPerm: BlockPermutation | null = null;
    try {
        platformPerm = BlockPermutation.resolve("gaiadimension:agate_block");
    } catch {
        try {
            platformPerm = BlockPermutation.resolve("minecraft:obsidian");
        } catch {
            platformPerm = null;
        }
    }

    let airPerm: BlockPermutation | null = null;
    try {
        airPerm = BlockPermutation.resolve("minecraft:air");
    } catch {
        airPerm = null;
    }

    // Construct 5x5 platform floor at floorY (default y = 64)
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            const bx = cx + dx;
            const bz = cz + dz;

            if (platformPerm) {
                try {
                    const floorBlock = dimension.getBlock({ x: bx, y: floorY, z: bz });
                    if (floorBlock) {
                        floorBlock.setPermutation(platformPerm);
                    }
                } catch {}
            }

            // Headroom clearance above floor (default y = 65, 66, 67) to prevent suffocation
            if (airPerm) {
                for (let dy = floorY + 1; dy <= floorY + 3; dy++) {
                    try {
                        const spaceBlock = dimension.getBlock({ x: bx, y: dy, z: bz });
                        if (spaceBlock && spaceBlock.typeId !== "minecraft:air") {
                            spaceBlock.setPermutation(airPerm);
                        }
                    } catch {}
                }
            }
        }
    }
}

/**
 * Pre-generates terrain around a specific chunk coordinate (e.g. at spawn or arrival portal).
 * Self-heals any chunk where bedrock is physically missing despite cache or scoreboard state.
 */
export function generateSpawnTerrain(
    dimension: Dimension, 
    chunkCenterX: number = 0, 
    chunkCenterZ: number = 0, 
    chunkRadius: number = 2
): void {
    if (!dimension || typeof dimension.placeFeature !== "function") return;

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
        for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
            const cx = chunkCenterX + dx;
            const cz = chunkCenterZ + dz;

            if (isChunkGenerated(cx, cz)) {
                if (!isChunkPhysicallyMissing(dimension, cx, cz)) {
                    continue;
                }
                generatedChunks.delete(`${GAIA_DIMENSION_ID}:${cx},${cz}`);
            }

            try {
                const placed = dimension.placeFeature(GAIA_FEATURE_ID, { x: cx * 16, y: 0, z: cz * 16 });
                if (placed) {
                    markChunkGenerated(cx, cz);
                }
            } catch {}
        }
    }
}

/**
 * High-resolution clock helper.
 */
export function getClock(): number {
    return (typeof performance !== "undefined" && typeof performance.now === "function") 
        ? performance.now() 
        : Date.now();
}

/**
 * Evaluates and generates procedural Molang terrain chunks around a player in Gaia Dimension.
 * Adheres to:
 * - 0.45ms strict tick budget ceiling
 * - Max 6 chunk placements per tick
 * - Zero-push GC invariant in hot loops
 * - Concentric proximity ring prioritization (Rings 0, 1, 2) with active horizon gating
 * - Quantum stabilization shield (void fall protection, topmost block teleport, slow falling & resistance 5)
 */
export function updatePlayerChunks(
    player: Player, 
    radius: number = DEFAULT_RADIUS, 
    tickStart: number = getClock(), 
    maxBudgetMs: number = MAX_TICK_BUDGET_MS
): number {
    if (!player || !player.isValid || !player.dimension) return 0;
    const dim = player.dimension;
    if (dim.id !== GAIA_DIMENSION_ID) return 0;

    const loc = player.location;
    if (!loc) return 0;

    const centerChunkX = Math.floor(loc.x / 16);
    const centerChunkZ = Math.floor(loc.z / 16);

    // --- Void Fall Prevention & Quantum Stabilization Shield ---
    // 1. Bedrock floor is at y=0. If player falls below bedrock, recover immediately to safe elevation
    if (loc.y < 0) {
        let safeX = loc.x;
        let safeZ = loc.z;
        let safeY = 65;

        // Invalidate chunk beneath player to trigger immediate regeneration
        generatedChunks.delete(`${GAIA_DIMENSION_ID}:${centerChunkX},${centerChunkZ}`);
        try {
            const placed = dim.placeFeature(GAIA_FEATURE_ID, { x: centerChunkX * 16, y: 0, z: centerChunkZ * 16 });
            if (placed) {
                markChunkGenerated(centerChunkX, centerChunkZ);
            }
        } catch {}

        try {
            if (typeof dim.getTopmostBlock === "function") {
                const top = dim.getTopmostBlock({ x: Math.floor(safeX), z: Math.floor(safeZ) });
                if (top && top.location && top.location.y > 0) {
                    safeY = top.location.y + 1;
                } else {
                    safeY = 93;
                }
            }
        } catch {
            safeY = 93;
        }

        // If deep in void or ungenerated, return to safe spawn platform at surface
        if (loc.y < -15 || !isChunkGenerated(centerChunkX, centerChunkZ)) {
            safeX = 0.5;
            safeZ = 0.5;
            safeY = 93;
            try {
                if (typeof dim.getTopmostBlock === "function") {
                    const spawnTop = dim.getTopmostBlock({ x: 0, z: 0 });
                    if (spawnTop && spawnTop.location && spawnTop.location.y > 0) {
                        safeY = spawnTop.location.y + 1;
                    }
                }
            } catch {}
            buildSafeLandingPlatform(dim, 0, safeY, 0);
        }

        try {
            player.teleport({ x: safeX, y: safeY, z: safeZ }, { dimension: dim });
            if (typeof player.addEffect === "function") {
                player.addEffect("slow_falling", 60, { showParticles: false, amplifier: 0 });
                player.addEffect("resistance", 60, { showParticles: false, amplifier: 4 });
            }
            if (player.onScreenDisplay && typeof (player.onScreenDisplay as any).setActionBar === "function") {
                (player.onScreenDisplay as any).setActionBar("§b§l[GAIA ANOMALY] §eSpace-time anomaly: Void fall prevented!");
            }
            if (typeof (player as any).playSound === "function") {
                (player as any).playSound("portal.travel", { pitch: 1.8, volume: 0.7 });
            }
        } catch {}
    }

    // 2. Immediate footing priority (Ring 0): Ensure chunk directly beneath player is generated & present
    const chunkUnderneathMissing = !isChunkGenerated(centerChunkX, centerChunkZ) 
        || isChunkPhysicallyMissing(dim, centerChunkX, centerChunkZ);

    if (chunkUnderneathMissing) {
        generatedChunks.delete(`${GAIA_DIMENSION_ID}:${centerChunkX},${centerChunkZ}`);
        try {
            const placed = dim.placeFeature(GAIA_FEATURE_ID, { x: centerChunkX * 16, y: 0, z: centerChunkZ * 16 });
            if (placed) {
                markChunkGenerated(centerChunkX, centerChunkZ);
            }
        } catch {}

        if (loc.y < 60) {
            try {
                if (typeof player.addEffect === "function") {
                    player.addEffect("slow_falling", 40, { showParticles: false, amplifier: 0 });
                }
            } catch {}
        }
    }

    // 3. Directional lead detection
    let dirX = 0;
    let dirZ = 0;
    let isMoving = false;
    try {
        const vel = (player as any).getVelocity?.();
        if (vel) {
            const speedSq = vel.x * vel.x + vel.z * vel.z;
            if (speedSq > 0.005) {
                const speed = Math.sqrt(speedSq);
                dirX = vel.x / speed;
                dirZ = vel.z / speed;
                isMoving = true;
            }
        }
    } catch {
        isMoving = false;
    }

    // 4. Proximity Analysis: Determine the minimum ungenerated ring distance around player
    let minUngeneratedRing = radius + 1;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const cx = centerChunkX + dx;
            const cz = centerChunkZ + dz;
            if (!isChunkGenerated(cx, cz)) {
                const r = Math.max(Math.abs(dx), Math.abs(dz));
                if (r < minUngeneratedRing) {
                    minUngeneratedRing = r;
                }
            }
        }
    }

    if (minUngeneratedRing > radius) {
        chunkGenerationQueue.length = 0;
        return 0; // All chunks in radius already generated
    }

    // 5. Immediate proximity prioritization & active horizon gating:
    // If chunks in immediate player proximity (ring <= 1) are ungenerated, only process ring <= 1.
    // If ring 1 is complete and ring 2 has ungenerated chunks, only process ring <= 2.
    // Far-away queued chunks (ring > maxActiveRing) are discarded/thrown for later.
    const maxActiveRing = minUngeneratedRing <= 1 ? 1 : (minUngeneratedRing === 2 ? 2 : radius);

    // 6. Collect candidate ungenerated chunks strictly within the active proximity horizon
    // ZERO-PUSH GC INVARIANT: index assignment candidates[candidates.length] = ...
    const candidates: CandidateChunk[] = [];
    for (let dx = -maxActiveRing; dx <= maxActiveRing; dx++) {
        for (let dz = -maxActiveRing; dz <= maxActiveRing; dz++) {
            const cx = centerChunkX + dx;
            const cz = centerChunkZ + dz;
            if (isChunkGenerated(cx, cz)) continue;

            const ring = Math.max(Math.abs(dx), Math.abs(dz));
            if (ring > maxActiveRing) continue;

            const rawDistSq = dx * dx + dz * dz;
            // Strict proximity tier weighting: each ring tier is separated by 1000 units
            let distSq = ring * 1000 + rawDistSq;

            // Directional lead tie-breaker: strictly within the same proximity ring
            if (isMoving && (dx * dirX + dz * dirZ > 0)) {
                distSq -= 10;
            }
            candidates[candidates.length] = { cx, cz, ring, distSq };
        }
    }

    if (candidates.length === 0) {
        chunkGenerationQueue.length = 0;
        return 0;
    }

    // Nearest-first distance sorting with directional bias
    candidates.sort((a, b) => a.distSq - b.distSq);

    // Synchronize active chunk generation queue for inspection & telemetry
    chunkGenerationQueue.length = 0;
    for (let i = 0; i < candidates.length; i++) {
        chunkGenerationQueue[chunkGenerationQueue.length] = candidates[i];
    }

    let placedCount = 0;

    for (const candidate of candidates) {
        if (placedCount >= MAX_PLACEMENTS_PER_TICK) {
            break;
        }
        // Enforce hard execution time ceiling while allowing at least initial placement
        if (getClock() - tickStart >= maxBudgetMs && placedCount > 0) {
            break;
        }

        const { cx, cz } = candidate;
        try {
            const placed = dim.placeFeature(GAIA_FEATURE_ID, { x: cx * 16, y: 0, z: cz * 16 });
            if (placed) {
                markChunkGenerated(cx, cz);
                placedCount++;
            }
        } catch {
            // LocationInUnloadedChunkError or pending chunk stream
        }
    }

    return placedCount;
}

let coordinatorRunId: number | null = null;

/**
 * Initializes the continuous, dynamic chunk generation coordinator.
 * Runs at 20 Hz via system.runInterval(..., 1).
 */
export function initializeGaiaChunkCoordinator(
    intervalTicks: number = 1, 
    radius: number = DEFAULT_RADIUS, 
    maxBudgetMs: number = MAX_TICK_BUDGET_MS
): number {
    if (coordinatorRunId !== null) return coordinatorRunId;

    coordinatorRunId = system.runInterval(() => {
        const tickStart = getClock();
        try {
            if (!world || typeof world.getAllPlayers !== "function") return;
            const players = world.getAllPlayers();
            for (const player of players) {
                if (getClock() - tickStart >= maxBudgetMs) break;
                updatePlayerChunks(player, radius, tickStart, maxBudgetMs);
            }
        } catch {}
    }, intervalTicks);

    return coordinatorRunId;
}

/**
 * Stops the continuous chunk coordinator.
 */
export function stopGaiaChunkCoordinator(): void {
    if (coordinatorRunId !== null) {
        system.clearRun(coordinatorRunId);
        coordinatorRunId = null;
    }
}
