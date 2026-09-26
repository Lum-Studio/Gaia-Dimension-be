// @ts-nocheck
import { world, system, ItemStack, Player, EquipmentSlot, GameMode } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";

/**
 * ==============================================================================
 * Mirage Framework — Universal Custom Enchantment Engine & Cross-Addon Registry
 * ==============================================================================
 * Enterprise-grade custom enchantment architecture for Minecraft Bedrock Edition.
 * Features:
 * 1. Universal Cross-Addon Scoreboard Registry (ench_reg) with automatic prefix stripping
 * 2. Synchronous Scoreboard Mutex Coordination (ench_bus) with 20-tick debounce (#ui_lock, #anvil_lock)
 * 3. Indestructible Lore Metadata Engine (§7<DisplayName> <RomanLevel>) with unshift()
 * 4. Fake Purple Glint Spoofing & 5-tick Cursor Inventory Suppression
 * 5. Creative Mode Universal Bypass (enchant any item with any enchantment, zero cost)
 * 6. Semantic Equipment Category & Alias Matching (weapons, armor, tools, ranged)
 * 7. Multi-Cache Dynamic Property Fallback (mirage:, luminiae:, tme:, ench:)
 * 8. Stack Consumption Safety (preserves remainder when enchanting from a stack)
 * 9. Pluggable Economy & Craft Limit Hooks
 * 10. World Scoreboard Bit-Packing Registry & Storage (ench_meta) via runCommand
 * ==============================================================================
 */

/**
 * Scoreboard Bit-Packing Utility for Cross-Addon Data Synchronization.
 * Stores complex metadata in standard 32-bit Bedrock scoreboard scores.
 * 
 * Bit Layout (30-bit Positive Integer, 0 to 0x3FFFFFFF = 1,073,741,823):
 * [Bits 0–3]   (4 bits, mask 0xF)   : maxLevel (1 to 15)
 * [Bits 4–9]   (6 bits, mask 0x3F)  : costMultiplier (1 to 63)
 * [Bits 10–21] (12 bits, mask 0xFFF): categoryMask (AppliesTo bitflags)
 * [Bits 22–29] (8 bits, mask 0xFF)  : numericId / flags (0 to 255)
 */
export class ScoreboardBitPack {
    static readonly CATEGORY_BITS: Record<string, number> = {
        sword: 1 << 0,
        bow: 1 << 1,
        crossbow: 1 << 2,
        helmet: 1 << 3,
        chestplate: 1 << 4,
        leggings: 1 << 5,
        boots: 1 << 6,
        pickaxe: 1 << 7,
        axe: 1 << 8,
        shovel: 1 << 9,
        hoe: 1 << 10,
        mace: 1 << 11,
        armor: (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6),
        tools: (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10),
        weapons: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 11),
        all: 0xFFF
    };

    static categoriesToMask(categories: string[]): number {
        if (!categories || !Array.isArray(categories) || categories.length === 0) return 0xFFF;
        let mask = 0;
        for (const cat of categories) {
            const clean = (cat || "").toLowerCase().trim();
            if (clean === "armor") {
                mask |= this.CATEGORY_BITS.armor;
            } else if (clean === "tool" || clean === "tools") {
                mask |= this.CATEGORY_BITS.tools;
            } else if (clean === "weapon" || clean === "weapons") {
                mask |= this.CATEGORY_BITS.weapons;
            } else if (this.CATEGORY_BITS[clean] !== undefined) {
                mask |= this.CATEGORY_BITS[clean];
            } else if (clean.includes("head") || clean.includes("helmet")) {
                mask |= this.CATEGORY_BITS.helmet;
            } else if (clean.includes("chest")) {
                mask |= this.CATEGORY_BITS.chestplate;
            } else if (clean.includes("leg")) {
                mask |= this.CATEGORY_BITS.leggings;
            } else if (clean.includes("boot") || clean.includes("feet")) {
                mask |= this.CATEGORY_BITS.boots;
            } else {
                mask |= this.CATEGORY_BITS.sword;
            }
        }
        return mask || 0xFFF;
    }

    static maskToCategories(mask: number): string[] {
        const result: string[] = [];
        if ((mask & 0xFFF) === 0xFFF) return ["all"];
        const bitMap: [number, string][] = [
            [1 << 0, "sword"],
            [1 << 1, "bow"],
            [1 << 2, "crossbow"],
            [1 << 3, "helmet"],
            [1 << 4, "chestplate"],
            [1 << 5, "leggings"],
            [1 << 6, "boots"],
            [1 << 7, "pickaxe"],
            [1 << 8, "axe"],
            [1 << 9, "shovel"],
            [1 << 10, "hoe"],
            [1 << 11, "mace"]
        ];
        for (const [bit, name] of bitMap) {
            if ((mask & bit) !== 0) result.push(name);
        }
        return result.length > 0 ? result : ["all"];
    }

    static packEnchant(maxLevel: number = 1, costMultiplier: number = 3, appliesTo: string[] = [], flags: number = 0): number {
        const clampedLvl = Math.max(1, Math.min(15, maxLevel || 1));
        const clampedCost = Math.max(1, Math.min(63, costMultiplier || 3));
        const catMask = this.categoriesToMask(appliesTo);
        const clampedFlags = Math.max(0, Math.min(255, flags || 0));

        return (clampedLvl & 0xF) |
               ((clampedCost & 0x3F) << 4) |
               ((catMask & 0xFFF) << 10) |
               ((clampedFlags & 0xFF) << 22);
    }

    static unpackEnchant(score: number): { maxLevel: number, costMultiplier: number, appliesTo: string[], flags: number } {
        if (typeof score !== "number" || isNaN(score)) {
            return { maxLevel: 1, costMultiplier: 3, appliesTo: ["all"], flags: 0 };
        }
        const maxLevel = (score & 0xF) || 1;
        const costMultiplier = ((score >> 4) & 0x3F) || 3;
        const catMask = (score >> 10) & 0xFFF;
        const flags = (score >> 22) & 0xFF;
        const appliesTo = this.maskToCategories(catMask);

        return { maxLevel, costMultiplier, appliesTo, flags };
    }

    static packChars(chars: string): number {
        let packed = 0;
        for (let i = 0; i < Math.min(4, chars.length); i++) {
            const code = chars.charCodeAt(i) & 0x7F;
            packed |= (code << (i * 7));
        }
        return packed;
    }

    static unpackChars(score: number): string {
        let result = "";
        for (let i = 0; i < 4; i++) {
            const code = (score >> (i * 7)) & 0x7F;
            if (code > 0) result += String.fromCharCode(code);
        }
        return result;
    }

    static setScoreboardData(key: string, value: number, objective: string = "ench_data"): void {
        const cleanKey = key.startsWith("#") ? key : `#${key}`;
        try {
            let obj = world.scoreboard.getObjective(objective);
            if (!obj) {
                try {
                    obj = world.scoreboard.addObjective(objective, objective);
                } catch (e) {
                    try {
                        const dim = world.getDimension("overworld");
                        dim?.runCommand?.(`scoreboard objectives add ${objective} dummy`);
                        obj = world.scoreboard.getObjective(objective);
                    } catch (e2) {}
                }
            }
            if (obj) {
                try { obj.setScore(cleanKey, value); } catch (e) {}
            }
            const dim = world.getDimension("overworld");
            dim?.runCommand?.(`scoreboard players set ${cleanKey} ${objective} ${value}`);
        } catch (err) {}
    }

    static getScoreboardData(key: string, objective: string = "ench_data"): number | null {
        const cleanKey = key.startsWith("#") ? key : `#${key}`;
        try {
            const obj = world.scoreboard.getObjective(objective);
            if (obj) {
                const score = obj.getScore(cleanKey);
                if (typeof score === "number") return score;
            }
        } catch (err) {}
        return null;
    }
}

export class EnchantmentManager {
    constructor() {
        this.registry = new Map();
        this.uiCooldowns = new Map();
        this.playerActiveEnchants = new Map();
        this.namespace = null;
        this.limitChecker = null;
        this.limitIncrementer = null;
        this.economyProvider = null;
        this.initEvents();
    }

    /**
     * Strips namespace prefix from an identifier (e.g. 'decayed:wither_shot' -> 'wither_shot').
     * @param {string} id
     * @returns {string}
     */
    cleanId(id) {
        if (!id || typeof id !== "string") return "";
        return id.includes(":") ? id.split(":")[1] : id;
    }

    /**
     * Optional hook to configure custom craft limit validation.
     * @param {(enchantId: string, player: Player) => { blocked: boolean, reason?: string }} fn
     */
    setLimitChecker(fn) {
        this.limitChecker = fn;
    }

    /**
     * Optional hook to configure craft count increments upon table enchantment.
     * @param {(enchantId: string, player: Player) => void} fn
     */
    setLimitIncrementer(fn) {
        this.limitIncrementer = fn;
    }

    /**
     * Optional hook to configure custom economy (XP, scoreboard, items).
     * @param {(player: Player) => { type: string, objective?: string }} fn
     */
    setEconomyProvider(fn) {
        this.economyProvider = fn;
    }

    /**
     * Registers a new custom enchantment.
     * Automatically strips namespace prefix and publishes to universal scoreboard registry.
     * @param {string} id
     * @param {Object} config
     */
    register(id, config) {
        if (!id || typeof id !== "string") {
            throw new Error("[EnchantmentLib] Cannot register enchantment with invalid ID");
        }
        if (!config || !config.name) {
            throw new Error(`[EnchantmentLib] Cannot register enchantment '${id}' without a name`);
        }

        // Auto-detect namespace from first registered namespaced enchantment
        if (!this.namespace && id.includes(":")) {
            this.namespace = id.split(":")[0];
        }

        const clean = this.cleanId(id);
        const maxLevel = typeof config.maxLevel === "number" && config.maxLevel > 0 ? config.maxLevel : 1;
        const costMultiplier = typeof config.costMultiplier === "number" && config.costMultiplier > 0
            ? config.costMultiplier
            : (typeof config.costPerLevel === "function" ? config.costPerLevel(1) : 3);

        const appliesTo = Array.isArray(config.appliesTo) ? config.appliesTo : [];
        const costPerLevel = typeof config.costPerLevel === "function"
            ? config.costPerLevel
            : ((lvl) => lvl * costMultiplier);

        const entry = {
            id: clean,
            rawId: id,
            name: config.name,
            bookId: config.bookId || `${id}_book`,
            cleanBookId: this.cleanId(config.bookId || `${id}_book`),
            maxLevel,
            appliesTo,
            tier: typeof config.tier === "number" ? config.tier : 1,
            entityHitEntity: config.entityHitEntity,
            playerBreakBlock: config.playerBreakBlock,
            onHurt: config.onHurt,
            projectileHitBlock: config.projectileHitBlock,
            projectileHitEntity: config.projectileHitEntity,
            onHit: config.onHit,
            onBreak: config.onBreak,
            onTick: config.onTick,
            costPerLevel,
            _costMultiplier: costMultiplier
        };

        // Store under both clean and original id for maximum lookup robustness
        this.registry.set(clean, entry);
        if (id !== clean) {
            this.registry.set(id, entry);
        }

        // Publish to Universal Scoreboard Registry (ench_meta bit-packed + ench_reg legacy)
        system.run(() => {
            try {
                // 1. Bit-Packed World Scoreboard (ench_meta) — 100% cross-addon visibility without permission sandboxing
                const packedScore = ScoreboardBitPack.packEnchant(
                    maxLevel,
                    costMultiplier,
                    appliesTo,
                    0
                );
                const fakePlayer = `#${clean}`;

                // Native API setScore
                let metaObj = world.scoreboard.getObjective("ench_meta");
                if (!metaObj) {
                    try {
                        metaObj = world.scoreboard.addObjective("ench_meta", "Enchantment Metadata");
                    } catch (e) {
                        try {
                            const dim = world.getDimension("overworld");
                            dim?.runCommand?.("scoreboard objectives add ench_meta dummy");
                            metaObj = world.scoreboard.getObjective("ench_meta");
                        } catch (e2) {}
                    }
                }
                if (metaObj) {
                    try {
                        metaObj.setScore(fakePlayer, packedScore);
                    } catch (e) {}
                }

                // Global runCommand publication — Guarantees cross-pack write across all sandboxes!
                try {
                    const dim = world.getDimension("overworld");
                    dim?.runCommand?.(`scoreboard players set ${fakePlayer} ench_meta ${packedScore}`);
                } catch (e) {}

                // 2. Also publish to legacy ench_reg string format for backward compatibility
                let reg = world.scoreboard.getObjective("ench_reg");
                if (!reg) {
                    try {
                        reg = world.scoreboard.addObjective("ench_reg", "Enchantment Registry");
                    } catch (e) {
                        try {
                            const dim = world.getDimension("overworld");
                            dim?.runCommand?.("scoreboard objectives add ench_reg dummy");
                            reg = world.scoreboard.getObjective("ench_reg");
                        } catch (e2) {}
                    }
                }
                if (reg) {
                    const costSample = typeof config.costPerLevel === "function" ? config.costPerLevel(1) : costMultiplier;
                    const typesStr = appliesTo.join(",");
                    const regKey = `#${clean}:${config.name}:${typesStr}:${maxLevel}:${costSample}`;
                    try {
                        reg.setScore(regKey, 1);
                    } catch (e) {
                        const dim = world.getDimension("overworld");
                        dim?.runCommand?.(`scoreboard players set "${regKey}" ench_reg 1`);
                    }
                }
            } catch (err) {}
        });
    }

    /**
     * Retrieves an enchantment definition by either clean or namespaced ID.
     * @param {string} id
     * @returns {Object | null}
     */
    get(id) {
        if (!id) return null;
        const clean = this.cleanId(id);
        return this.registry.get(clean) || this.registry.get(id) || this.getAllAvailableEnchantments().get(clean) || null;
    }

    /**
     * Returns merged map of local enchantments and external enchantments discovered via scoreboard.
     * All map keys and config.id values are guaranteed to be clean, unprefixed IDs.
     * @returns {Map<string, Object>}
     */
    getAllAvailableEnchantments() {
        const merged = new Map();

        // 1. Add local registry entries (unprefixed)
        for (const [id, config] of this.registry) {
            const clean = this.cleanId(id);
            if (!merged.has(clean)) {
                merged.set(clean, { ...config, id: clean });
            }
        }

        // 2. Add external entries from bit-packed universal scoreboard (ench_meta)
        try {
            const metaObj = world.scoreboard.getObjective("ench_meta");
            if (metaObj) {
                for (const participant of metaObj.getParticipants()) {
                    const rawName = typeof participant === "string" ? participant : participant?.displayName;
                    if (!rawName || !rawName.startsWith("#")) continue;

                    const id = this.cleanId(rawName.substring(1));
                    if (!id || merged.has(id)) continue;

                    const score = metaObj.getScore(participant);
                    if (typeof score === "number") {
                        const unpacked = ScoreboardBitPack.unpackEnchant(score);
                        const prettyName = id
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase());

                        merged.set(id, {
                            id,
                            rawId: id,
                            name: prettyName,
                            maxLevel: unpacked.maxLevel,
                            appliesTo: unpacked.appliesTo,
                            costPerLevel: (lvl) => lvl * unpacked.costMultiplier,
                            _costMultiplier: unpacked.costMultiplier
                        });
                    }
                }
            }
        } catch (e) {}

        // 3. Add external entries from legacy universal scoreboard registry (ench_reg)
        try {
            const reg = world.scoreboard.getObjective("ench_reg");
            if (reg) {
                for (const participant of reg.getParticipants()) {
                    const rawName = typeof participant === "string" ? participant : participant?.displayName;
                    if (!rawName || !rawName.startsWith("#") || !rawName.includes(":")) continue;

                    const clean = rawName.substring(1);
                    const parts = clean.split(":");
                    if (parts.length >= 5) {
                        const costStr = parts[parts.length - 1];
                        const maxLvlStr = parts[parts.length - 2];
                        const typesStr = parts[parts.length - 3];
                        const name = parts[parts.length - 4];
                        const rawId = parts.slice(0, parts.length - 4).join(":");
                        const id = this.cleanId(rawId);

                        if (merged.has(id)) {
                            const existing = merged.get(id);
                            if (name && (!existing.name || existing.name.toLowerCase() === id.replace(/_/g, " "))) {
                                existing.name = name;
                            }
                        } else {
                            const maxLevel = parseInt(maxLvlStr, 10) || 1;
                            const costMult = parseInt(costStr, 10) || 3;
                            merged.set(id, {
                                id,
                                rawId,
                                name,
                                maxLevel,
                                appliesTo: typesStr ? typesStr.split(",") : [],
                                costPerLevel: (lvl) => lvl * costMult,
                                _costMultiplier: costMult
                            });
                        }
                    }
                }
            }
        } catch (e) {}

        return merged;
    }

    /**
     * Checks if a player is in Creative mode.
     * @param {Player} player
     * @returns {boolean}
     */
    isCreative(player) {
        if (!player) return false;
        try {
            const mode = player.getGameMode ? player.getGameMode() : null;
            if (typeof mode === "string") {
                return mode.toLowerCase() === "creative";
            }
            if (typeof GameMode !== "undefined" && mode === GameMode.creative) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * Semantic equipment compatibility matcher.
     * Maps vanilla and custom modded weapons, armor, and tools to target equipment types.
     * @param {ItemStack} item
     * @param {string[]} appliesTo
     * @returns {boolean}
     */
    isItemCompatible(item, appliesTo) {
        if (!item || !appliesTo || appliesTo.length === 0) return false;
        const rawType = (item.typeId || "").toLowerCase();
        const cleanType = (rawType.includes(":") ? rawType.split(":")[1] : rawType).replace(/_/g, " ");

        return appliesTo.some((type) => {
            const t = (type || "").toLowerCase().trim();
            if (!t) return false;

            // Direct substring match
            if (cleanType.includes(t)) return true;

            // Semantic category aliases
            if (t === "sword") {
                return cleanType.includes("blade") || cleanType.includes("dagger") || cleanType.includes("katana") || cleanType.includes("saber") || cleanType.includes("rapier") || cleanType.includes("broadsword");
            }
            if (t === "boots") {
                return cleanType.includes("boot");
            }
            if (t === "leggings") {
                return cleanType.includes("legging") || cleanType.includes("pants");
            }
            if (t === "chestplate") {
                return cleanType.includes("chest") || cleanType.includes("tunic");
            }
            if (t === "helmet") {
                return cleanType.includes("cap") || cleanType.includes("helm") || cleanType.includes("hood");
            }
            if (t === "bow") {
                return cleanType.includes("bow") && !cleanType.includes("crossbow");
            }
            if (t === "crossbow") {
                return cleanType.includes("crossbow");
            }
            if (t === "axe") {
                return cleanType.includes("axe") && !cleanType.includes("pickaxe");
            }
            if (t === "pickaxe") {
                return cleanType.includes("pickaxe") || cleanType.includes("pick");
            }
            if (t === "shovel") {
                return cleanType.includes("shovel") || cleanType.includes("spade");
            }
            if (t === "hoe") {
                return cleanType.includes("hoe") || cleanType.includes("scythe") || cleanType.includes("mattock");
            }
            if (t === "trident") {
                return cleanType.includes("trident") || cleanType.includes("spear");
            }
            if (t === "mace") {
                return cleanType.includes("mace") || cleanType.includes("hammer");
            }
            if (t === "elytra") {
                return cleanType.includes("elytra") || cleanType.includes("wings");
            }
            if (t === "shield") {
                return cleanType.includes("shield");
            }
            if (t === "fishing_rod") {
                return cleanType.includes("fishing rod") || cleanType.includes("rod");
            }
            if (t === "shears") {
                return cleanType.includes("shears");
            }
            if (t === "book") {
                return cleanType.includes("book");
            }

            return false;
        });
    }

    /**
     * Helper to find clean enchant ID from a book item.
     * Prioritizes authoritative lore, then item typeId patterns.
     * @param {ItemStack} itemStack
     * @returns {string | null}
     */
    getEnchantFromBook(itemStack) {
        if (!itemStack) return null;

        // 1. Authoritative lore detection
        const enchants = this.getEnchantments(itemStack);
        const keys = Object.keys(enchants);
        if (keys.length > 0) {
            return this.cleanId(keys[0]);
        }

        // 2. Type ID detection
        const rawType = (itemStack.typeId || "").toLowerCase();
        const cleanType = this.cleanId(rawType);

        const allAvailable = this.getAllAvailableEnchantments();
        for (const [id, config] of allAvailable) {
            if (config.bookId) {
                const cleanBookId = this.cleanId(config.bookId).toLowerCase();
                if (cleanType === cleanBookId || cleanType.startsWith(cleanBookId + "_")) {
                    return id;
                }
            }
        }

        // 3. Fallback for physical enchanted books (enchanted_book_<id>_<lvl> or enchanted_book_<id>)
        if (cleanType.includes("enchanted_book_")) {
            const suffix = cleanType.replace("enchanted_book_", "");
            const match = suffix.match(/^(.+)_(\d+)$/);
            const rawEnchantId = match ? match[1] : suffix;
            return this.cleanId(rawEnchantId);
        }

        return null;
    }

    /**
     * Returns true if the item can receive at least one registered custom enchantment.
     * In Creative mode, returns true for any valid item.
     * @param {ItemStack} item
     * @param {Player} [player]
     * @returns {boolean}
     */
    hasAnyApplicableEnchant(item, player) {
        if (!item) return false;
        if (this.isCreative(player)) return true;

        const currentEnchants = this.getEnchantments(item);
        for (const [id, config] of this.getAllAvailableEnchantments()) {
            if (!this.isItemCompatible(item, config.appliesTo)) continue;
            const currentLevel = currentEnchants[id] || 0;
            if (currentLevel < config.maxLevel) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if an enchantment is blocked by craft limits or configuration.
     * @param {string} enchantId
     * @param {Player} player
     * @returns {{ blocked: boolean, reason?: string }}
     */
    checkEnchantLimit(enchantId, player) {
        if (this.isCreative(player)) return { blocked: false };

        if (this.limitChecker) {
            return this.limitChecker(enchantId, player);
        }

        // Auto-detect global Database if present (e.g. LifeSteal-BP)
        if (typeof Database !== "undefined" && Database.getConfig && Database.getCraftCount) {
            const limitMap = {
                lifesteal: "craft_limit_lifesteal_book",
                vampirism: "craft_limit_vampirism_book",
                soulbound: "craft_limit_soulbound_book",
                soul_tether: "craft_limit_soul_tether_book",
                heart_shield: "craft_limit_heart_shield_book",
                last_stand: "craft_limit_last_stand_book"
            };
            const recipeMap = {
                lifesteal: "ks_lifesteal:enchanted_book_lifesteal_1",
                vampirism: "ks_lifesteal:enchanted_book_vampirism_1",
                soulbound: "ks_lifesteal:enchanted_book_soulbound_1",
                soul_tether: "ks_lifesteal:enchanted_book_soul_tether_1",
                heart_shield: "ks_lifesteal:enchanted_book_heart_shield_1",
                last_stand: "ks_lifesteal:enchanted_book_last_stand_1"
            };
            const limitKey = limitMap[enchantId];
            const recipeId = recipeMap[enchantId];
            if (limitKey && recipeId) {
                const playerLimit = Database.getConfig(`${limitKey}_per_player`);
                const globalLimit = Database.getConfig(`${limitKey}_global`);
                const playerCrafts = Database.getCraftCount(player, recipeId);
                const globalCrafts = Database.getGlobalCraftCount(recipeId);
                if (playerLimit > -1 && playerCrafts >= playerLimit) {
                    return { blocked: true, reason: `§cPersonal limit reached (${playerCrafts}/${playerLimit})` };
                }
                if (globalLimit > -1 && globalCrafts >= globalLimit) {
                    return { blocked: true, reason: `§cGlobal limit reached (${globalCrafts}/${globalLimit})` };
                }
            }
        }

        return { blocked: false };
    }

    /**
     * Increments craft count for an enchantment applied via table or anvil.
     * @param {string} enchantId
     * @param {Player} player
     */
    incrementEnchantCount(enchantId, player) {
        if (this.isCreative(player)) return;

        if (this.limitIncrementer) {
            this.limitIncrementer(enchantId, player);
            return;
        }

        if (typeof Database !== "undefined" && Database.incrementCraftCount) {
            const recipeMap = {
                lifesteal: "ks_lifesteal:enchanted_book_lifesteal_1",
                vampirism: "ks_lifesteal:enchanted_book_vampirism_1",
                soulbound: "ks_lifesteal:enchanted_book_soulbound_1",
                soul_tether: "ks_lifesteal:enchanted_book_soul_tether_1",
                heart_shield: "ks_lifesteal:enchanted_book_heart_shield_1",
                last_stand: "ks_lifesteal:enchanted_book_last_stand_1"
            };
            const recipeId = recipeMap[enchantId];
            if (recipeId) {
                Database.incrementCraftCount(player, recipeId);
            }
        }
    }

    /**
     * Resolves the economy configuration for a player interaction.
     * @param {Player} player
     * @returns {{ type: 'xp' | 'scoreboard', objective: string }}
     */
    getEconomy(player) {
        if (this.economyProvider) {
            return this.economyProvider(player);
        }
        if (typeof Database !== "undefined" && Database.getConfig) {
            return {
                type: Database.getConfig("enchantment_economy_type") || "xp",
                objective: Database.getConfig("enchantment_scoreboard_objective") || "money"
            };
        }
        return { type: "xp", objective: "money" };
    }

    /**
     * Checks and claims a synchronous scoreboard mutex lock for the specified action.
     * @param {string} mutexKey e.g. '#ui_lock' or '#anvil_lock'
     * @param {number} debounceTicks Debounce window (default 20 ticks = 1s)
     * @returns {boolean} True if the lock was acquired, false if locked by another addon
     */
    claimScoreboardMutex(mutexKey = "#ui_lock", debounceTicks = 20) {
        try {
            let bus = world.scoreboard.getObjective("ench_bus");
            if (!bus) {
                try {
                    const dim = world.getDimension("overworld");
                    dim?.runCommand?.("scoreboard objectives add ench_bus dummy");
                    bus = world.scoreboard.getObjective("ench_bus");
                } catch (e) {
                    try { bus = world.scoreboard.addObjective("ench_bus", "Enchantment Bus"); } catch (e2) {}
                }
            }

            const currentTick = typeof system?.currentTick === "number" ? system.currentTick : Math.floor(Date.now() / 50);
            const lastClaimedTick = bus?.getScore(mutexKey) ?? -999;

            if (currentTick - lastClaimedTick < debounceTicks) {
                return false;
            }

            try {
                bus?.setScore(mutexKey, currentTick);
            } catch (e) {
                const dim = world.getDimension("overworld");
                dim?.runCommand?.(`scoreboard players set "${mutexKey}" ench_bus ${currentTick}`);
            }

            return true;
        } catch (err) {
            return true;
        }
    }

    /**
     * Mirrors active equipped custom enchantments onto player scoreboards (ench_<id>).
     * Enables vanilla commands (/execute as @a[scores={ench_<id>=1..}]),
     * animation controllers, and Molang queries to react to active enchantments.
     * Executed on a 2-tick interval.
     */
    mirrorPlayerScoreboards() {
        if (typeof world === "undefined" || !world.scoreboard || !world.getAllPlayers) return;

        for (const player of world.getAllPlayers()) {
            if (!player || !player.isValid) continue;

            const equip = player.getComponent("minecraft:equippable");
            if (!equip) continue;

            const activeEnchants = new Map();
            const slots = [
                EquipmentSlot.Mainhand,
                EquipmentSlot.Offhand,
                EquipmentSlot.Head,
                EquipmentSlot.Chest,
                EquipmentSlot.Legs,
                EquipmentSlot.Feet
            ];

            for (const slot of slots) {
                const item = equip.getEquipment(slot);
                if (!item) continue;

                const enchants = this.getEnchantments(item);
                for (const [id, level] of Object.entries(enchants)) {
                    const clean = this.cleanId(id);
                    const currentMax = activeEnchants.get(clean) || 0;
                    if (level > currentMax) {
                        activeEnchants.set(clean, level);
                    }
                }
            }

            let trackedSet = this.playerActiveEnchants.get(player.id);
            if (!trackedSet) {
                trackedSet = new Set();
                this.playerActiveEnchants.set(player.id, trackedSet);
            }

            for (const [id, level] of activeEnchants) {
                const objName = `ench_${id}`;
                let obj = world.scoreboard.getObjective(objName);
                if (!obj) {
                    try {
                        obj = world.scoreboard.addObjective(objName, `Ench: ${id}`);
                    } catch (e1) {
                        try {
                            const dim = world.getDimension("overworld");
                            dim?.runCommand?.(`scoreboard objectives add "${objName}" dummy`);
                            obj = world.scoreboard.getObjective(objName);
                        } catch (e2) {}
                    }
                }

                if (obj) {
                    try {
                        const currentScore = obj.getScore(player);
                        if (currentScore !== level) {
                            obj.setScore(player, level);
                        }
                    } catch (e) {
                        try {
                            const dim = world.getDimension("overworld");
                            dim?.runCommand?.(`scoreboard players set @a[name="${player.name}"] "${objName}" ${level}`);
                        } catch (e2) {}
                    }
                }
                trackedSet.add(id);
            }

            for (const oldId of trackedSet) {
                if (!activeEnchants.has(oldId)) {
                    const objName = `ench_${oldId}`;
                    const obj = world.scoreboard.getObjective(objName);
                    if (obj) {
                        try {
                            const score = obj.getScore(player);
                            if (score !== 0 && typeof score === "number") {
                                obj.setScore(player, 0);
                            }
                        } catch (e) {
                            try {
                                const dim = world.getDimension("overworld");
                                dim?.runCommand?.(`scoreboard players set @a[name="${player.name}"] "${objName}" 0`);
                            } catch (e2) {}
                        }
                    }
                    trackedSet.delete(oldId);
                }
            }
        }
    }

    initEvents() {
        // Visual Management Loop (Cursor inventory suppression vs Equipment glint)
        system.runInterval?.(() => this.manageVisuals(), 5);

        // Active Scoreboard Mirror Loop (player ench_<id> synchronization)
        system.runInterval?.(() => this.mirrorPlayerScoreboards(), 2);

        // Clean up per-player tracking on leave
        world.afterEvents?.playerLeave?.subscribe?.((ev) => {
            if (ev?.playerId) {
                this.playerActiveEnchants.delete(ev.playerId);
                this.uiCooldowns.delete(ev.playerId);
            }
        });

        // Inform players about custom interactions on block placement
        world.afterEvents?.playerPlaceBlock?.subscribe?.((ev) => {
            const { block, player } = ev;
            if (!block || !player || !player.isValid) return;

            if (block.typeId === "minecraft:enchanting_table") {
                player.sendMessage?.("§d[Enchantment] §eSneak + Interact to access Custom Enchantments!");
                player.onScreenDisplay?.setActionBar?.("§dSneak + Interact to access Custom Enchantments!");
            } else if (block.typeId.includes("anvil")) {
                player.sendMessage?.("§d[Anvil] §eSneak + Interact with a Custom Book to combine!");
                player.onScreenDisplay?.setActionBar?.("§dSneak + Interact with a Custom Book to combine!");
            }
        });

        // 1. Block Interact Trigger (Enchanting Table & Anvil)
        world.beforeEvents?.playerInteractWithBlock?.subscribe?.((ev) => {
            const { block, player } = ev;
            if (!player || !player.isValid) return;

            // A. Enchanting Table — Sneak-interact intercepts for Custom UI; regular click allows native vanilla UI
            if (block.typeId === "minecraft:enchanting_table") {
                if (!player.isSneaking) return;
                ev.cancel = true;

                // Move mutex acquisition into system.run so setScore runs in unrestricted mode!
                system.run(() => {
                    if (!player.isValid) return;

                    if (!this.claimScoreboardMutex("#ui_lock", 20)) {
                        return; // Another addon already claimed table UI in this window
                    }

                    const now = Date.now();
                    if (this.uiCooldowns.has(player.id) && now - this.uiCooldowns.get(player.id) < 500) return;
                    this.uiCooldowns.set(player.id, now);

                    this.openEnchantmentUI(player);
                });
            }

            // B. Anvil — Intercepts when holding a custom book
            else if (block.typeId.includes("anvil")) {
                const equippable = player.getComponent("minecraft:equippable");
                const itemStack = equippable?.getEquipment(EquipmentSlot.Mainhand);
                const enchantId = this.getEnchantFromBook(itemStack);

                if (enchantId) {
                    ev.cancel = true;

                    // Move mutex acquisition into system.run so setScore runs in unrestricted mode!
                    system.run(() => {
                        if (!player.isValid) return;

                        if (!this.claimScoreboardMutex("#anvil_lock", 20)) {
                            return; // Another addon already claimed anvil UI in this window
                        }

                        const now = Date.now();
                        if (this.uiCooldowns.has(player.id) && now - this.uiCooldowns.get(player.id) < 500) return;
                        this.uiCooldowns.set(player.id, now);

                        player.dimension?.spawnParticle?.("minecraft:villager_happy", {
                            x: block.location.x + 0.5,
                            y: block.location.y + 1,
                            z: block.location.z + 0.5
                        });
                        player.playSound?.("random.anvil_use");
                        this.openAnvilBookApplyUI(player, itemStack, enchantId);
                    });
                }
            }
        });

        // 2. Combat Trigger
        world.afterEvents?.entityHitEntity?.subscribe?.((ev) => {
            const { damagingEntity } = ev;
            if (!damagingEntity || !damagingEntity.isValid) return;

            const equippable = damagingEntity.getComponent("minecraft:equippable");
            const mainHand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            if (mainHand) {
                this.triggerEnchants(mainHand, "entityHitEntity", ev);
            }
        });

        // 3. Mining Trigger
        world.afterEvents?.playerBreakBlock?.subscribe?.((ev) => {
            const { itemStack } = ev;
            if (itemStack) {
                this.triggerEnchants(itemStack, "playerBreakBlock", ev);
            }
        });

        // 4. Entity Hurt Trigger (Armor Enchants)
        world.afterEvents?.entityHurt?.subscribe?.((ev) => {
            const { hurtEntity } = ev;
            if (!hurtEntity || !hurtEntity.isValid) return;

            const equippable = hurtEntity.getComponent("minecraft:equippable");
            if (!equippable) return;

            const armorSlots = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
            for (const slot of armorSlots) {
                const item = equippable.getEquipment(slot);
                if (item) this.triggerEnchants(item, "onHurt", ev);
            }
        });

        // 5. Projectile Hit Block Trigger
        world.afterEvents?.projectileHitBlock?.subscribe?.((ev) => {
            const { source } = ev;
            if (!source || !source.isValid) return;

            const equippable = source.getComponent("minecraft:equippable");
            const mainHand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            if (mainHand) this.triggerEnchants(mainHand, "projectileHitBlock", ev);
        });

        // 6. Projectile Hit Entity Trigger
        world.afterEvents?.projectileHitEntity?.subscribe?.((ev) => {
            const { source } = ev;
            if (!source || !source.isValid) return;

            const equippable = source.getComponent("minecraft:equippable");
            const mainHand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            if (mainHand) this.triggerEnchants(mainHand, "projectileHitEntity", ev);
        });
    }

    /**
     * Executes registered callbacks for all custom enchantments present on an item.
     * @param {ItemStack} itemStack
     * @param {string} triggerType
     * @param {Object} eventData
     */
    triggerEnchants(itemStack, triggerType, eventData) {
        const enchants = this.getEnchantments(itemStack);
        for (const [id, level] of Object.entries(enchants)) {
            const clean = this.cleanId(id);
            const config = this.registry.get(clean) || this.registry.get(id);
            if (!config) continue;

            if (typeof config[triggerType] === "function") {
                config[triggerType](eventData, level);
            } else if (triggerType === "entityHitEntity" && typeof config.onHit === "function") {
                config.onHit(eventData, level);
            } else if (triggerType === "playerBreakBlock" && typeof config.onBreak === "function") {
                config.onBreak(eventData, level);
            }
        }
    }

    // --- Enchanting Table UI ---

    async openEnchantmentUI(player) {
        const isCreative = this.isCreative(player);
        const inventory = player.getComponent("minecraft:inventory")?.container;
        if (!inventory) return;

        // Scan inventory for all items that can receive at least one enchantment
        const candidates = [];
        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (!item) continue;
            if (this.hasAnyApplicableEnchant(item, player)) {
                candidates.push({ slot: i, item });
            }
        }

        // Form 1: Choose item to enchant (Renders regardless of inventory state)
        const chosen = await new Promise((resolve) => {
            const itemForm = new CustomForm(player, "\u00A75\u00A7lCustom Enchanting")
                .header("\u00A7d\u00A7lSelect an Item to Enchant")
                .spacer()
                .label("\u00A77Current Experience: \u00A7e" + (player.level ?? 0) + " \u00A77Levels")
                .spacer()
                .divider()
                .spacer();

            if (candidates.length === 0) {
                itemForm.label("\u00A7cNo enchantable items in your inventory.");
                itemForm.label("\u00A77Carry weapons, tools, or armor to apply custom enchantments.");
            } else {
                candidates.forEach((c) => {
                    const rawName = c.item.nameTag || c.item.typeId.replace("minecraft:", "").replace(/_/g, " ");
                    const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                    const countText = c.item.amount > 1 ? ` (${c.item.amount}x)` : "";
                    itemForm.button(capitalized + countText + " (Slot " + (c.slot + 1) + ")", () => {
                        itemForm.close();
                        resolve(c);
                    });
                });
            }

            itemForm.spacer();
            itemForm.closeButton();
            itemForm.show().then(() => resolve(null)).catch((e) => console.error(e));
        });

        if (!chosen) return;

        try {
            // Form 2: Choose enchantment for the selected item
            const validEnchants = [];
            const currentEnchants = this.getEnchantments(chosen.item);

            for (const [id, config] of this.getAllAvailableEnchantments()) {
                const isCompatible = this.isItemCompatible(chosen.item, config.appliesTo);
                if (!isCreative && !isCompatible) continue;

                const currentLevel = currentEnchants[id] || 0;
                if (currentLevel >= config.maxLevel && !isCreative) continue;

                // Check craft limits unless creative
                if (!isCreative) {
                    const limitCheck = this.checkEnchantLimit(id, player);
                    if (limitCheck.blocked) continue;
                }

                const nextLevel = isCreative
                    ? (currentLevel >= config.maxLevel ? config.maxLevel : currentLevel + 1)
                    : currentLevel + 1;

                const cost = isCreative
                    ? 0
                    : (typeof config.costPerLevel === "function"
                        ? config.costPerLevel(nextLevel)
                        : (config._costMultiplier ? nextLevel * config._costMultiplier : nextLevel * 3));

                validEnchants.push({ config, nextLevel, cost, enchantId: id });
            }

            if (validEnchants.length === 0) {
                player.sendMessage("§cNo available enchantments for this item (maxed out or limit reached).");
                return;
            }

            const chosenRawName = chosen.item.nameTag || chosen.item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            const chosenName = chosenRawName.charAt(0).toUpperCase() + chosenRawName.slice(1);

            const selected = await new Promise((resolve) => {
                const enchForm = new CustomForm(player, "\u00A75\u00A7lSelect Enchantment")
                    .header("\u00A7d\u00A7lItem: \u00A7f" + chosenName)
                    .spacer()
                    .label("\u00A77Current Experience: \u00A7e" + (player.level ?? 0) + " \u00A77Levels")
                    .spacer()
                    .divider()
                    .spacer();

                const eco = this.getEconomy(player);

                validEnchants.forEach((entry) => {
                    const { config, nextLevel, cost } = entry;
                    const costText = isCreative
                        ? "Free"
                        : (eco.type === "scoreboard" ? `${cost} ${eco.objective}` : `${cost} Levels`);
                    enchForm.button(config.name + " " + this.toRoman(nextLevel) + " (" + costText + ")", () => {
                        enchForm.close();
                        resolve(entry);
                    });
                });

                enchForm.spacer();
                enchForm.closeButton();
                enchForm.show().then(() => resolve(null)).catch((e) => console.error(e));
            });

            if (!selected) return;

            // Final transaction verification
            const currentInv = player.getComponent("minecraft:inventory")?.container;
            if (!currentInv) return;

            const targetItem = currentInv.getItem(chosen.slot);
            if (!targetItem || targetItem.typeId !== chosen.item.typeId) {
                player.sendMessage("§cInventory changed. Transaction cancelled.");
                return;
            }

            const eco = this.getEconomy(player);
            let pScore = 0;
            if (eco.type === "scoreboard" && !isCreative) {
                try { pScore = world.scoreboard.getObjective(eco.objective)?.getScore(player) || 0; } catch (e) {}
                if (pScore < selected.cost) {
                    player.sendMessage(`§cNot enough ${eco.objective}! Need ${selected.cost}.`);
                    player.playSound("note.bass");
                    return;
                }
            } else if (eco.type !== "scoreboard" && !isCreative) {
                if ((player.level ?? 0) < selected.cost) {
                    player.sendMessage(`§cNot enough XP! Need ${selected.cost} levels.`);
                    player.playSound("note.bass");
                    return;
                }
            }

            // Final limit re-check
            if (!isCreative) {
                const finalCheck = this.checkEnchantLimit(selected.enchantId, player);
                if (finalCheck.blocked) {
                    player.sendMessage(finalCheck.reason);
                    player.playSound("note.bass");
                    return;
                }
            }

            // Stack Safety: If enchanting from a stacked item (> 1), split 1 and leave the rest
            let newItem;
            if (targetItem.amount > 1) {
                const singleItem = targetItem.clone();
                singleItem.amount = 1;
                newItem = this.applyEnchantment(singleItem, selected.config.id, selected.nextLevel);

                targetItem.amount--;
                currentInv.setItem(chosen.slot, targetItem);

                // Add enchanted item into next available inventory slot or drop
                const added = currentInv.addItem(newItem);
                if (added) {
                    player.dimension.spawnItem(newItem, player.location);
                }
            } else {
                newItem = this.applyEnchantment(targetItem, selected.config.id, selected.nextLevel);
                currentInv.setItem(chosen.slot, newItem);

                // Update equippable if held in mainhand
                const equip = player.getComponent("minecraft:equippable");
                const currentMainHand = equip?.getEquipment(EquipmentSlot.Mainhand);
                if (currentMainHand && currentMainHand.typeId === newItem.typeId) {
                    equip.setEquipment(EquipmentSlot.Mainhand, newItem);
                }
            }

            // Deduct economy cost
            if (!isCreative) {
                if (eco.type === "scoreboard") {
                    try { world.scoreboard.getObjective(eco.objective)?.addScore(player, -selected.cost); } catch (e) {}
                } else {
                    player.addLevels(-selected.cost);
                }
                this.incrementEnchantCount(selected.enchantId, player);
            }

            player.dimension.spawnParticle("minecraft:enchanting_table_particle", player.location);
            player.playSound("random.levelup");
            player.sendMessage(`§aSuccessfully enchanted with ${selected.config.name} ${this.toRoman(selected.nextLevel)}!`);
        } catch (e) {
            console.warn("[EnchantmentLib] Error in enchanting flow: " + e);
        }
    }

    // --- Anvil UI ---

    async openAnvilBookApplyUI(player, bookStack, enchantId) {
        const isCreative = this.isCreative(player);
        const cleanId = this.cleanId(enchantId);
        const config = this.get(cleanId);
        if (!config) return;

        const inventory = player.getComponent("minecraft:inventory")?.container;
        if (!inventory) return;

        const validTargets = [];
        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (!item) continue;

            const isCompatible = this.isItemCompatible(item, config.appliesTo);
            const currentEnchants = this.getEnchantments(item);
            const currentLevel = currentEnchants[cleanId] || 0;

            if (isCreative || (isCompatible && currentLevel < config.maxLevel)) {
                validTargets.push({
                    slot: i,
                    item,
                    nextLevel: isCreative
                        ? (currentLevel >= config.maxLevel ? config.maxLevel : currentLevel + 1)
                        : currentLevel + 1,
                    cost: isCreative
                        ? 0
                        : (typeof config.costPerLevel === "function"
                            ? config.costPerLevel(currentLevel + 1)
                            : (config._costMultiplier ? (currentLevel + 1) * config._costMultiplier : 3))
                });
            }
        }

        if (validTargets.length === 0) {
            player.sendMessage(`§cNo compatible items for ${config.name} found in your inventory.`);
            return;
        }

        const eco = this.getEconomy(player);

        const selection = await new Promise((resolve) => {
            const form = new CustomForm(player, "\u00A76\u00A7lAnvil: \u00A7f" + config.name)
                .header("\u00A7e\u00A7lSelect Target Item")
                .spacer()
                .label("\u00A77Select an item to combine with \u00A7d" + config.name + "\u00A77.\n\u00A77Current Experience: \u00A7e" + (player.level ?? 0) + " \u00A77Levels")
                .spacer()
                .divider()
                .spacer();

            validTargets.forEach((t) => {
                const rawName = t.item.nameTag || t.item.typeId.replace("minecraft:", "").replace(/_/g, " ");
                const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                const costText = isCreative
                    ? "Free"
                    : (eco.type === "scoreboard" ? `${t.cost} ${eco.objective}` : `${t.cost} Levels`);
                form.button(capitalized + " (Slot " + (t.slot + 1) + ") - " + costText, () => {
                    form.close();
                    resolve(t);
                });
            });

            form.spacer();
            form.closeButton();
            form.show().then(() => resolve(null)).catch((e) => console.error(e));
        });

        if (!selection) return;

        const currentInvItem = inventory.getItem(selection.slot);
        const equipComp = player.getComponent("minecraft:equippable");
        const currentHandItem = equipComp?.getEquipment(EquipmentSlot.Mainhand);

        if (!currentHandItem || currentHandItem.typeId !== bookStack.typeId || !currentInvItem || currentInvItem.typeId !== selection.item.typeId) {
            player.sendMessage("§cInventory changed. Transaction cancelled.");
            return;
        }

        let pScore = 0;
        if (eco.type === "scoreboard" && !isCreative) {
            try { pScore = world.scoreboard.getObjective(eco.objective)?.getScore(player) || 0; } catch (e) {}
            if (pScore < selection.cost) {
                player.sendMessage(`§cNot enough ${eco.objective}! Need ${selection.cost}.`);
                player.playSound("note.bass");
                return;
            }
        } else if (eco.type !== "scoreboard" && !isCreative) {
            if ((player.level ?? 0) < selection.cost) {
                player.sendMessage(`§cNot enough XP! Need ${selection.cost} levels.`);
                player.playSound("note.bass");
                return;
            }
        }

        // Apply combined enchantment
        const newItem = this.applyEnchantment(currentInvItem, config.id, selection.nextLevel);
        inventory.setItem(selection.slot, newItem);

        // Consume 1 book from hand stack
        if (currentHandItem.amount > 1) {
            currentHandItem.amount--;
            equipComp.setEquipment(EquipmentSlot.Mainhand, currentHandItem);
        } else {
            equipComp.setEquipment(EquipmentSlot.Mainhand, undefined);
        }

        if (!isCreative) {
            if (eco.type === "scoreboard") {
                try { world.scoreboard.getObjective(eco.objective)?.addScore(player, -selection.cost); } catch (e) {}
            } else {
                player.addLevels(-selection.cost);
            }
            this.incrementEnchantCount(cleanId, player);
        }

        player.playSound("random.anvil_use");
        player.dimension.spawnParticle("minecraft:villager_happy", player.location);
        player.sendMessage(`§aSuccessfully combined ${config.name} with your item!`);
    }

    // --- Helper Methods ---

    /**
     * Applies an enchantment to an item stack with indestructible lore and fake glint.
     * @param {ItemStack} itemStack
     * @param {string} id
     * @param {number} level
     * @param {Object} [customConfig]
     * @returns {ItemStack}
     */
    applyEnchantment(itemStack, id, level = 1, customConfig = null) {
        if (!itemStack) return itemStack;

        const cleanId = this.cleanId(id);
        const config = customConfig || this.get(cleanId) || { id: cleanId, name: cleanId, maxLevel: 5 };

        const enchants = this.getEnchantments(itemStack);
        enchants[cleanId] = level;

        // Auxiliary multi-cache dynamic properties for cross-addon compatibility
        try {
            const serialized = JSON.stringify(enchants);
            itemStack.setDynamicProperty("mirage:enchants", serialized);
            itemStack.setDynamicProperty("luminiae:enchants", serialized);
            itemStack.setDynamicProperty("tme:enchants", serialized);
            itemStack.setDynamicProperty("ench:enchants", serialized);
        } catch (e) {}

        // Indestructible Lore persistence
        const currentLore = itemStack.getLore ? (itemStack.getLore() || []) : [];
        const newLoreLine = `§7${config.name} ${this.toRoman(level)}`;
        const cleanLore = currentLore.filter((line) => {
            if (typeof line !== "string") return false;
            const cleanText = line.replace(/§./g, "").trim().toLowerCase();
            return !cleanText.startsWith(config.name.toLowerCase());
        });
        cleanLore.unshift(newLoreLine);

        if (itemStack.setLore) {
            itemStack.setLore(cleanLore);
        }

        this.updateGlint(itemStack, true);
        return itemStack;
    }

    /**
     * Toggles fake purple glint spoofing on an item.
     * @param {ItemStack} itemStack
     * @param {boolean} shouldHaveGlint
     */
    updateGlint(itemStack, shouldHaveGlint = true) {
        if (!itemStack) return;
        const enchantable = itemStack.getComponent("minecraft:enchantable");
        if (!enchantable) return;

        const hasDummy = itemStack.getDynamicProperty("mirage:dummy_glint")
            || itemStack.getDynamicProperty("luminiae:dummy_glint")
            || itemStack.getDynamicProperty("tme:dummy_glint")
            || itemStack.getDynamicProperty("ench:dummy_glint");

        const currentVanillas = enchantable.getEnchantments();

        if (shouldHaveGlint) {
            if (currentVanillas.length === 0) {
                try {
                    enchantable.addEnchantment({ type: "unbreaking", level: 0 });
                    this.setDummyGlintProperty(itemStack, true);
                } catch (e) {
                    try {
                        enchantable.addEnchantment({ type: "unbreaking", level: 1 });
                        this.setDummyGlintProperty(itemStack, true);
                    } catch (e2) {}
                }
            }
        } else {
            if (hasDummy) {
                const unbreaking = enchantable.getEnchantment("unbreaking");
                if (unbreaking && currentVanillas.length === 1) {
                    enchantable.removeAllEnchantments();
                    this.setDummyGlintProperty(itemStack, undefined);
                }
            }
        }
    }

    setDummyGlintProperty(itemStack, value) {
        try {
            itemStack.setDynamicProperty("mirage:dummy_glint", value);
            itemStack.setDynamicProperty("luminiae:dummy_glint", value);
            itemStack.setDynamicProperty("tme:dummy_glint", value);
            itemStack.setDynamicProperty("ench:dummy_glint", value);
        } catch (e) {}
    }

    hasDummyGlint(itemStack) {
        if (!itemStack || !itemStack.getDynamicProperty) return false;
        try {
            return !!(
                itemStack.getDynamicProperty("mirage:dummy_glint")
                || itemStack.getDynamicProperty("luminiae:dummy_glint")
                || itemStack.getDynamicProperty("tme:dummy_glint")
                || itemStack.getDynamicProperty("ench:dummy_glint")
            );
        } catch (e) {
            return false;
        }
    }

    /**
     * Scans players every 5 ticks to suppress glint in cursor slots and maintain glint in inventory.
     */
    manageVisuals() {
        for (const player of world.getAllPlayers()) {
            if (!player.isValid) continue;

            // Cursor slot: strip dummy glint so vanilla interfaces (anvil/table) do not detect unbreaking
            const cursorComp = player.getComponent("minecraft:cursor_inventory");
            if (cursorComp?.item && this.hasCustomEnchants(cursorComp.item)) {
                if (this.hasDummyGlint(cursorComp.item)) {
                    this.updateGlint(cursorComp.item, false);
                    cursorComp.item = cursorComp.item;
                }
            }

            // Inventory & Equipment: ensure dummy glint is rendered
            const invComp = player.getComponent("minecraft:inventory");
            if (invComp?.container) {
                const container = invComp.container;
                for (let i = 0; i < container.size; i++) {
                    const item = container.getItem(i);
                    if (item && this.hasCustomEnchants(item) && !this.hasDummyGlint(item)) {
                        this.updateGlint(item, true);
                        if (this.hasDummyGlint(item)) {
                            container.setItem(i, item);
                        }
                    }
                }
            }

            const equipComp = player.getComponent("minecraft:equippable");
            if (equipComp) {
                const slots = [
                    EquipmentSlot.Mainhand,
                    EquipmentSlot.Offhand,
                    EquipmentSlot.Head,
                    EquipmentSlot.Chest,
                    EquipmentSlot.Legs,
                    EquipmentSlot.Feet
                ];
                for (const slot of slots) {
                    const item = equipComp.getEquipment(slot);
                    if (item && this.hasCustomEnchants(item) && !this.hasDummyGlint(item)) {
                        this.updateGlint(item, true);
                        if (this.hasDummyGlint(item)) {
                            equipComp.setEquipment(slot, item);
                        }
                    }
                }
            }
        }
    }

    /**
     * Checks if an item stack has any custom enchantments.
     * @param {ItemStack} item
     * @returns {boolean}
     */
    hasCustomEnchants(item) {
        if (!item) return false;

        // 1. Authoritative: check lore for enchant lines
        const lore = item.getLore ? item.getLore() : [];
        if (lore && lore.length > 0) {
            return lore.some((line) => typeof line === "string" && (line.startsWith("§7") || line.includes("§7")));
        }

        // 2. Physical book typeId
        const type = (item.typeId || "").toLowerCase();
        if (type.includes("enchanted_book_")) return true;

        // 3. Dynamic property cache fallback
        try {
            if (item.getDynamicProperty && (
                item.getDynamicProperty("mirage:enchants")
                || item.getDynamicProperty("luminiae:enchants")
                || item.getDynamicProperty("tme:enchants")
                || item.getDynamicProperty("ench:enchants")
            )) {
                return true;
            }
        } catch (e) {}

        return false;
    }

    /**
     * Checks whether an item stack possesses a specific custom enchantment.
     * @param {ItemStack} itemStack
     * @param {string} id
     * @returns {boolean}
     */
    hasEnchantment(itemStack, id) {
        if (!itemStack || !id) return false;
        const clean = this.cleanId(id);
        const enchants = this.getEnchantments(itemStack);
        return typeof enchants[clean] === "number" && enchants[clean] > 0;
    }

    /**
     * Returns the level of a specific custom enchantment on an item stack (0 if absent).
     * @param {ItemStack} itemStack
     * @param {string} id
     * @returns {number}
     */
    getEnchantLevel(itemStack, id) {
        if (!itemStack || !id) return 0;
        const clean = this.cleanId(id);
        const enchants = this.getEnchantments(itemStack);
        return enchants[clean] || 0;
    }

    /**
     * Retrieves all custom enchantments on an item stack as a dictionary: { [cleanId]: level }.
     * Prioritizes indestructible lore parsing with physical book and dynamic property fallbacks.
     * @param {ItemStack} itemStack
     * @returns {Object<string, number>}
     */
    getEnchantments(itemStack) {
        if (!itemStack) return {};

        // 1. Authoritative: parse enchantments from indestructible lore (§7<DisplayName> <RomanLevel>)
        const lore = itemStack.getLore ? itemStack.getLore() : [];
        if (lore && lore.length > 0) {
            const result = {};
            const allEnchants = this.getAllAvailableEnchantments();
            const sortedAvailable = Array.from(allEnchants.entries()).sort(
                (a, b) => (b[1]?.name?.length || 0) - (a[1]?.name?.length || 0)
            );

            for (const line of lore) {
                if (typeof line !== "string") continue;
                const clean = line.replace(/§./g, "").trim();
                if (!clean) continue;
                const lowerClean = clean.toLowerCase();

                for (const [id, config] of sortedAvailable) {
                    const targetName = (config.name || "").toLowerCase();
                    if (targetName && lowerClean.startsWith(targetName)) {
                        const cleanId = this.cleanId(id);
                        const suffix = clean.substring(config.name.length).trim();

                        // Suffix must be empty or a valid Roman numeral
                        if (suffix !== "" && !/^[IVXLCDM]+$/i.test(suffix)) {
                            continue;
                        }

                        const level = suffix === "" ? 1 : (this.fromRoman(suffix) || 1);

                        // Find all candidate enchantments matching this name to disambiguate homonyms
                        const candidates = [];
                        for (const [candId, candCfg] of allEnchants) {
                            if ((candCfg.name || "").toLowerCase() === targetName) {
                                candidates.push({ id: this.cleanId(candId), config: candCfg });
                            }
                        }

                        if (candidates.length > 1 && itemStack.typeId) {
                            const matched = candidates.find((c) => this.isItemCompatible(itemStack, c.config.appliesTo)) || candidates[0];
                            result[matched.id] = level;
                        } else {
                            result[cleanId] = level;
                        }
                        break;
                    }
                }
            }

            if (Object.keys(result).length > 0) return result;
        }

        // 2. Physical book typeId detection (e.g. enchanted_book_<id>_<lvl> or namespace:enchanted_book_<id>_<lvl>)
        if (itemStack.typeId) {
            const rawType = itemStack.typeId.toLowerCase();
            const cleanType = this.cleanId(rawType);
            if (cleanType.includes("enchanted_book_")) {
                const bookSuffix = cleanType.replace("enchanted_book_", "");
                const match = bookSuffix.match(/^(.+)_(\d+)$/);
                if (match) {
                    const cleanId = this.cleanId(match[1]);
                    return { [cleanId]: parseInt(match[2], 10) || 1 };
                } else {
                    const cleanId = this.cleanId(bookSuffix);
                    return { [cleanId]: 1 };
                }
            }
        }

        // 3. Dynamic property cache fallback (only if lore and book typeId absent)
        try {
            if (itemStack.getDynamicProperty) {
                const data = itemStack.getDynamicProperty("mirage:enchants")
                    || itemStack.getDynamicProperty("luminiae:enchants")
                    || itemStack.getDynamicProperty("tme:enchants")
                    || itemStack.getDynamicProperty("ench:enchants");

                if (data && typeof data === "string") {
                    const parsed = JSON.parse(data);
                    if (parsed && typeof parsed === "object") {
                        const cleanParsed = {};
                        for (const [k, v] of Object.entries(parsed)) {
                            cleanParsed[this.cleanId(k)] = v;
                        }
                        return cleanParsed;
                    }
                }
            }
        } catch (e) {}

        return {};
    }

    /**
     * Converts a Roman numeral string to an integer.
     * @param {string} str
     * @returns {number}
     */
    fromRoman(str) {
        if (!str || typeof str !== "string") return 1;
        const upper = str.toUpperCase().trim();
        const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let result = 0;
        for (let i = 0; i < upper.length; i++) {
            const curr = map[upper[i]] || 0;
            const next = map[upper[i + 1]] || 0;
            result += curr < next ? -curr : curr;
        }
        return result || 1;
    }

    /**
     * Converts an integer to a Roman numeral string.
     * @param {number} num
     * @returns {string}
     */
    toRoman(num) {
        const n = Math.floor(Number(num));
        if (isNaN(n) || n <= 0) return "I";
        const roman = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let remaining = n;
        let str = "";
        for (const [r, val] of Object.entries(roman)) {
            const q = Math.floor(remaining / val);
            remaining -= q * val;
            str += r.repeat(q);
        }
        return str || "I";
    }
}

export const enchantmentManager = new EnchantmentManager();
