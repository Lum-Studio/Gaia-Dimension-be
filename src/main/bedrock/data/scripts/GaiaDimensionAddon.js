// src/main/bedrock/ts/GaiaDimensionAddon.ts
import {
  system as system38
} from "@minecraft/server";

// src/main/bedrock/ts/blocks/leaves.ts
import {
  system
} from "@minecraft/server";

// src/main/bedrock/ts/config/leaves_particles_config.ts
var leafParticles = {
  "gaiadimension:pink_agate_leaves": "minecraft:cherry_leaves_particle",
  "gaiadimension:aura_leaves": "minecraft:spore_blossom_ambient"
};

// src/main/bedrock/ts/blocks/leaves.ts
var LeavesComponent = class {
  constructor() {
    this.onRandomTick = this.onRandomTick.bind(this);
  }
  /**
   * Spawns leaf particles randomly during a block tick.
   * @param {BlockComponentRandomTickEvent} event The block component random tick event.
   */
  onRandomTick(event) {
    if (Math.random() < 0.1) {
      const { block, dimension } = event;
      const particle = leafParticles[block.typeId];
      if (particle) {
        system.run(() => {
          if (!block.isValid) return;
          dimension.spawnParticle(particle, block.center());
        });
      }
    }
  }
};
function registerLeavesComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:leaves", new LeavesComponent());
}

// src/main/bedrock/ts/blocks/invisible.ts
import { world as world3, system as system4 } from "@minecraft/server";

// src/main/bedrock/ts/systems/event_manager.ts
import {
  world,
  system as system2,
  EquipmentSlot
} from "@minecraft/server";
var placeHandlers = [];
var breakBeforeHandlers = [];
var breakAfterHandlers = [];
var interactHandlers = [];
var spawnHandlers = [];
var joinHandlers = [];
function registerPlaceHandler(handler) {
  placeHandlers.push(handler);
}
function registerBreakHandler(handler) {
  if (handler.event === "before") {
    breakBeforeHandlers.push(handler);
  } else {
    breakAfterHandlers.push(handler);
  }
}
function registerInteractHandler(handler) {
  interactHandlers.push(handler);
}
function initializeEventManager() {
  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    system2.run(() => {
      for (const handler of placeHandlers) {
        if (handler.check(event.block)) {
          handler.execute(event);
        }
      }
    });
  });
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    for (const handler of breakBeforeHandlers) {
      if (handler.check(event.block)) {
        handler.execute(event);
      }
    }
  });
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    system2.run(() => {
      for (const handler of breakAfterHandlers) {
        if (handler.check(event)) {
          handler.execute(event);
        }
      }
    });
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block } = event;
    const equippable = player.getComponent("minecraft:equippable");
    const mainHandItem = equippable?.getEquipment(EquipmentSlot.Mainhand);
    const isHoldingBow = mainHandItem?.typeId === "minecraft:bow";
    for (const handler of interactHandlers) {
      if (handler.check(block)) {
        handler.execute(event);
        if (isHoldingBow && event.cancel) {
          event.cancel = false;
        }
      }
    }
  });
  world.afterEvents.playerSpawn.subscribe((event) => {
    system2.run(() => {
      for (const handler of spawnHandlers) {
        handler(event);
      }
    });
  });
  world.afterEvents.playerJoin.subscribe((event) => {
    system2.run(() => {
      for (const handler of joinHandlers) {
        handler(event);
      }
    });
  });
}

// src/main/bedrock/ts/systems/destruction_handler.ts
import { world as world2, system as system3 } from "@minecraft/server";
var STAIRS_TAG = "gaiadimension:stairs";
var trackedBlocks = /* @__PURE__ */ new Map();
function trackBlock(block) {
  if (!block || !block.location) return;
  const locationStr = `${block.location.x},${block.location.y},${block.location.z}`;
  if (!trackedBlocks.has(locationStr)) {
    trackedBlocks.set(locationStr, {
      typeId: block.typeId,
      dimensionId: block.dimension.id
      // Cache the dimension ID
    });
  }
}
function untrackBlock(location) {
  if (!location) return;
  const locationStr = `${location.x},${location.y},${location.z}`;
  trackedBlocks.delete(locationStr);
}
function initializeDestructionHandlers() {
  system3.runInterval(() => {
    for (const [locationStr, blockData] of [...trackedBlocks.entries()]) {
      try {
        const dimension = world2.getDimension(blockData.dimensionId);
        const coords = locationStr.split(",");
        const location = {
          x: parseInt(coords[0]),
          y: parseInt(coords[1]),
          z: parseInt(coords[2])
        };
        const block = dimension.getBlock(location);
        if (!block || block.typeId !== blockData.typeId) {
          trackedBlocks.delete(locationStr);
          continue;
        }
        let isOrphan = false;
        if (block.typeId.includes("_invisible")) {
          const parentBlock = block.below();
          if (!parentBlock || !parentBlock.typeId.includes("_fence")) {
            isOrphan = true;
          }
        }
        if (block.typeId.includes("stairs_collision")) {
          const verticalHalf = block.permutation.getState("minecraft:vertical_half");
          const parentBlock = verticalHalf === "top" ? block.above() : block.below();
          if (!parentBlock || !parentBlock.hasTag(STAIRS_TAG)) {
            isOrphan = true;
          }
        }
        if (isOrphan) {
          block.setType("minecraft:air");
          trackedBlocks.delete(locationStr);
        }
      } catch (e) {
        trackedBlocks.delete(locationStr);
      }
    }
  }, 100);
}
var UNTRACKED_SCAN_INTERVAL = 149;
var UNTRACKED_SCAN_DISTANCE = 5;
system3.runInterval(() => {
  for (const player of world2.getAllPlayers()) {
    const headLoc = player.getHeadLocation();
    const direction = player.getViewDirection();
    const dimension = player.dimension;
    for (let i = 1; i <= UNTRACKED_SCAN_DISTANCE; i++) {
      const checkLoc = {
        x: Math.floor(headLoc.x + direction.x * i),
        y: Math.floor(headLoc.y + direction.y * i),
        z: Math.floor(headLoc.z + direction.z * i)
      };
      const locStr = `${checkLoc.x},${checkLoc.y},${checkLoc.z}`;
      if (trackedBlocks.has(locStr)) continue;
      try {
        const block = dimension.getBlock(checkLoc);
        if (block && (block.typeId.includes("_invisible") || block.typeId.includes("stairs_collision"))) {
          let isOrphan = false;
          if (block.typeId.includes("_invisible")) {
            const parentBlock = block.below();
            if (!parentBlock || !parentBlock.typeId.includes("_fence")) {
              isOrphan = true;
            }
          }
          if (block.typeId.includes("stairs_collision")) {
            const verticalHalf = block.permutation.getState("minecraft:vertical_half");
            const parentBlock = verticalHalf === "top" ? block.above() : block.below();
            if (!parentBlock || !parentBlock.hasTag(STAIRS_TAG)) {
              isOrphan = true;
            }
          }
          if (isOrphan) {
            block.setType("minecraft:air");
          }
          break;
        }
      } catch (e) {
        break;
      }
    }
  }
}, UNTRACKED_SCAN_INTERVAL);

// src/main/bedrock/ts/blocks/invisible.ts
var INVISIBLE_BLOCK_ID = "gaiadimension:invisible";
var InvisibleComponent = class {
};
function registerInvisibleComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent(INVISIBLE_BLOCK_ID, new InvisibleComponent());
  registerPlaceHandler({
    check: (block) => block.typeId.startsWith("gaiadimension:") && (block.typeId.includes("_fence") || block.typeId.includes("_wall")),
    execute: (event) => {
      system4.run(() => {
        const blockAbove = event.block.above();
        if (blockAbove?.typeId === INVISIBLE_BLOCK_ID) {
          trackBlock(blockAbove);
        }
      });
    }
  });
  registerBreakHandler({
    event: "after",
    check: (event) => {
      try {
        const typeId = event.brokenBlockPermutation.type.id;
        return typeId.startsWith("gaiadimension:") && (typeId.includes("_fence") || typeId.includes("_wall"));
      } catch (e) {
        return false;
      }
    },
    execute: (event) => {
      const blockAbove = event.dimension.getBlock(event.block.location)?.above();
      if (blockAbove?.typeId === INVISIBLE_BLOCK_ID) {
        untrackBlock(blockAbove.location);
        blockAbove.setType("minecraft:air");
      }
    }
  });
  world3.afterEvents.pistonActivate.subscribe((event) => {
    const { piston, dimension } = event;
    for (const location of piston.getAttachedBlocks()) {
      const block = dimension.getBlock(location);
      if (block && block.typeId.startsWith("gaiadimension:") && (block.typeId.includes("_fence") || block.typeId.includes("_wall"))) {
        const blockAbove = block.above();
        if (blockAbove?.typeId === INVISIBLE_BLOCK_ID) {
          untrackBlock(blockAbove.location);
          blockAbove.setType("minecraft:air");
        }
      }
    }
  });
}

// src/main/bedrock/ts/blocks/curtain.ts
import { system as system5, BlockPermutation, ItemStack } from "@minecraft/server";
var activeCurtains = [];
var relativeDirs = {
  "north": { left: "west", right: "east" },
  "south": { left: "east", right: "west" },
  "east": { left: "north", right: "south" },
  "west": { left: "south", right: "north" }
};
function initializeCurtainSystem() {
  system5.runInterval(() => {
    for (let i = activeCurtains.length - 1; i >= 0; i--) {
      const curtainInfo = activeCurtains[i];
      try {
        const block = curtainInfo.dimension.getBlock(curtainInfo.location);
        if (!block || block.typeId !== curtainInfo.typeId) {
          const isLower = curtainInfo.typeId.includes("_lower") || curtainInfo.typeId.includes("_bottom");
          const otherBlockLocation = {
            x: curtainInfo.location.x,
            y: curtainInfo.location.y + (isLower ? 1 : -1),
            z: curtainInfo.location.z
          };
          const otherBlock = curtainInfo.dimension.getBlock(otherBlockLocation);
          let expectedOtherTypeId = "";
          if (curtainInfo.typeId.includes("_lower")) {
            expectedOtherTypeId = curtainInfo.typeId.replace("_lower", "_upper");
          } else if (curtainInfo.typeId.includes("_bottom")) {
            expectedOtherTypeId = curtainInfo.typeId.replace("_bottom", "_top");
          } else if (curtainInfo.typeId.includes("_upper")) {
            expectedOtherTypeId = curtainInfo.typeId.replace("_upper", "_lower");
          } else if (curtainInfo.typeId.includes("_top")) {
            expectedOtherTypeId = curtainInfo.typeId.replace("_top", "_bottom");
          }
          if (otherBlock && otherBlock.typeId === expectedOtherTypeId) {
            otherBlock.setType("minecraft:air");
            const otherIndex = activeCurtains.findIndex((d) => d.location.x === otherBlockLocation.x && d.location.y === otherBlockLocation.y && d.location.z === otherBlockLocation.z);
            if (otherIndex > -1) {
              activeCurtains.splice(otherIndex, 1);
            }
          }
          activeCurtains.splice(i, 1);
        }
      } catch (error) {
        if (error.message.includes("Could not find block")) {
          activeCurtains.splice(i, 1);
        } else {
          console.error("Error checking curtain:", error);
        }
      }
    }
  }, 100);
}
function updateCustomCurtainsFromLever(leverBlock) {
  const isLeverOn = leverBlock.permutation.getState("open_bit");
  const newState = isLeverOn;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const checkLocation = {
          x: leverBlock.location.x + x,
          y: leverBlock.location.y + y,
          z: leverBlock.location.z + z
        };
        try {
          const checkBlock = leverBlock.dimension.getBlock(checkLocation);
          if (checkBlock && !checkBlock.isAir) {
            if (checkBlock.typeId.includes("gaiadimension:") && (checkBlock.typeId.includes("curtain") || checkBlock.typeId.includes("door"))) {
              let perm = checkBlock.permutation;
              if (perm.getState("gaiadimension:open") !== void 0) {
                checkBlock.setPermutation(perm.withState("gaiadimension:open", newState));
                const isCurtain = checkBlock.typeId.includes("curtain");
                const openSound = isCurtain ? "item.book.page_turn" : "open.wooden_trapdoor";
                const closeSound = isCurtain ? "item.book.page_turn" : "close.wooden_trapdoor";
                checkBlock.dimension.playSound(newState ? openSound : closeSound, checkBlock.location, { volume: 1, pitch: 1 });
                if (checkBlock.typeId.includes("_lower") || checkBlock.typeId.includes("_bottom")) {
                  const upperBlock = checkBlock.above();
                  if (upperBlock && !upperBlock.isAir && (upperBlock.typeId.includes("_upper") || upperBlock.typeId.includes("_top"))) {
                    const upperPerm = upperBlock.permutation;
                    if (upperPerm.getState("gaiadimension:open") !== void 0) {
                      upperBlock.setPermutation(upperPerm.withState("gaiadimension:open", newState));
                      upperBlock.dimension.playSound(newState ? openSound : closeSound, upperBlock.location, { volume: 1, pitch: 1 });
                    }
                  }
                } else if (checkBlock.typeId.includes("_upper") || checkBlock.typeId.includes("_top")) {
                  const lowerBlock = checkBlock.below();
                  if (lowerBlock && !lowerBlock.isAir && (lowerBlock.typeId.includes("_lower") || lowerBlock.typeId.includes("_bottom"))) {
                    const lowerPerm = lowerBlock.permutation;
                    if (lowerPerm.getState("gaiadimension:open") !== void 0) {
                      lowerBlock.setPermutation(lowerPerm.withState("gaiadimension:open", newState));
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
        }
      }
    }
  }
}
function toggleCustomCurtain(curtainBlock, player) {
  if (curtainBlock.typeId.includes("_lower") || curtainBlock.typeId.includes("_bottom")) {
    const upperBlock = curtainBlock.above();
    if (upperBlock && (upperBlock.typeId.includes("_upper") || upperBlock.typeId.includes("_top"))) {
      toggleCustomCurtain(upperBlock, player);
      return;
    }
  }
  const perm = curtainBlock.permutation;
  const openState = perm.getState("gaiadimension:open");
  if (openState === void 0) return;
  const newState = !openState;
  curtainBlock.setPermutation(perm.withState("gaiadimension:open", newState));
  const isCurtain = curtainBlock.typeId.includes("curtain");
  const openSound = isCurtain ? "item.book.page_turn" : "random.door_open";
  const closeSound = isCurtain ? "item.book.page_turn" : "random.door_close";
  player.playSound(newState ? openSound : closeSound, { location: curtainBlock.location, volume: 1, pitch: 1 });
  const isLower = curtainBlock.typeId.includes("_lower") || curtainBlock.typeId.includes("_bottom");
  const otherBlock = isLower ? curtainBlock.above() : curtainBlock.below();
  let expectedOtherTypeId = "";
  if (curtainBlock.typeId.includes("_lower")) {
    expectedOtherTypeId = curtainBlock.typeId.replace("_lower", "_upper");
  } else if (curtainBlock.typeId.includes("_bottom")) {
    expectedOtherTypeId = curtainBlock.typeId.replace("_bottom", "_top");
  } else if (curtainBlock.typeId.includes("_upper")) {
    expectedOtherTypeId = curtainBlock.typeId.replace("_upper", "_lower");
  } else if (curtainBlock.typeId.includes("_top")) {
    expectedOtherTypeId = curtainBlock.typeId.replace("_top", "_bottom");
  }
  if (otherBlock && otherBlock.typeId === expectedOtherTypeId) {
    const otherPerm = otherBlock.permutation;
    if (otherPerm.getState("gaiadimension:open") !== void 0) {
      otherBlock.setPermutation(otherPerm.withState("gaiadimension:open", newState));
    }
  }
}
function toggleTrapdoor(block, player) {
  const isOpen = block.permutation.getState("gaiadimension:open");
  const newState = !isOpen;
  block.setPermutation(block.permutation.withState("gaiadimension:open", newState));
  player.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", { location: block.location, volume: 1, pitch: 1 });
}
function isValidNeighbor(neighbor, typeId, rotation) {
  return !!(neighbor && neighbor.typeId === typeId && neighbor.permutation.getState("minecraft:cardinal_direction") === rotation);
}
function updateToDouble(block, side) {
  system5.run(() => {
    try {
      const newTypeId = block.typeId + "_" + side;
      const topBlock = block.above();
      if (!topBlock) return;
      const newTopTypeId = topBlock.typeId + "_" + side;
      const perm = block.permutation;
      const open = perm.getState("gaiadimension:open");
      const facing = perm.getState("minecraft:cardinal_direction");
      block.setType(newTypeId);
      const newPerm = block.permutation.withState("gaiadimension:open", open).withState("minecraft:cardinal_direction", facing);
      block.setPermutation(newPerm);
      updateActiveCurtainType(block.location, newTypeId);
      if (topBlock) {
        topBlock.setType(newTopTypeId);
        const newTopPerm = topBlock.permutation.withState("gaiadimension:open", open).withState("minecraft:cardinal_direction", facing);
        topBlock.setPermutation(newTopPerm);
        updateActiveCurtainType(topBlock.location, newTopTypeId);
      }
    } catch (e) {
      console.warn("Failed to form double curtain:", e);
    }
  });
}
function updateActiveCurtainType(location, newTypeId) {
  const entry = activeCurtains.find((c) => c.location.x === location.x && c.location.y === location.y && c.location.z === location.z);
  if (entry) {
    entry.typeId = newTypeId;
  }
}
function destroyPartner(block, dimension) {
  system5.run(() => {
    try {
      const typeId = block.typeId;
      const itemName = typeId.replace("_lower", "").replace("_upper", "").replace("_bottom", "").replace("_top", "").replace("_left", "").replace("_right", "");
      try {
        dimension.spawnItem(new ItemStack(itemName, 1), block.location);
      } catch (e) {
      }
      block.setType("minecraft:air");
      removeFromActiveCurtains(block.location);
      const isBottom = typeId.includes("_bottom") || typeId.includes("_lower");
      const otherVertical = isBottom ? block.above() : block.below();
      const isValidVertical = otherVertical && (isBottom ? otherVertical.typeId.includes("_top") || otherVertical.typeId.includes("_upper") : otherVertical.typeId.includes("_bottom") || otherVertical.typeId.includes("_lower"));
      if (otherVertical && isValidVertical) {
        otherVertical.setType("minecraft:air");
        removeFromActiveCurtains(otherVertical.location);
      }
    } catch (e) {
      console.warn("Failed to destroy partner curtain:", e);
    }
  });
}
function removeFromActiveCurtains(location) {
  const index = activeCurtains.findIndex((d) => d.location.x === location.x && d.location.y === location.y && d.location.z === location.z);
  if (index > -1) {
    activeCurtains.splice(index, 1);
  }
}
function registerCurtainComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:curtain", {});
  initializeCurtainSystem();
  registerPlaceHandler({
    check: (block) => block.typeId.includes("_lower") || block.typeId.includes("_bottom"),
    execute: (event) => {
      const { block } = event;
      activeCurtains.push({ location: block.location, dimension: block.dimension, typeId: block.typeId });
      const blockAbove = block.above();
      if (blockAbove?.isAir) {
        const lowerPerm = block.permutation;
        const rotation = lowerPerm.getState("minecraft:cardinal_direction");
        let upperBlockId = "";
        if (block.typeId.includes("_lower")) {
          upperBlockId = block.typeId.replace("_lower", "_upper");
        } else if (block.typeId.includes("_bottom")) {
          upperBlockId = block.typeId.replace("_bottom", "_top");
        }
        try {
          const upperPerm = BlockPermutation.resolve(upperBlockId, {
            "minecraft:cardinal_direction": rotation
          });
          blockAbove.setPermutation(upperPerm);
          activeCurtains.push({ location: blockAbove.location, dimension: blockAbove.dimension, typeId: upperBlockId });
          if ((block.typeId.includes("_bottom") || block.typeId.includes("_lower")) && !block.typeId.includes("_left") && !block.typeId.includes("_right")) {
            const dirs = relativeDirs[rotation];
            if (dirs) {
              const rightNeighbor = block[dirs.right]();
              if (isValidNeighbor(rightNeighbor, block.typeId, rotation)) {
                updateToDouble(block, "left");
                updateToDouble(rightNeighbor, "right");
              } else {
                const leftNeighbor = block[dirs.left]();
                if (isValidNeighbor(leftNeighbor, block.typeId, rotation)) {
                  updateToDouble(leftNeighbor, "left");
                  updateToDouble(block, "right");
                }
              }
            }
          }
          for (const dir of ["north", "south", "east", "west"]) {
            const neighbor = block[dir]();
            if (neighbor?.typeId === block.typeId && neighbor.permutation.getState("minecraft:cardinal_direction") === rotation) {
              if (neighbor.permutation.getState("gaiadimension:inverse") === false) {
                block.setPermutation(block.permutation.withState("gaiadimension:inverse", true));
                blockAbove.setPermutation(blockAbove.permutation.withState("gaiadimension:inverse", true));
                break;
              }
            }
          }
        } catch (e) {
          console.error(`Could not resolve upper curtain permutation or double curtain logic for ${block.typeId}: ${e}`);
        }
      }
    }
  });
  registerBreakHandler({
    event: "before",
    check: (block) => block.typeId.includes("curtain") || block.typeId.includes("door"),
    execute: (event) => {
      const { block, player } = event;
      if (!block || !block.isValid) return;
      const location = block.location;
      const dimension = block.dimension;
      const brokenBlockTypeId = block.typeId;
      const index = activeCurtains.findIndex((d) => d.location.x === location.x && d.location.y === location.y && d.location.z === location.z);
      if (index > -1) {
        activeCurtains.splice(index, 1);
      }
      if (brokenBlockTypeId.includes("_left") || brokenBlockTypeId.includes("_right")) {
        const rotation = block.permutation.getState("minecraft:cardinal_direction");
        const dirs = relativeDirs[rotation];
        const isLeft = brokenBlockTypeId.includes("_left");
        if (dirs) {
          const partnerDir = isLeft ? dirs.right : dirs.left;
          const partner = block[partnerDir]();
          const baseType = brokenBlockTypeId.replace("_left", "").replace("_right", "");
          const partnerSuffix = isLeft ? "_right" : "_left";
          const expectedPartnerType = baseType + partnerSuffix;
          if (partner && partner.typeId === expectedPartnerType && partner.permutation.getState("minecraft:cardinal_direction") === rotation) {
            destroyPartner(partner, dimension);
          }
        }
      }
      const isLower = brokenBlockTypeId.includes("_lower") || brokenBlockTypeId.includes("_bottom");
      const otherBlockLocation = {
        x: location.x,
        y: location.y + (isLower ? 1 : -1),
        z: location.z
      };
      const otherIndex = activeCurtains.findIndex((d) => d.location.x === otherBlockLocation.x && d.location.y === otherBlockLocation.y && d.location.z === otherBlockLocation.z);
      if (otherIndex > -1) {
        activeCurtains.splice(otherIndex, 1);
      }
      const otherBlock = dimension.getBlock(otherBlockLocation);
      if (otherBlock && (otherBlock.typeId.includes("curtain") || otherBlock.typeId.includes("door"))) {
        let expectedOtherBlockId = "";
        if (brokenBlockTypeId.includes("_lower")) {
          expectedOtherBlockId = brokenBlockTypeId.replace("_lower", "_upper");
        } else if (brokenBlockTypeId.includes("_bottom")) {
          expectedOtherBlockId = brokenBlockTypeId.replace("_bottom", "_top");
        } else if (brokenBlockTypeId.includes("_upper")) {
          expectedOtherBlockId = brokenBlockTypeId.replace("_upper", "_lower");
        } else if (brokenBlockTypeId.includes("_top")) {
          expectedOtherBlockId = brokenBlockTypeId.replace("_top", "_bottom");
        }
        if (otherBlock.typeId === expectedOtherBlockId) {
          if (player.getGameMode() !== "creative") {
            const itemName = otherBlock.typeId.replace("_lower", "").replace("_upper", "").replace("_bottom", "").replace("_top", "").replace("_left", "").replace("_right", "");
            system5.run(() => {
              try {
                dimension.spawnItem(new ItemStack(itemName, 1), otherBlock.location);
              } catch (e) {
              }
            });
          }
          system5.run(() => {
            const blockToSet = dimension.getBlock(otherBlockLocation);
            if (blockToSet && blockToSet.typeId === expectedOtherBlockId) {
              blockToSet.setType("minecraft:air");
            }
          });
        }
      }
    }
  });
  registerInteractHandler({
    check: (block) => block.typeId.includes("curtain") || block.typeId.includes("door") || block.typeId.includes("trapdoor"),
    execute: (event) => {
      const { block, player } = event;
      system5.run(() => {
        if (block.typeId.includes("trapdoor")) {
          toggleTrapdoor(block, player);
        } else {
          toggleCustomCurtain(block, player);
        }
      });
    }
  });
  registerInteractHandler({
    check: (block) => block.typeId.startsWith("minecraft:") && block.typeId.includes("lever"),
    execute: (event) => {
      const { block } = event;
      system5.run(() => {
        updateCustomCurtainsFromLever(block);
      });
    }
  });
}

// src/main/bedrock/ts/blocks/wood.ts
import {
  world as world5,
  system as system6,
  BlockPermutation as BlockPermutation2,
  GameMode as GameMode2,
  Direction
} from "@minecraft/server";
function handleDoubleSlab(player, block, mainhandItem) {
  let plankId = block.typeId.replace("_slab", "_planks");
  try {
    block.setType(plankId);
  } catch (e) {
    try {
      plankId = block.typeId.replace("_slab", "_tiles");
      block.setType(plankId);
    } catch (e2) {
      console.warn(`Failed to find plank or tile type for ${block.typeId}`);
      return;
    }
  }
  try {
    player.playSound("dig.wood");
    if (player.getGameMode() === GameMode2.creative) {
      return;
    }
    const equippable = player.getComponent("equippable");
    if (!equippable) {
      return;
    }
    if (mainhandItem.amount > 1) {
      mainhandItem.amount--;
      equippable.setEquipment("Mainhand", mainhandItem);
    } else {
      equippable.setEquipment("Mainhand");
    }
  } catch (e) {
    console.warn(`Error in handleDoubleSlab post-placement: ${e}`);
  }
}
function registerWoodComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:wood", {});
  world5.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block, itemStack, blockFace } = event;
    if (block.typeId.includes("_slab") && !block.typeId.includes("sandstone") && itemStack?.typeId === block.typeId) {
      const slabState = block.permutation.getState("minecraft:vertical_half");
      const isPlacingOnTop = blockFace === Direction.Up && slabState === "bottom";
      const isPlacingOnBottom = blockFace === Direction.Down && slabState === "top";
      if (isPlacingOnTop || isPlacingOnBottom) {
        event.cancel = true;
        system6.run(() => {
          if (block.isValid && itemStack) {
            handleDoubleSlab(player, block, itemStack);
          }
        });
      }
    } else if (itemStack?.hasTag("minecraft:is_axe")) {
      event.cancel = true;
      system6.run(() => {
        const blockId = block.typeId;
        if (blockId.includes("stripped") || blockId.includes("_thin_branches")) return;
        let strippedId;
        if (blockId.includes("_log") || blockId.includes("_wood")) {
          const parts = blockId.split(":");
          strippedId = `${parts[0]}:stripped_${parts[1]}`;
        }
        if (strippedId && block.isValid) {
          if (blockId.startsWith("minecraft:")) {
            const blockState = block.permutation.getState("pillar_axis");
            if (typeof blockState === "string") {
              const strippedLog = BlockPermutation2.resolve(strippedId, { "pillar_axis": blockState });
              block.setPermutation(strippedLog);
            }
          } else {
            const blockState = block.permutation.getState("minecraft:block_face");
            if (typeof blockState === "string") {
              const strippedLog = BlockPermutation2.resolve(strippedId, { "minecraft:block_face": blockState });
              block.setPermutation(strippedLog);
            }
          }
          player.playSound("step.wood");
        }
      });
    }
  });
}

// src/main/bedrock/ts/blocks/sapling.ts
import {
  GameMode as GameMode3,
  system as system7,
  ItemStack as ItemStack3,
  EquipmentSlot as EquipmentSlot2
} from "@minecraft/server";

// src/main/bedrock/ts/config/sapling_config.ts
var saplingConfig = {
  "gaiadimension:aura_sapling": {
    structures: ["gaiadimension:aura1"],
    ground: ["minecraft:grass_block", "minecraft:dirt", "minecraft:podzol", "minecraft:mycelium", "minecraft:sand"],
    offset: { x: -7, y: 0, z: -7 }
  },
  "gaiadimension:pink_agate_sapling": {
    structures: ["gaiadimension:pink_agate_tree"],
    // Placeholder structure name
    ground: ["minecraft:grass_block", "minecraft:dirt", "minecraft:podzol", "minecraft:mycelium", "gaiadimension:pink_agate_moss"],
    // Assuming moss or similar exists, otherwise standard ground
    offset: { x: -2, y: 0, z: -2 }
    // Adjust offset based on tree size
  }
};

// src/main/bedrock/ts/blocks/sapling.ts
var SaplingComponent = class {
  // Component logic moved to handlers
};
function registerSaplingComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:sapling", new SaplingComponent());
  registerPlaceHandler({
    check: (block) => block.typeId in saplingConfig,
    execute: (event) => {
      const { block } = event;
      system7.run(() => {
        if (!block.isValid) return;
        const blockBelow = block.below();
        const config = saplingConfig[block.typeId];
        if (config && blockBelow && !config.ground.includes(blockBelow.typeId)) {
          block.dimension.spawnItem(new ItemStack3(block.typeId, 1), block.location);
          block.setType("minecraft:air");
        }
      });
    }
  });
  registerInteractHandler({
    check: (block) => block.typeId in saplingConfig,
    execute: (event) => {
      system7.run(() => {
        const { block, player, itemStack } = event;
        if (itemStack && itemStack.typeId === "minecraft:bone_meal") {
          const config = saplingConfig[block.typeId];
          if (config && Math.random() < 0.25) {
            block.dimension.spawnParticle("minecraft:crop_growth_emitter", block.location);
            const structureName = config.structures[Math.floor(Math.random() * config.structures.length)];
            block.setType("minecraft:air");
            const offset = config.offset || { x: 0, y: 0, z: 0 };
            const location = {
              x: block.location.x + offset.x,
              y: block.location.y + offset.y,
              z: block.location.z + offset.z
            };
            try {
              block.dimension.runCommand(`structure load "${structureName}" ${location.x} ${location.y} ${location.z}`);
            } catch (e) {
              console.warn(`Failed to load structure ${structureName}: ${e}`);
            }
            if (player.getGameMode() !== GameMode3.Creative) {
              const equippable = player.getComponent("minecraft:equippable");
              if (itemStack.amount > 1) {
                itemStack.amount--;
                equippable.setEquipment(EquipmentSlot2.Mainhand, itemStack);
              } else {
                equippable.setEquipment(EquipmentSlot2.Mainhand);
              }
            }
          } else if (config) {
            block.dimension.spawnParticle("minecraft:crop_growth_emitter", block.location);
            if (player.getGameMode() !== GameMode3.Creative) {
              const equippable = player.getComponent("minecraft:equippable");
              if (itemStack.amount > 1) {
                itemStack.amount--;
                equippable.setEquipment(EquipmentSlot2.Mainhand, itemStack);
              } else {
                equippable.setEquipment(EquipmentSlot2.Mainhand);
              }
            }
          }
        }
      });
    }
  });
}

// src/main/bedrock/ts/blocks/button.ts
import { system as system10 } from "@minecraft/server";

// src/main/bedrock/ts/systems/Redstone.ts
import { system as system9 } from "@minecraft/server";

// src/main/bedrock/ts/utils.ts
import { world as world6, system as system8 } from "@minecraft/server";
var VANILLA_DIMENSION_IDS = ["overworld", "the_end", "nether"];
var registeredDimensionIds = [];
function registerDimension(id) {
  if (!registeredDimensionIds.includes(id)) {
    registeredDimensionIds.push(id);
  }
}
function getDimensions() {
  const dims = [];
  for (const id of [...VANILLA_DIMENSION_IDS, ...registeredDimensionIds]) {
    try {
      dims.push(world6.getDimension(id));
    } catch {
    }
  }
  return dims;
}
function playDoorSound(block, isOpen, options = {}) {
  if (!block || !block.location || !block.dimension) {
    console.warn("Invalid block provided to playDoorSound.");
    return;
  }
  const typeId = block.typeId.toLowerCase();
  let soundId;
  if (typeId.includes("iron_door")) {
    soundId = isOpen ? "open.iron_door" : "close.iron_door";
  } else if (typeId.includes("wooden_door") || typeId.includes("door")) {
    soundId = isOpen ? "open.wooden_door" : "close.wooden_door";
  } else if (typeId.includes("iron_trapdoor")) {
    soundId = isOpen ? "open.iron_trapdoor" : "close.iron_trapdoor";
  } else if (typeId.includes("trapdoor")) {
    soundId = isOpen ? "open.wooden_trapdoor" : "close.wooden_trapdoor";
  } else if (typeId.includes("fence_gate")) {
    soundId = isOpen ? "open.fence_gate" : "close.fence_gate";
  } else {
    soundId = "random.click";
  }
  const soundOptions = {
    volume: options.volume ?? 1,
    pitch: options.pitch ?? 1
  };
  block.dimension.playSound(soundId, block.location, soundOptions);
}
var REDSTONE_COMPONENTS = ["redstone_wire", "repeater", "comparator", "redstone_torch"];
var invertFace = {
  "north": "south",
  "south": "north",
  "east": "west",
  "west": "east",
  "above": "below",
  "below": "above"
};
function getRedstonePower(block) {
  let power = block.getRedstonePower() ?? 0;
  if (power > 0) return power;
  const faces = ["north", "south", "east", "west", "below", "above"];
  for (const face of faces) {
    let neighbor;
    if (face === "north") neighbor = block.north();
    else if (face === "south") neighbor = block.south();
    else if (face === "east") neighbor = block.east();
    else if (face === "west") neighbor = block.west();
    else if (face === "above") neighbor = block.above();
    else if (face === "below") neighbor = block.below();
    if (!neighbor) continue;
    const neighborPower = neighbor.getRedstonePower() ?? 0;
    if (neighborPower > 0) {
      const isSpecialComponent = REDSTONE_COMPONENTS.some((c) => neighbor.typeId.includes(c));
      if (!isSpecialComponent) {
        return neighborPower;
      }
    }
    if (neighbor.typeId.includes("redstone_torch")) {
      const torchFacing = neighbor.permutation.getState("torch_facing_direction");
      if (torchFacing !== invertFace[face]) {
        return neighborPower;
      }
    }
  }
  const above = block.above();
  if (above?.typeId === "minecraft:daylight_detector") {
    return above.getRedstonePower() ?? 0;
  }
  return 0;
}
function sleep(ticks) {
  return new Promise((resolve) => system8.runTimeout(resolve, ticks));
}

// src/main/bedrock/ts/systems/Redstone.ts
var RedstoneControl = class {
  /**
   * Maps door keys to tracker info.
   * Internal map to keep track of doors being polled for redstone changes.
   */
  static doorTrackers = /* @__PURE__ */ new Map();
  /**
   * Wakes up the door tracking system for a specific source.
   * Call this when a button/plate is pressed.
   * @param sourceBlock - The block that initiated the signal (e.g., a button or pressure plate)
   */
  static updateRedstonePower(sourceBlock) {
    if (!sourceBlock) return;
    const doorInfos = this.traceNetworkForDoors(sourceBlock);
    for (const doorInfo of doorInfos) {
      this.trackDoor(doorInfo.block, sourceBlock);
      const doorKey = this.getBlockKey(doorInfo.block.location);
      this.checkDoorTracker(doorKey);
    }
  }
  /**
   * Adds a door to be tracked for signal timeout.
   * @param doorBlock - The door block to track
   * @param sourceBlock - The block providing the signal
   */
  static trackDoor(doorBlock, sourceBlock) {
    if (!doorBlock) return;
    let primaryDoorBlock = doorBlock;
    if (doorBlock.typeId.includes("door") && doorBlock.typeId.includes("_upper")) {
      const lowerBlock = doorBlock.below();
      if (lowerBlock && !lowerBlock.isAir && lowerBlock.typeId.includes("_lower")) {
        primaryDoorBlock = lowerBlock;
      }
    }
    const doorKey = this.getBlockKey(primaryDoorBlock.location);
    let tracker = this.doorTrackers.get(doorKey);
    if (!tracker) {
      tracker = {
        doorBlock: primaryDoorBlock,
        lastSignalTick: system9.currentTick,
        checkInterval: null
      };
      this.doorTrackers.set(doorKey, tracker);
    } else {
      tracker.lastSignalTick = system9.currentTick;
    }
    if (tracker.checkInterval === null) {
      tracker.checkInterval = system9.runInterval(() => {
        this.checkDoorTracker(doorKey);
      }, 5);
    }
  }
  /**
   * Checks a door tracker and handles redstone power logic.
   * @param doorKey - The unique key identifying the door
   */
  static checkDoorTracker(doorKey) {
    const tracker = this.doorTrackers.get(doorKey);
    if (!tracker) return;
    if (!tracker.doorBlock.isValid) {
      this.stopTracking(doorKey);
      return;
    }
    const { x, y, z } = tracker.doorBlock.location;
    const dimension = tracker.doorBlock.dimension;
    let hasActiveSignal = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const checkPos = { x: x + dx, y: y + dy, z: z + dz };
          const checkBlock = dimension.getBlock(checkPos);
          if (!checkBlock) continue;
          const redstonePower = getRedstonePower(checkBlock);
          if (redstonePower > 0) {
            hasActiveSignal = true;
            break;
          }
        }
        if (hasActiveSignal) break;
      }
      if (hasActiveSignal) break;
    }
    this.setDoorState(tracker.doorBlock, hasActiveSignal);
    if (!hasActiveSignal) {
      this.stopTracking(doorKey);
    }
  }
  /**
   * Stops tracking a door and clears its interval.
   * @param doorKey - The unique key identifying the door
   */
  static stopTracking(doorKey) {
    const tracker = this.doorTrackers.get(doorKey);
    if (tracker && tracker.checkInterval !== null) {
      system9.clearRun(tracker.checkInterval);
      tracker.checkInterval = null;
    }
    this.doorTrackers.delete(doorKey);
  }
  /**
   * Sets the state of a door (open or closed) and plays appropriate sounds.
   * @param doorBlock - The primary door block to update
   * @param open - True to open the door, false to close it
   */
  static setDoorState(doorBlock, open) {
    try {
      let lowerDoor = doorBlock;
      let upperDoor = void 0;
      if (doorBlock.typeId.includes("_upper")) {
        lowerDoor = doorBlock.below();
        upperDoor = doorBlock;
      } else {
        upperDoor = doorBlock.above();
      }
      const updateBlock = (block) => {
        if (!block || !block.isValid || !block.typeId.includes("door")) return;
        const perm = block.permutation;
        const isOpen = perm.getState("gaiadimension:open") === true;
        if (isOpen !== open) {
          block.setPermutation(perm.withState("gaiadimension:open", open));
          playDoorSound(block, open);
        }
      };
      updateBlock(lowerDoor);
      updateBlock(upperDoor);
    } catch (e) {
      console.warn("Error setting door state", e);
    }
  }
  /**
   * Compatibility wrapper: starts tracking and forcing an immediate state check.
   * @param doorBlock - The door block to open/track
   * @param sourceBlock - The block that triggered the opening
   */
  static openAndTrackDoor(doorBlock, sourceBlock) {
    this.trackDoor(doorBlock, sourceBlock);
    const key = this.getBlockKey(doorBlock.location);
    this.checkDoorTracker(key);
  }
  /**
   * Updates an existing tracker or creates a new one.
   * @param doorBlock - The door block to track
   * @param sourceBlock - The source of the redstone signal
   */
  static updateDoorTracker(doorBlock, sourceBlock) {
    this.trackDoor(doorBlock, sourceBlock);
  }
  /**
   * Traces the redstone network to find custom doors.
   * Uses simple connectivity logic (searching neighbors recursively).
   * @param sourceBlock - The starting block for tracing
   * @param maxDepth - Maximum recursion depth for the search
   * @returns Array of door block wrappers
   */
  static traceNetworkForDoors(sourceBlock, maxDepth = 15) {
    if (!sourceBlock) return [];
    const foundDoors = [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [{ block: sourceBlock, depth: 0 }];
    const dimension = sourceBlock.dimension;
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const { block, depth } = item;
      if (depth > maxDepth) continue;
      const blockKey = this.getBlockKey(block.location);
      if (visited.has(blockKey)) continue;
      visited.add(blockKey);
      const neighbors = this.getNeighbors(block.location);
      for (const neighborLoc of neighbors) {
        const neighborBlock = dimension.getBlock(neighborLoc);
        if (!neighborBlock || neighborBlock.isAir) continue;
        if (neighborBlock.typeId.includes("gaiadimension:") && neighborBlock.typeId.includes("door")) {
          const doorKey = this.getBlockKey(neighborBlock.location);
          if (!foundDoors.some((d) => this.getBlockKey(d.block.location) === doorKey)) {
            foundDoors.push({ block: neighborBlock });
          }
        }
        if (depth < maxDepth && this.isRedstoneConductor(neighborBlock)) {
          queue.push({ block: neighborBlock, depth: depth + 1 });
        }
      }
    }
    return foundDoors;
  }
  /**
   * Determines if a block can conduct/transmit redstone signals.
   * @param block - The block to check
   * @returns True if the block is a redstone component or conductor
   */
  static isRedstoneConductor(block) {
    if (!block) return false;
    const typeId = block.typeId;
    return typeId === "minecraft:redstone_wire" || typeId.includes("repeater") || typeId.includes("redstone_torch") || typeId === "minecraft:redstone_block" || typeId.includes("piston") || typeId.includes("comparator");
  }
  /**
   * Helper to get adjacent block coordinates.
   * @param location - The starting coordinates
   * @returns Array of 6 adjacent Vector3 positions
   */
  static getNeighbors(location) {
    const { x, y, z } = location;
    return [
      { x: x + 1, y, z },
      { x: x - 1, y, z },
      { x, y: y + 1, z },
      { x, y: y - 1, z },
      { x, y, z: z + 1 },
      { x, y, z: z - 1 }
    ];
  }
  /**
   * Converts a location to a string key for Map usage.
   * @param location - The block coordinates
   * @returns A string in format "x,y,z"
   */
  static getBlockKey(location) {
    return `${location.x},${location.y},${location.z}`;
  }
};

// src/main/bedrock/ts/blocks/button.ts
var BUTTON_SUFFIX = "_button";
var PRESS_DURATION = 1.5 * 20;
var VANILLA_BUTTON_DURATION = 1.5 * 20;
function isCustomButton(blockTypeId) {
  return blockTypeId.endsWith(BUTTON_SUFFIX);
}
function getSoundName(blockTypeId, isPressing) {
  if (isCustomButton(blockTypeId)) {
    return isPressing ? "click_on.bamboo_wood_button" : "click_off.bamboo_wood_button";
  }
  return "";
}
function findSolidBlock(buttonBlock) {
  const blockFace = buttonBlock.permutation.getState("minecraft:block_face");
  switch (blockFace) {
    case "down":
      return buttonBlock.above();
    case "up":
      return buttonBlock.below();
    case "north":
      return buttonBlock.south();
    case "south":
      return buttonBlock.north();
    case "west":
      return buttonBlock.east();
    case "east":
      return buttonBlock.west();
    default:
      return void 0;
  }
}
function updateCustomDoorsOnly(buttonBlock, newState) {
  const dimension = buttonBlock.dimension;
  const center = buttonBlock.location;
  const checkedDoors = /* @__PURE__ */ new Set();
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const checkLocation = { x: center.x + x, y: center.y + y, z: center.z + z };
        const block = dimension.getBlock(checkLocation);
        if (block && block.typeId.includes("door") && !block.typeId.includes("trapdoor")) {
          let lowerHalf, upperHalf;
          if (block.typeId.includes("_lower")) {
            lowerHalf = block;
            upperHalf = block.above();
          } else if (block.typeId.includes("_upper")) {
            upperHalf = block;
            lowerHalf = block.below();
          } else {
            continue;
          }
          if (!lowerHalf || !upperHalf || !lowerHalf.typeId.includes("_lower") || !upperHalf.typeId.includes("_upper")) {
            continue;
          }
          const lowerKey = `${lowerHalf.location.x},${lowerHalf.location.y},${lowerHalf.location.z}`;
          if (checkedDoors.has(lowerKey)) {
            continue;
          }
          checkedDoors.add(lowerKey);
          const blocksToToggle = [lowerHalf, upperHalf];
          for (const doorBlock of blocksToToggle) {
            const perm = doorBlock.permutation;
            const isOpen = perm.getState("gaiadimension:open");
            if (isOpen !== void 0 && isOpen !== newState) {
              doorBlock.setPermutation(perm.withState("gaiadimension:open", newState));
              doorBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", doorBlock.location, { volume: 1, pitch: 1 });
              if (newState) {
                RedstoneControl.openAndTrackDoor(doorBlock, buttonBlock);
              } else {
                RedstoneControl.updateDoorTracker(doorBlock, buttonBlock);
              }
            }
          }
        }
      }
    }
  }
}
function handleCustomButtonPress(player, block) {
  const currentState = block.permutation.getState("gaiadimension:pressed");
  if (currentState === false) {
    block.setPermutation(block.permutation.withState("gaiadimension:pressed", true));
    const pressSound = getSoundName(block.typeId, true);
    if (pressSound) {
      player.playSound(pressSound, { location: block.location, volume: 1, pitch: 1 });
    }
    const attachedBlock = findSolidBlock(block);
    if (attachedBlock) {
      RedstoneControl.updateRedstonePower(block);
    }
    system10.runTimeout(() => {
      if (block.isValid) {
        try {
          block.setPermutation(block.permutation.withState("gaiadimension:pressed", false));
        } catch (e) {
        }
        const releaseSound = getSoundName(block.typeId, false);
        if (releaseSound) {
          player.playSound(releaseSound, { location: block.location, volume: 1, pitch: 1 });
        }
      }
    }, PRESS_DURATION);
  }
}
function registerButtonComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:button", {});
  registerInteractHandler({
    check: (block) => block.typeId.startsWith("minecraft:") && (block.typeId.includes("button") || block.typeId.includes("lever")),
    execute: (event) => {
      system10.run(() => {
        const { player, block } = event;
        if (block.typeId.includes("button")) {
          updateCustomDoorsOnly(block, true);
          const foundDoors = RedstoneControl.traceNetworkForDoors(block);
          for (const doorInfo of foundDoors) {
            RedstoneControl.openAndTrackDoor(doorInfo.block, block);
          }
          system10.runTimeout(() => {
            updateCustomDoorsOnly(block, false);
          }, VANILLA_BUTTON_DURATION);
        } else if (block.typeId.includes("lever")) {
          updateCustomDoorsOnly(block, true);
          const foundDoors = RedstoneControl.traceNetworkForDoors(block);
          for (const doorInfo of foundDoors) {
            RedstoneControl.openAndTrackDoor(doorInfo.block, block);
          }
        }
      });
    }
  });
  registerInteractHandler({
    check: (block) => isCustomButton(block.typeId),
    execute: (event) => {
      system10.run(() => handleCustomButtonPress(event.player, event.block));
    }
  });
}

// src/main/bedrock/ts/blocks/pressure_plate.ts
import { system as system11, world as world7 } from "@minecraft/server";
var PRESSURE_PLATE_SUFFIX = "_pressure_plate";
var doorStates = /* @__PURE__ */ new Map();
function isPressurePlate(blockTypeId) {
  if (blockTypeId.startsWith("minecraft:")) {
    return false;
  }
  return blockTypeId.endsWith(PRESSURE_PLATE_SUFFIX);
}
function isVanillaPressurePlate(blockTypeId) {
  return blockTypeId.startsWith("minecraft:") && blockTypeId.includes("pressure_plate");
}
function updateNeighbors(block, newState, sourceId) {
  const directions = ["north", "south", "east", "west"];
  for (const dir of directions) {
    let neighborBlock;
    try {
      if (dir === "north") neighborBlock = block.north();
      else if (dir === "south") neighborBlock = block.south();
      else if (dir === "east") neighborBlock = block.east();
      else if (dir === "west") neighborBlock = block.west();
    } catch (e) {
    }
    if (neighborBlock) {
      const perm = neighborBlock.permutation;
      if (neighborBlock.typeId.startsWith("gaiadimension:") && neighborBlock.typeId.includes("door")) {
        if (perm.getState("gaiadimension:open") !== void 0) {
          const oldState = perm.getState("gaiadimension:open");
          const doorKey = `${neighborBlock.dimension.id},${neighborBlock.location.x},${neighborBlock.location.y},${neighborBlock.location.z}`;
          const currentDoorState = doorStates.get(doorKey) || false;
          if (currentDoorState !== newState) {
            neighborBlock.setPermutation(perm.withState("gaiadimension:open", newState));
            if (oldState !== newState) {
              neighborBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", neighborBlock.location, { volume: 1, pitch: 1 });
            }
            doorStates.set(doorKey, newState);
            if (newState) {
              RedstoneControl.openAndTrackDoor(neighborBlock, block);
            } else {
              RedstoneControl.updateDoorTracker(neighborBlock, block);
            }
          }
          doorStates.set(doorKey, newState);
        }
        if (neighborBlock.typeId.includes("_lower")) {
          const upperBlock = neighborBlock.above();
          if (upperBlock && !upperBlock.isAir && upperBlock.typeId.includes("_upper")) {
            const upperPerm = upperBlock.permutation;
            if (upperPerm.getState("gaiadimension:open") !== void 0) {
              const oldState = upperPerm.getState("gaiadimension:open");
              const upperDoorKey = `${upperBlock.dimension.id},${upperBlock.location.x},${upperBlock.location.y},${upperBlock.location.z}`;
              const currentUpperDoorState = doorStates.get(upperDoorKey) || false;
              if (currentUpperDoorState !== newState) {
                upperBlock.setPermutation(upperPerm.withState("gaiadimension:open", newState));
                if (oldState !== newState) {
                  upperBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", upperBlock.location, { volume: 1, pitch: 1 });
                }
                doorStates.set(upperDoorKey, newState);
              }
            }
          }
        } else if (neighborBlock.typeId.includes("_upper")) {
          const lowerBlock = neighborBlock.below();
          if (lowerBlock && !lowerBlock.isAir && lowerBlock.typeId.includes("_lower")) {
            const lowerPerm = lowerBlock.permutation;
            if (lowerPerm.getState("gaiadimension:open") !== void 0) {
              const oldState = lowerPerm.getState("gaiadimension:open");
              const lowerDoorKey = `${lowerBlock.dimension.id},${lowerBlock.location.x},${lowerBlock.location.y},${lowerBlock.location.z}`;
              const currentLowerDoorState = doorStates.get(lowerDoorKey) || false;
              if (currentLowerDoorState !== newState) {
                lowerBlock.setPermutation(lowerPerm.withState("gaiadimension:open", newState));
                if (oldState !== newState) {
                  lowerBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", lowerBlock.location, { volume: 1, pitch: 1 });
                }
                doorStates.set(lowerDoorKey, newState);
              }
            }
          }
        }
      } else if (neighborBlock.typeId.startsWith("minecraft:") && perm.getState("open_bit") !== void 0 && !neighborBlock.typeId.includes("lever")) {
        const oldState = perm.getState("open_bit");
        neighborBlock.setPermutation(perm.withState("open_bit", newState));
        if (oldState !== newState) {
          neighborBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", neighborBlock.location, { volume: 1, pitch: 1 });
        }
      } else if (neighborBlock.typeId.startsWith("minecraft:") && perm.getState("open") !== void 0 && !neighborBlock.typeId.includes("lever")) {
        const oldState = perm.getState("open");
        neighborBlock.setPermutation(perm.withState("open", newState));
        if (oldState !== newState) {
          neighborBlock.dimension.playSound(newState ? "open.wooden_trapdoor" : "close.wooden_trapdoor", neighborBlock.location, { volume: 1, pitch: 1 });
        }
      }
    }
  }
  if (newState) {
    RedstoneControl.updateRedstonePower(block);
  }
}
function checkAdjacentCustomDoors(block, open) {
  const dimension = block.dimension;
  const { x, y, z } = block.location;
  const adjacentPositions = [
    { x: x + 1, y, z },
    { x: x - 1, y, z },
    { x, y, z: z + 1 },
    { x, y, z: z - 1 },
    { x, y: y + 1, z },
    { x, y: y - 1, z }
  ];
  for (const pos of adjacentPositions) {
    const adjacentBlock = dimension.getBlock(pos);
    if (adjacentBlock && adjacentBlock.typeId.startsWith("gaiadimension:") && adjacentBlock.typeId.includes("door")) {
      const doorKey = `${adjacentBlock.dimension.id},${adjacentBlock.location.x},${adjacentBlock.location.y},${adjacentBlock.location.z}`;
      const activationKey = `${doorKey}_activators`;
      const activators = doorStates.get(activationKey) || /* @__PURE__ */ new Set();
      const plateKey = `${block.dimension.id},${block.location.x},${block.location.y},${block.location.z}`;
      if (open) {
        activators.add(plateKey);
      } else {
        activators.delete(plateKey);
      }
      doorStates.set(activationKey, activators);
      const shouldDoorBeOpen = activators.size > 0;
      const currentDoorState = doorStates.get(doorKey) || false;
      if (currentDoorState !== shouldDoorBeOpen) {
        const perm = adjacentBlock.permutation;
        if (perm.getState("gaiadimension:open") !== void 0 && perm.getState("gaiadimension:open") !== shouldDoorBeOpen) {
          adjacentBlock.setPermutation(perm.withState("gaiadimension:open", shouldDoorBeOpen));
          dimension.playSound(shouldDoorBeOpen ? "open.wooden_trapdoor" : "close.wooden_trapdoor", adjacentBlock.location, { volume: 1, pitch: 1 });
          doorStates.set(doorKey, shouldDoorBeOpen);
          if (shouldDoorBeOpen) {
            RedstoneControl.openAndTrackDoor(adjacentBlock, block);
          } else {
            RedstoneControl.updateDoorTracker(adjacentBlock, block);
          }
        }
        if (adjacentBlock.typeId.includes("door")) {
          if (adjacentBlock.typeId.includes("_lower")) {
            const upperBlock = adjacentBlock.above();
            if (upperBlock && !upperBlock.isAir && upperBlock.typeId.includes("_upper")) {
              const upperPerm = upperBlock.permutation;
              if (upperPerm.getState("gaiadimension:open") !== void 0 && upperPerm.getState("gaiadimension:open") !== shouldDoorBeOpen) {
                upperBlock.setPermutation(upperPerm.withState("gaiadimension:open", shouldDoorBeOpen));
                dimension.playSound(shouldDoorBeOpen ? "open.wooden_trapdoor" : "close.wooden_trapdoor", upperBlock.location, { volume: 1, pitch: 1 });
                const upperDoorKey = `${upperBlock.dimension.id},${upperBlock.location.x},${upperBlock.location.y},${upperBlock.location.z}`;
                doorStates.set(upperDoorKey, shouldDoorBeOpen);
                if (shouldDoorBeOpen) {
                  RedstoneControl.openAndTrackDoor(upperBlock, block);
                } else {
                  RedstoneControl.updateDoorTracker(upperBlock, block);
                }
              }
            }
          } else if (adjacentBlock.typeId.includes("_upper")) {
            const lowerBlock = adjacentBlock.below();
            if (lowerBlock && !lowerBlock.isAir && lowerBlock.typeId.includes("_lower")) {
              const lowerPerm = lowerBlock.permutation;
              if (lowerPerm.getState("gaiadimension:open") !== void 0 && lowerPerm.getState("gaiadimension:open") !== shouldDoorBeOpen) {
                lowerBlock.setPermutation(lowerPerm.withState("gaiadimension:open", shouldDoorBeOpen));
                dimension.playSound(shouldDoorBeOpen ? "open.wooden_trapdoor" : "close.wooden_trapdoor", lowerBlock.location, { volume: 1, pitch: 1 });
                const lowerDoorKey = `${lowerBlock.dimension.id},${lowerBlock.location.x},${lowerBlock.location.y},${lowerBlock.location.z}`;
                doorStates.set(lowerDoorKey, shouldDoorBeOpen);
                if (shouldDoorBeOpen) {
                  RedstoneControl.openAndTrackDoor(lowerBlock, block);
                } else {
                  RedstoneControl.updateDoorTracker(lowerBlock, block);
                }
              }
            }
          }
        }
      }
    }
  }
}
function cleanupDoorStates() {
  const keysToDelete = [];
  for (const doorKey of doorStates.keys()) {
    if (doorKey.endsWith("_activators")) {
      continue;
    }
    try {
      const parts = doorKey.split(",");
      const dimensionId = parts[0];
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      const dimension = world7.getDimension(dimensionId);
      const block = dimension.getBlock({ x, y, z });
      if (!block || !block.typeId.startsWith("gaiadimension:") || !block.typeId.includes("door")) {
        keysToDelete.push(doorKey);
        keysToDelete.push(`${doorKey}_activators`);
      }
    } catch (e) {
    }
  }
  for (const key of keysToDelete) {
    doorStates.delete(key);
  }
  const orphanedActivatorKeys = [];
  for (const key of doorStates.keys()) {
    if (key.endsWith("_activators")) {
      const doorKey = key.substring(0, key.length - 11);
      if (!doorStates.has(doorKey)) {
        orphanedActivatorKeys.push(key);
      }
    }
  }
  for (const key of orphanedActivatorKeys) {
    doorStates.delete(key);
  }
}
var activePlates = /* @__PURE__ */ new Set();
system11.runInterval(() => {
  const players = world7.getAllPlayers();
  const newlyActivePlates = /* @__PURE__ */ new Set();
  for (const player of players) {
    try {
      const loc = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
      const headBlock = player.dimension.getBlock(loc);
      const blockBelow = player.dimension.getBlock({ x: loc.x, y: loc.y - 1, z: loc.z });
      if (headBlock && (isPressurePlate(headBlock.typeId) || isVanillaPressurePlate(headBlock.typeId))) {
        const key = `${headBlock.dimension.id},${headBlock.location.x},${headBlock.location.y},${headBlock.location.z}`;
        newlyActivePlates.add(key);
      }
      if (blockBelow && (isPressurePlate(blockBelow.typeId) || isVanillaPressurePlate(blockBelow.typeId))) {
        const key = `${blockBelow.dimension.id},${blockBelow.location.x},${blockBelow.location.y},${blockBelow.location.z}`;
        newlyActivePlates.add(key);
      }
    } catch (e) {
    }
  }
  for (const plateKey of newlyActivePlates) {
    if (!activePlates.has(plateKey)) {
      try {
        const parts = plateKey.split(",");
        const dimensionId = parts[0];
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const z = Number(parts[3]);
        const dimension = world7.getDimension(dimensionId);
        const block = dimension.getBlock({ x, y, z });
        if (block) {
          if (isPressurePlate(block.typeId)) {
            block.setPermutation(block.permutation.withState("gaiadimension:pressed", true));
            block.dimension.playSound("click_on.wooden_pressure_plate", block.location, { volume: 1, pitch: 1 });
            const sourceId = `pressure_plate_${x}_${y}_${z}`;
            updateNeighbors(block, true, sourceId);
          } else if (isVanillaPressurePlate(block.typeId)) {
            const sourceId = `pressure_plate_${block.location.x}_${block.location.y}_${block.location.z}`;
            updateNeighbors(block, true, sourceId);
            checkAdjacentCustomDoors(block, true);
          }
        }
      } catch (e) {
      }
    }
  }
  for (const plateKey of activePlates) {
    if (!newlyActivePlates.has(plateKey)) {
      try {
        const parts = plateKey.split(",");
        const dimensionId = parts[0];
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const z = Number(parts[3]);
        const dimension = world7.getDimension(dimensionId);
        const block = dimension.getBlock({ x, y, z });
        if (block && (isPressurePlate(block.typeId) || isVanillaPressurePlate(block.typeId))) {
          if (isPressurePlate(block.typeId)) {
            block.setPermutation(block.permutation.withState("gaiadimension:pressed", false));
            block.dimension.playSound("click_off.wooden_pressure_plate", block.location, { volume: 1, pitch: 1 });
            const sourceId = `pressure_plate_${x}_${y}_${z}`;
            updateNeighbors(block, false, sourceId);
          } else if (isVanillaPressurePlate(block.typeId)) {
            const sourceId = `pressure_plate_${block.location.x}_${block.location.y}_${block.location.z}`;
            updateNeighbors(block, false, sourceId);
            checkAdjacentCustomDoors(block, false);
          }
        }
      } catch (e) {
      }
    }
  }
  activePlates = newlyActivePlates;
}, 2);
system11.runInterval(() => {
  cleanupDoorStates();
}, 1200);
var PressurePlateComponent = class {
  // This is a dummy component just for identification
};
function registerPressurePlateComponent({ blockComponentRegistry }) {
  const pressurePlateComponent = new PressurePlateComponent();
  blockComponentRegistry.registerCustomComponent("gaiadimension:pressure_plate", pressurePlateComponent);
}

// src/main/bedrock/ts/blocks/stairs.ts
import {
  system as system13,
  BlockPermutation as BlockPermutation4
} from "@minecraft/server";

// src/main/bedrock/ts/systems/BlockUpdate.ts
import { world as world8, system as system12 } from "@minecraft/server";
var blockUpdateRegistry = [];
function registerForBlockUpdates(registration) {
  blockUpdateRegistry.push(registration);
}
function updateNeighboringBlocks(block) {
  if (!block || !block.dimension) return;
  const neighbors = [
    block.north(),
    block.south(),
    block.east(),
    block.west(),
    block.above(),
    block.below()
  ];
  for (const neighbor of neighbors) {
    if (!neighbor) continue;
    for (const registration of blockUpdateRegistry) {
      if (registration.check(neighbor)) {
        registration.update(neighbor);
      }
    }
  }
}
world8.afterEvents.pistonActivate.subscribe((event) => {
  const { piston, dimension } = event;
  system12.run(() => {
    const locations = piston.getAttachedBlocks();
    for (const location of locations) {
      const block = dimension.getBlock(location);
      if (block) {
        updateNeighboringBlocks(block);
      }
    }
  });
});
world8.afterEvents.explosion.subscribe((event) => {
  const { dimension } = event;
  const locations = event.getImpactedBlocks();
  for (const location of locations) {
    const block = dimension.getBlock(location);
    if (block) {
      updateNeighboringBlocks(block);
    }
  }
});

// src/main/bedrock/ts/blocks/stairs.ts
var type = "gaiadimension:type";
var tag = "gaiadimension:stairs";
var componentName = "gaiadimension:stairs";
var blocker = "gaiadimension:stairs_collision";
function updateNeighbors2(block) {
  const neighbors = [
    block.north(),
    block.south(),
    block.east(),
    block.west(),
    block.above(),
    block.below()
  ];
  for (const neighbor of neighbors) {
    if (neighbor && neighbor.isValid && neighbor.hasTag(tag)) {
      system13.run(() => updateStair(neighbor));
    }
  }
}
function updateBlocker(block) {
  const above = block.above();
  const below = block.below();
  if (above && above.isValid && above.typeId === blocker && above.permutation.getState("minecraft:vertical_half") === "bottom") {
    above.setPermutation(BlockPermutation4.resolve("minecraft:air"));
  } else if (below && below.isValid && below.typeId === blocker && below.permutation.getState("minecraft:vertical_half") === "top") {
    below.setPermutation(BlockPermutation4.resolve("minecraft:air"));
  }
}
function updateStair(block) {
  if (!block || !block.isValid || !block.hasTag(tag)) return;
  try {
    updateBlocker(block);
    const north = block.north();
    const south = block.south();
    const east = block.east();
    const west = block.west();
    const above = block.above();
    const direction = block.permutation.getState("minecraft:cardinal_direction");
    const stairHalf = block.permutation.getState("minecraft:vertical_half");
    const getStairShape = (neighbor) => {
      if (!neighbor || !neighbor.isValid || !neighbor.typeId || !neighbor.permutation) return { half: void 0, direction: void 0 };
      if (neighbor.hasTag(tag)) {
        return {
          half: neighbor.permutation.getState("minecraft:vertical_half"),
          direction: neighbor.permutation.getState("minecraft:cardinal_direction")
        };
      } else if (neighbor.typeId.includes("minecraft:") && neighbor.typeId.includes("stairs")) {
        const upsideDown = neighbor.permutation.getState("upside_down_bit");
        const directionValue = neighbor.permutation.getState("weirdo_direction");
        const half = upsideDown ? "top" : "bottom";
        let direction2;
        switch (directionValue) {
          case 0:
            direction2 = "east";
            break;
          case 1:
            direction2 = "west";
            break;
          case 2:
            direction2 = "south";
            break;
          case 3:
            direction2 = "north";
            break;
        }
        return { half, direction: direction2 };
      }
      return { half: void 0, direction: void 0 };
    };
    const validNeighbor = (neighbor, dir) => {
      const shape = getStairShape(neighbor);
      return shape.half === stairHalf && shape.direction === dir;
    };
    let toPlace = 1;
    if (direction === "north") {
      if (validNeighbor(north, "west")) toPlace = 4;
      else if (validNeighbor(north, "east")) toPlace = 5;
      else if (validNeighbor(south, "west")) toPlace = 2;
      else if (validNeighbor(south, "east")) toPlace = 3;
    } else if (direction === "south") {
      if (validNeighbor(north, "west")) toPlace = 3;
      else if (validNeighbor(north, "east")) toPlace = 2;
      else if (validNeighbor(south, "west")) toPlace = 4;
      else if (validNeighbor(south, "east")) toPlace = 5;
    } else if (direction === "west") {
      if (validNeighbor(west, "north")) toPlace = 5;
      else if (validNeighbor(west, "south")) toPlace = 4;
      else if (validNeighbor(east, "north")) toPlace = 3;
      else if (validNeighbor(east, "south")) toPlace = 2;
    } else if (direction === "east") {
      if (validNeighbor(west, "north")) toPlace = 2;
      else if (validNeighbor(west, "south")) toPlace = 3;
      else if (validNeighbor(east, "north")) toPlace = 5;
      else if (validNeighbor(east, "south")) toPlace = 4;
    }
    block.setPermutation(block.permutation.withState(type, toPlace));
    const target = stairHalf === "bottom" ? above : block.below();
    if (target && target.isValid && (target.isAir || target.typeId === "minecraft:water" || target.typeId.includes("piston_arm"))) {
      let directionState = direction;
      if (toPlace === 4) {
        if (direction === "north") directionState = "west";
        else if (direction === "west") directionState = "south";
        else if (direction === "south") directionState = "west";
        else if (direction === "east") directionState = "south";
      } else if (toPlace === 5) {
        if (direction === "south") directionState = "east";
        else if (direction === "east") directionState = "north";
        else if (direction === "north") directionState = "east";
        else if (direction === "west") directionState = "north";
      }
      target.setPermutation(
        BlockPermutation4.resolve(blocker).withState("minecraft:cardinal_direction", directionState).withState("minecraft:vertical_half", stairHalf).withState("gaiadimension:corner", toPlace > 3)
      );
      trackBlock(target);
    }
  } catch (e) {
    console.error(`Error updating stair at ${block.location.x}, ${block.location.y}, ${block.location.z}: ${e}`);
  }
}
function registerStairsComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent(componentName, {
    // The component is now primarily for identification.
    // The main logic is handled by the block update system and direct event handling.
  });
  registerForBlockUpdates({
    check: (block) => block && block.isValid && block.hasTag(tag),
    update: updateStair
  });
  registerPlaceHandler({
    check: (block) => block && block.isValid && (block.hasTag(tag) || (block.north()?.hasTag(tag) ?? false) || (block.south()?.hasTag(tag) ?? false) || (block.east()?.hasTag(tag) ?? false) || (block.west()?.hasTag(tag) ?? false) || (block.above()?.hasTag(tag) ?? false) || (block.below()?.hasTag(tag) ?? false)),
    execute: (event) => {
      const { block } = event;
      const blockBelow = block.below();
      if (block.hasTag(tag)) {
        system13.run(() => updateStair(block));
      }
      if (block.hasTag(tag) && blockBelow && blockBelow.isValid && blockBelow.hasTag(tag)) {
      } else {
        updateNeighbors2(block);
      }
    }
  });
  registerBreakHandler({
    event: "before",
    check: (block) => block && block.isValid && block.hasTag(tag),
    execute: (event) => {
      const { block } = event;
      if (!block || !block.isValid) return;
      system13.run(() => {
        const above = block.above();
        const below = block.below();
        if (above && above.isValid && above.typeId.includes("stairs_collision")) {
          untrackBlock(above.location);
          above.setPermutation(BlockPermutation4.resolve("minecraft:air"));
        }
        if (below && below.isValid && below.typeId === blocker) {
          untrackBlock(below.location);
          below.setPermutation(BlockPermutation4.resolve("minecraft:air"));
        }
      });
    }
  });
  registerBreakHandler({
    event: "after",
    check: (event) => {
      try {
        const { block, dimension } = event;
        const { x, y, z } = block.location;
        const north = dimension.getBlock({ x, y, z: z - 1 });
        const south = dimension.getBlock({ x, y, z: z + 1 });
        const east = dimension.getBlock({ x: x + 1, y, z });
        const west = dimension.getBlock({ x: x - 1, y, z });
        const above = dimension.getBlock({ x, y: y + 1, z });
        const below = dimension.getBlock({ x, y: y - 1, z });
        return [north, south, east, west, above, below].some((b) => b && b.isValid && b.hasTag(tag));
      } catch (e) {
        return false;
      }
    },
    execute: (event) => {
      const { block, dimension } = event;
      if (!block) return;
      const blockAtPos = dimension.getBlock(block.location);
      if (blockAtPos && blockAtPos.isValid) {
        updateNeighbors2(blockAtPos);
        updateBlocker(blockAtPos);
      }
    }
  });
}

// src/main/bedrock/ts/blocks/sign.ts
import {
  system as system14,
  world as world9,
  TextPrimitive,
  EquipmentSlot as EquipmentSlot3
} from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
var editingPlayers = /* @__PURE__ */ new Set();
var CHARS_PER_LINE = 15;
var MAX_LINES = 4;
var STANDING_BOARD_CENTER_Y = 0.58;
var STANDING_BOARD_Z = -0.06;
var WALL_BOARD_CENTER_Y = 0.3;
var WALL_BOARD_Z = 0.41;
var HANGING_BOARD_CENTER_Y = 0.3;
var HANGING_BOARD_Z = -0.08;
var TEXT_SCALE = 0.5;
var HANGING_TEXT_SCALE = 0.5;
var DEFAULT_TEXT_COLOR = { red: 0, green: 0, blue: 0, alpha: 1 };
var activePrimitives = /* @__PURE__ */ new Map();
function isGaiaSign(block) {
  return block.typeId.includes("gaiadimension") && block.typeId.includes("sign");
}
function signKey(loc) {
  return `${loc.x},${loc.y},${loc.z}`;
}
function playerYawToRotationIndex(yaw) {
  const facing = (-yaw % 360 + 360) % 360;
  const index = Math.round(facing / 22.5) % 16;
  return index;
}
function rotationIndexToDegrees(index) {
  return index * 22.5 % 360;
}
function getSignText(block) {
  const base = `sign_${block.location.x}_${block.location.y}_${block.location.z}`;
  const frontProp = world9.getDynamicProperty(`${base}_front`);
  const backProp = world9.getDynamicProperty(`${base}_back`);
  return {
    front: typeof frontProp === "string" ? frontProp : "",
    back: typeof backProp === "string" ? backProp : ""
  };
}
function setSignText(block, front, back) {
  const base = `sign_${block.location.x}_${block.location.y}_${block.location.z}`;
  world9.setDynamicProperty(`${base}_front`, front);
  world9.setDynamicProperty(`${base}_back`, back);
}
function wrapText(input) {
  const words = input.split(" ");
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length > 0 && currentLine.length + 1 + word.length > CHARS_PER_LINE) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= MAX_LINES) break;
    } else {
      currentLine = currentLine.length > 0 ? currentLine + " " + word : word;
    }
    while (currentLine.length > CHARS_PER_LINE && lines.length < MAX_LINES) {
      lines.push(currentLine.substring(0, CHARS_PER_LINE));
      currentLine = currentLine.substring(CHARS_PER_LINE);
    }
  }
  if (currentLine.length > 0 && lines.length < MAX_LINES) {
    lines.push(currentLine);
  }
  return lines.join("\n");
}
function clearSignPrimitives(loc) {
  const key = signKey(loc);
  const existing = activePrimitives.get(key);
  if (existing) {
    try {
      existing.front?.remove();
    } catch (e) {
    }
    try {
      existing.back?.remove();
    } catch (e) {
    }
    activePrimitives.delete(key);
  }
}
function spawnSignText(block, frontText, backText) {
  const blockX = block.location.x + 0.5;
  const blockY = block.location.y;
  const blockZ = block.location.z + 0.5;
  const dim = block.dimension;
  const rotIndexState = block.permutation.getState("gaiadimension:rotation");
  const rotIndex = typeof rotIndexState === "number" ? rotIndexState : 0;
  let isWall = false;
  try {
    const wallState = block.permutation.getState("gaiadimension:wall_attached");
    if (typeof wallState === "boolean") isWall = wallState;
  } catch (e) {
  }
  const isHanging = block.typeId.includes("hanging");
  const blockRotDeg = rotationIndexToDegrees(rotIndex);
  const boneRotDeg = -blockRotDeg;
  const boneRotRad = boneRotDeg * Math.PI / 180;
  const boardCenterY = isHanging ? HANGING_BOARD_CENTER_Y : isWall ? WALL_BOARD_CENTER_Y : STANDING_BOARD_CENTER_Y;
  const boardZ = isHanging ? HANGING_BOARD_Z : isWall ? WALL_BOARD_Z : STANDING_BOARD_Z;
  const textScale = isHanging ? HANGING_TEXT_SCALE : TEXT_SCALE;
  const frontYaw = ((boneRotDeg + 180) % 360 + 360) % 360;
  const backYaw = (boneRotDeg % 360 + 360) % 360;
  const cosR = Math.cos(boneRotRad);
  const sinR = Math.sin(boneRotRad);
  const key = signKey(block.location);
  const primitives = {};
  if (frontText.length > 0) {
    const wrappedFront = wrapText(frontText);
    const localZ = boardZ;
    const worldX = blockX + -localZ * sinR;
    const worldZ = blockZ + localZ * cosR;
    const worldY = blockY + boardCenterY;
    const frontPrim = new TextPrimitive(
      { x: worldX, y: worldY, z: worldZ },
      wrappedFront
    );
    frontPrim.useRotation = true;
    frontPrim.rotation = { x: 0, y: frontYaw, z: 0 };
    frontPrim.scale = textScale;
    frontPrim.depthTest = true;
    frontPrim.backfaceVisible = false;
    frontPrim.textBackfaceVisible = false;
    frontPrim.color = DEFAULT_TEXT_COLOR;
    frontPrim.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0 };
    try {
      world9.primitiveShapesManager.addText(frontPrim, dim);
      primitives.front = frontPrim;
    } catch (e) {
      console.warn(`[Sign] Failed to add front TextPrimitive: ${e}`);
    }
  }
  if (backText.length > 0) {
    const wrappedBack = wrapText(backText);
    const localZ = -boardZ;
    const worldX = blockX + -localZ * sinR;
    const worldZ = blockZ + localZ * cosR;
    const worldY = blockY + boardCenterY;
    const backPrim = new TextPrimitive(
      { x: worldX, y: worldY, z: worldZ },
      wrappedBack
    );
    backPrim.useRotation = true;
    backPrim.rotation = { x: 0, y: backYaw, z: 0 };
    backPrim.scale = textScale;
    backPrim.depthTest = true;
    backPrim.backfaceVisible = false;
    backPrim.textBackfaceVisible = false;
    backPrim.color = DEFAULT_TEXT_COLOR;
    backPrim.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0 };
    try {
      world9.primitiveShapesManager.addText(backPrim, dim);
      primitives.back = backPrim;
    } catch (e) {
      console.warn(`[Sign] Failed to add back TextPrimitive: ${e}`);
    }
  }
  activePrimitives.set(key, primitives);
  setSignText(block, frontText, backText);
}
function openSignUI(player, block) {
  const playerId = player.id;
  if (editingPlayers.has(playerId)) return;
  editingPlayers.add(playerId);
  const existing = getSignText(block);
  const isHanging = block.typeId.includes("hanging");
  let editingBack = false;
  if (isHanging) {
    const rotIndexState = block.permutation.getState("gaiadimension:rotation");
    const rotIndex = typeof rotIndexState === "number" ? rotIndexState : 0;
    const entityRotDeg = ((-rotIndex * 22.5 + 180) % 360 + 360) % 360;
    const entityRotRad = entityRotDeg * Math.PI / 180;
    const nx = -Math.sin(entityRotRad);
    const nz = Math.cos(entityRotRad);
    const dx = player.location.x - (block.location.x + 0.5);
    const dz = player.location.z - (block.location.z + 0.5);
    editingBack = dx * nx + dz * nz < 0;
  }
  const currentText = editingBack ? existing.back : existing.front;
  const ui = new ModalFormData();
  ui.title(isHanging && editingBack ? "Edit Sign (Back)" : "Edit Sign");
  ui.textField("Sign Text", "Type here...", { defaultValue: currentText || "" });
  ui.show(player).then((response) => {
    editingPlayers.delete(playerId);
    if (response.canceled || !response.formValues) return;
    const newText = String(response.formValues[0] || "").trim();
    const frontText = editingBack ? existing.front : newText;
    const backText = editingBack ? newText : existing.back;
    clearSignPrimitives(block.location);
    spawnSignText(block, frontText, backText);
  }).catch((e) => {
    editingPlayers.delete(playerId);
  });
}
function cleanupSignData(loc) {
  const base = `sign_${loc.x}_${loc.y}_${loc.z}`;
  world9.setDynamicProperty(`${base}_front`, void 0);
  world9.setDynamicProperty(`${base}_back`, void 0);
}
var DYE_COLORS = {
  0: { red: 0, green: 0, blue: 0, alpha: 1 },
  // black (default)
  1: { red: 1, green: 1, blue: 1, alpha: 1 },
  // white
  2: { red: 0.7, green: 0.1, blue: 0.1, alpha: 1 },
  // red
  3: { red: 0.15, green: 0.2, blue: 0.7, alpha: 1 },
  // blue
  4: { red: 0.3, green: 0.6, blue: 0.85, alpha: 1 },
  // light blue
  5: { red: 0.1, green: 0.5, blue: 0.1, alpha: 1 },
  // green
  6: { red: 0.95, green: 0.9, blue: 0.1, alpha: 1 },
  // yellow
  7: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
  // gray
  8: { red: 0.35, green: 0.35, blue: 0.35, alpha: 1 },
  // dark gray
  9: { red: 0.1, green: 0.55, blue: 0.55, alpha: 1 },
  // cyan
  10: { red: 0.75, green: 0.2, blue: 0.75, alpha: 1 },
  // magenta
  11: { red: 0.3, green: 0.75, blue: 0.1, alpha: 1 },
  // lime
  12: { red: 0.5, green: 0.3, blue: 0.15, alpha: 1 },
  // brown
  13: { red: 0.05, green: 0.05, blue: 0.05, alpha: 1 },
  // black dye
  14: { red: 0.5, green: 0.1, blue: 0.7, alpha: 1 },
  // purple
  15: { red: 0.9, green: 0.5, blue: 0.1, alpha: 1 },
  // orange
  16: { red: 0.9, green: 0.5, blue: 0.65, alpha: 1 }
  // pink
};
var DYE_MAP = {
  "minecraft:white_dye": 1,
  "minecraft:red_dye": 2,
  "minecraft:blue_dye": 3,
  "minecraft:light_blue_dye": 4,
  "minecraft:green_dye": 5,
  "minecraft:yellow_dye": 6,
  "minecraft:gray_dye": 7,
  "minecraft:dark_gray_dye": 8,
  "minecraft:cyan_dye": 9,
  "minecraft:magenta_dye": 10,
  "minecraft:lime_dye": 11,
  "minecraft:brown_dye": 12,
  "minecraft:black_dye": 13,
  "minecraft:purple_dye": 14,
  "minecraft:orange_dye": 15,
  "minecraft:pink_dye": 16
};
function registerSignComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:sign", {});
  world9.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { block, player } = event;
    if (!isGaiaSign(block)) return;
    const yaw = player.getRotation().y;
    let isWall = false;
    let rotIndex = playerYawToRotationIndex(yaw);
    const isHanging = block.typeId.includes("hanging");
    if (isHanging) {
      const blockAbove = block.dimension.getBlock({
        x: block.location.x,
        y: block.location.y + 1,
        z: block.location.z
      });
      const isFullBlockAbove = !!(blockAbove && !blockAbove.isAir && !blockAbove.typeId.includes("fence") && !blockAbove.typeId.includes("chain") && !blockAbove.typeId.includes("iron_bars"));
      if (isFullBlockAbove && !player.isSneaking) {
        const cardinalIndex = Math.round(rotIndex / 4) * 4 % 16;
        const perm = block.permutation.withState("gaiadimension:rotation", cardinalIndex).withState("gaiadimension:attach_type", 1);
        block.setPermutation(perm);
      } else if (blockAbove && !blockAbove.isAir) {
        const perm = block.permutation.withState("gaiadimension:rotation", rotIndex).withState("gaiadimension:attach_type", 0);
        block.setPermutation(perm);
      } else {
        const dirs = [
          { dx: 0, dz: -1, rot: 8 },
          { dx: 1, dz: 0, rot: 4 },
          { dx: 0, dz: 1, rot: 0 },
          { dx: -1, dz: 0, rot: 12 }
        ];
        for (const d of dirs) {
          const adj = block.dimension.getBlock({
            x: block.location.x + d.dx,
            y: block.location.y,
            z: block.location.z + d.dz
          });
          if (adj && !adj.isAir) {
            rotIndex = d.rot;
            break;
          }
        }
        const perm = block.permutation.withState("gaiadimension:rotation", rotIndex).withState("gaiadimension:attach_type", 2);
        block.setPermutation(perm);
      }
    } else {
      const blockBelow = block.dimension.getBlock({
        x: block.location.x,
        y: block.location.y - 1,
        z: block.location.z
      });
      if (!blockBelow || blockBelow.isAir) {
        isWall = true;
        const dirs = [
          { dx: 0, dz: -1, rot: 8 },
          { dx: 1, dz: 0, rot: 4 },
          { dx: 0, dz: 1, rot: 0 },
          { dx: -1, dz: 0, rot: 12 }
        ];
        for (const d of dirs) {
          const adj = block.dimension.getBlock({
            x: block.location.x + d.dx,
            y: block.location.y,
            z: block.location.z + d.dz
          });
          if (adj && !adj.isAir) {
            rotIndex = d.rot;
            break;
          }
        }
      }
      const perm = block.permutation.withState("gaiadimension:rotation", rotIndex).withState("gaiadimension:wall_attached", isWall);
      block.setPermutation(perm);
    }
    system14.runTimeout(() => {
      openSignUI(player, block);
    }, 5);
  });
  world9.beforeEvents.playerBreakBlock.subscribe((event) => {
    const { block } = event;
    if (!isGaiaSign(block)) return;
    const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
    system14.run(() => {
      clearSignPrimitives(loc);
      cleanupSignData(loc);
    });
  });
  world9.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block } = event;
    if (!isGaiaSign(block)) return;
    if (player.isSneaking) return;
    event.cancel = true;
    system14.run(() => {
      const equip = player.getComponent("minecraft:equippable");
      if (!equip) return openSignUI(player, block);
      const mainHand = equip.getEquipment(EquipmentSlot3.Mainhand);
      if (!mainHand) return openSignUI(player, block);
      const dyeIndex = DYE_MAP[mainHand.typeId];
      if (dyeIndex === void 0) return openSignUI(player, block);
      const key = signKey(block.location);
      const prims = activePrimitives.get(key);
      if (prims) {
        const rgba = DYE_COLORS[dyeIndex] || DEFAULT_TEXT_COLOR;
        try {
          if (prims.front) prims.front.color = rgba;
        } catch (e) {
        }
        try {
          if (prims.back) prims.back.color = rgba;
        } catch (e) {
        }
      }
      if (mainHand.amount > 1) {
        mainHand.amount -= 1;
        equip.setEquipment(EquipmentSlot3.Mainhand, mainHand);
      } else {
        equip.setEquipment(EquipmentSlot3.Mainhand, void 0);
      }
    });
  });
}

// src/main/bedrock/ts/blocks/geyser.ts
import {
  system as system15
} from "@minecraft/server";
function pushEntities(dimension, spawnPos, duration) {
  let elapsed = 0;
  const intervalTicks = 4;
  const runId = system15.runInterval(() => {
    if (elapsed >= duration) {
      system15.clearRun(runId);
      return;
    }
    const entities = dimension.getEntities({
      location: spawnPos,
      maxDistance: 5
    });
    for (const entity of entities) {
      const pos = entity.location;
      const dx = Math.abs(pos.x - spawnPos.x);
      const dz = Math.abs(pos.z - spawnPos.z);
      const dy = pos.y - (spawnPos.y - 1.1);
      if (dx < 0.7 && dz < 0.7 && dy > 0 && dy < 6) {
        try {
          entity.applyImpulse({ x: 0, y: 0.5, z: 0 });
        } catch (e) {
        }
      }
    }
    elapsed += intervalTicks;
  }, intervalTicks);
}
async function eruptGeyser(block) {
  if (!block || !block.isValid) return;
  const dimension = block.dimension;
  const blockCenter = {
    x: block.location.x + 0.5,
    y: block.location.y + 1.1,
    z: block.location.z + 0.5
  };
  dimension.playSound("geyser.blast", blockCenter);
  dimension.spawnParticle("gaiadimension:geyser_pre_steam", blockCenter);
  await sleep(10);
  if (!block.isValid) return;
  pushEntities(dimension, blockCenter, 60);
  dimension.spawnParticle("gaiadimension:geyser_steam", blockCenter);
  dimension.spawnParticle("gaiadimension:geyser_blast", blockCenter);
}
function initializeGeyser() {
  system15.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === "gaiadimension:geyser.erupt") {
      if (event.sourceBlock) {
        eruptGeyser(event.sourceBlock);
      }
    }
  });
}
function registerGeyserComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:geyser", {
    onRandomTick: (event) => {
      eruptGeyser(event.block);
    },
    onPlayerInteract: (event) => {
      eruptGeyser(event.block);
    }
  });
}

// src/main/bedrock/ts/blocks/furnaces/GaiaFurnace.ts
import { ItemStack as ItemStack8 } from "@minecraft/server";

// src/main/bedrock/ts/API/lib/Machine.ts
import { world as world10, system as system16, ItemStack as ItemStack5 } from "@minecraft/server";
function getSegment(initialValue, currentValue, parts) {
  if (parts === 0 || initialValue === 0) return 0;
  const ratio = Math.max(0, Math.min(1, currentValue / initialValue));
  return Math.floor(ratio * (parts - 1));
}
var TimerManager = class {
  // Allow dynamic timer properties
  entity;
  timers = /* @__PURE__ */ new Map();
  constructor(entity, timerConfig) {
    this.entity = entity;
    if (!timerConfig) return;
    for (const timerName in timerConfig) {
      const scoreboardId = `gaiadimension:${timerName}`;
      let objective = world10.scoreboard.getObjective(scoreboardId);
      if (!objective) {
        objective = world10.scoreboard.addObjective(scoreboardId, timerName);
      }
      if (!objective) continue;
      let currentMax = timerConfig[timerName].max;
      const finalObjective = objective;
      Object.defineProperty(this, timerName, {
        get: () => {
          return {
            get value() {
              try {
                return finalObjective.getScore(entity) ?? 0;
              } catch (e) {
                return 0;
              }
            },
            set value(val) {
              try {
                finalObjective.setScore(entity, val);
              } catch (e) {
              }
            },
            get max() {
              return currentMax;
            },
            set max(val) {
              currentMax = val;
            },
            add: (amount) => {
              try {
                finalObjective.addScore(entity, amount);
              } catch (e) {
              }
            }
          };
        },
        enumerable: true
      });
    }
  }
};
var Machine = class {
  static get NAME() {
    throw new Error("Machine class must override static getter 'NAME'.");
  }
  static get TIMERS() {
    return {};
  }
  static get UI_CONFIG() {
    return { classicProfile: {}, pocketProfile: {} };
  }
  static get RECIPES() {
    return {};
  }
  static get INVENTORY_SIZE() {
    return 27;
  }
  static get FUEL_ITEMS() {
    return void 0;
  }
  /**
   * Returns the §-encoded routing name for JSON UI chest_screen matching.
   * e.g. "gaia_furnace" → "§g§a§i§a§_§f§u§r§n§a§c§e"
   */
  static get UI_ROUTING_NAME() {
    return `\xA7${this.NAME.split("").join("\xA7")}`;
  }
  entity;
  block;
  config;
  inventory;
  timers;
  tickCount;
  uiTickCount;
  cachedPlayers;
  locKey;
  cachedUiProfile;
  isViewed;
  lastTickTime;
  dynamicButtons;
  lastResultSnapshots;
  /**
   * Initializes a new machine instance.
   * @param {Entity} entity - The entity representing the machine.
   * @param {Block} block - The block associated with the machine.
   */
  constructor(entity, block) {
    this.entity = entity;
    this.block = block;
    this.config = this.constructor;
    const inventoryComp = this.entity.getComponent("minecraft:inventory");
    this.inventory = inventoryComp.container;
    this.timers = new TimerManager(this.entity, this.config.TIMERS);
    this.tickCount = 0;
    this.uiTickCount = 0;
    this.cachedPlayers = [];
    this.locKey = null;
    this.cachedUiProfile = null;
    this.isViewed = false;
    this.lastTickTime = system16.currentTick;
    this.dynamicButtons = /* @__PURE__ */ new Map();
    this.lastResultSnapshots = /* @__PURE__ */ new Map();
    this.initResultSnapshots();
    this.cachedUiProfile = this.getCurrentUiProfile();
    this.renderStaticUI(this.cachedUiProfile);
  }
  /**
   * Dynamically adds a button to the machine instance.
   * @param {number} slot 
   * @param {string} icon - Item Type ID
   * @param {string} callback - Name of the method to call on interaction
   */
  setButton(slot, icon, callback) {
    this.dynamicButtons.set(slot, { icon, callback });
  }
  /**
   * Initializes snapshot of result slots to prevent ejecting existing items on load.
   */
  initResultSnapshots() {
    const uiProfile = this.getCurrentUiProfile();
    if (!uiProfile) return;
    const resultSlots = [
      ...uiProfile.resultSlots || [],
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0);
    for (const slot of resultSlots) {
      const item = this.inventory.getItem(slot);
      if (item) {
        this.lastResultSnapshots.set(slot, { typeId: item.typeId, amount: item.amount });
      } else {
        this.lastResultSnapshots.delete(slot);
      }
    }
  }
  /**
   * Main tick loop for the machine.
   * Logic processing is consistent via dt. UI and interaction checks are gated by isViewed.
   * @param {number} dt - Delta time (ticks elapsed since last update).
   */
  tick(dt = 1) {
    const prevTick = this.tickCount;
    this.tickCount += dt;
    const isCheckTick = Math.floor(prevTick / 5) < Math.floor(this.tickCount / 5);
    if (isCheckTick) {
      this.monitorStrictSlots();
    }
    if (this.canProcess()) {
      this.processTick(dt);
    }
    this.onTick(dt);
    if (Math.floor(prevTick / 8) < Math.floor(this.tickCount / 8)) {
      this.handleHopperInteractions();
    }
    if (this.isViewed) {
      if (Math.floor(prevTick / 10) < Math.floor(this.tickCount / 10) || this.cachedPlayers.length === 0) {
        this.cachedPlayers = this.getNearbyPlayers();
      }
      this.uiTickCount += dt;
      this.cachedUiProfile = this.getCurrentUiProfile();
      const uiProfile = this.cachedUiProfile;
      this.enforceCursor(this.cachedPlayers);
      this.enforcePlayerInventory(this.cachedPlayers);
      this.handleInteractions(uiProfile);
      this.renderStaticUI(uiProfile);
      this.renderAnimatedUI(uiProfile);
      this.updateUI();
      if (this.uiTickCount % 20 === 0) {
        this.updateResultSnapshots();
      }
    } else {
      if (this.cachedPlayers.length > 0) this.cachedPlayers = [];
    }
  }
  /**
   * Handles "fake button" interactions.
   * Detects if a button slot is empty or has a swapped item, triggers the action, and resets the button.
   * @param {UIProfile | null} uiProfile - The current UI configuration.
   */
  handleInteractions(uiProfile) {
    const buttons = uiProfile && uiProfile.buttons ? { ...uiProfile.buttons } : {};
    for (const [slot, btn] of this.dynamicButtons) {
      buttons[slot] = btn;
    }
    if (Object.keys(buttons).length === 0) return;
    for (const [slotStr, btnConfig] of Object.entries(buttons)) {
      const slot = parseInt(slotStr);
      const currentItem = this.inventory.getItem(slot);
      const expectedId = btnConfig.icon;
      if (!currentItem || currentItem.typeId !== expectedId) {
        if (currentItem) {
          this.ejectItem(currentItem);
        }
        this.setInventoryItem(slot, new ItemStack5(expectedId, 1), uiProfile);
        try {
          this.block.dimension.playSound("random.click", this.block.location);
        } catch (e) {
        }
        const callback = btnConfig.callback;
        if (typeof this[callback] === "function") {
          this[callback](this.cachedPlayers[0]);
        }
      }
    }
  }
  /**
   * Safely sets an item in the machine's inventory, updating security snapshots.
   */
  setInventoryItem(slot, item, cachedUiProfile = null) {
    try {
      this.inventory.setItem(slot, item);
      const uiProfile = cachedUiProfile || this.cachedUiProfile || this.getCurrentUiProfile();
      if (uiProfile) {
        const resultSlots = [
          ...uiProfile.resultSlots || [],
          uiProfile.secondaryResultSlot
        ];
        if (resultSlots.includes(slot)) {
          if (item) {
            this.lastResultSnapshots.set(slot, { typeId: item.typeId, amount: item.amount });
          } else {
            this.lastResultSnapshots.delete(slot);
          }
        }
      }
    } catch (e) {
    }
  }
  /**
   * strict checks for Fuel and Result slots.
   */
  monitorStrictSlots() {
    const uiProfile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (!uiProfile) return;
    if (uiProfile.fuelSlot !== void 0) {
      const item = this.inventory.getItem(uiProfile.fuelSlot);
      if (item && !this.isValidFuel(item)) {
        this.setInventoryItem(uiProfile.fuelSlot, void 0, uiProfile);
        this.ejectItem(item);
      }
    }
    const resultSlots = [
      ...uiProfile.resultSlots || [],
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0);
    for (const slot of resultSlots) {
      const currentItem = this.inventory.getItem(slot);
      const lastSnapshot = this.lastResultSnapshots.get(slot);
      if (!currentItem) continue;
      let isPlayerAction = false;
      let amountToEject = 0;
      if (!lastSnapshot) {
        isPlayerAction = true;
        amountToEject = currentItem.amount;
      } else if (currentItem.typeId !== lastSnapshot.typeId) {
        isPlayerAction = true;
        amountToEject = currentItem.amount;
      } else if (currentItem.amount > lastSnapshot.amount) {
        isPlayerAction = true;
        amountToEject = currentItem.amount - lastSnapshot.amount;
      }
      if (isPlayerAction) {
        if (amountToEject >= currentItem.amount) {
          this.setInventoryItem(slot, void 0, uiProfile);
          this.ejectItem(currentItem);
        } else {
          currentItem.amount -= amountToEject;
          this.setInventoryItem(slot, currentItem, uiProfile);
          const ejectedStack = new ItemStack5(currentItem.typeId, amountToEject);
          this.ejectItem(ejectedStack);
        }
      }
    }
  }
  /**
   * Updates the snapshot of result slots. 
   */
  updateResultSnapshots() {
    const uiProfile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (!uiProfile) return;
    const resultSlots = [
      ...uiProfile.resultSlots || [],
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0);
    for (const slot of resultSlots) {
      const item = this.inventory.getItem(slot);
      if (item) {
        this.lastResultSnapshots.set(slot, { typeId: item.typeId, amount: item.amount });
      } else {
        this.lastResultSnapshots.delete(slot);
      }
    }
  }
  /**
   * Checks if an item is valid fuel for this machine.
   * @param {ItemStack} item 
   */
  isValidFuel(item) {
    if (!this.config.FUEL_ITEMS) return true;
    return !!this.config.FUEL_ITEMS[item.typeId];
  }
  /**
   * Called every tick, regardless of processing state.
   * Useful for updating visual states (like 'on' status), fuel timers, or other continuous logic.
   * @param {number} dt - Ticks elapsed.
   */
  onTick(dt) {
  }
  /**
   * Called every tick when players are viewing the machine, after renderUI.
   * Override this to update dynamic UI elements using setItemDisplay.
   */
  updateUI() {
  }
  /**
   * Updates the display properties (Name, Lore) of an item in a specific slot.
   * @param {number} slot - The inventory slot index.
   * @param {string | undefined} name - The new name for the item.
   * @param {string[]} lore - The new lore strings for the item.
   * @param {UIProfile | null} cachedUiProfile - Optional cached profile.
   */
  setItemDisplay(slot, name, lore = [], cachedUiProfile = null) {
    const item = this.inventory.getItem(slot);
    if (!item) return;
    const currentLore = item.getLore();
    const loreChanged = lore.length !== currentLore.length || lore.some((l, i) => l !== currentLore[i]);
    const nameChanged = name !== void 0 && item.nameTag !== name;
    if (!loreChanged && !nameChanged) return;
    if (name !== void 0) item.nameTag = name;
    if (lore !== void 0) item.setLore(lore);
    this.setInventoryItem(slot, item, cachedUiProfile);
  }
  /**
   * Creates or updates a gaiadimension:ui item in a UI slot for JSON UI progress bars.
   * The item's durability drives #size_binding_x/y in the JSON UI, and nameTag drives #hover_text.
   * @param {number} slot - The UI slot index.
   * @param {string} hoverText - Text shown on hover (via #hover_text binding).
   * @param {number} fillPixels - Fill amount in pixels (0 = empty, max depends on bar size).
   */
  setUiDisplay(slot, hoverText = "", fillPixels = 0) {
    try {
      let item = this.inventory.getItem(slot);
      const isUiItem = item && item.typeId === "gaiadimension:ui";
      if (!isUiItem) {
        item = new ItemStack5("gaiadimension:ui", 1);
      }
      if (hoverText) {
        item.nameTag = hoverText;
      }
      const durabilityComp = item.getComponent("minecraft:durability");
      if (durabilityComp) {
        const targetDamage = Math.max(0, durabilityComp.maxDurability - fillPixels);
        if (durabilityComp.damage !== targetDamage || !isUiItem) {
          durabilityComp.damage = targetDamage;
          this.inventory.setItem(slot, item);
        }
      } else if (!isUiItem) {
        this.inventory.setItem(slot, item);
      }
    } catch (e) {
    }
  }
  /**
   * Safely consumes a specified amount of items from a slot.
   * Handles decrementing stack size or removing the item if depleted.
   * @param {number} slot - The inventory slot index.
   * @param {number} amount - Amount to consume (default 1).
   * @returns {boolean} True if items were consumed, false if slot was empty or had insufficient items.
   */
  consumeItem(slot, amount = 1) {
    const item = this.inventory.getItem(slot);
    if (!item || item.amount < amount) return false;
    const newAmount = item.amount - amount;
    if (newAmount > 0) {
      item.amount = newAmount;
      this.setInventoryItem(slot, item);
    } else {
      this.setInventoryItem(slot, void 0);
    }
    return true;
  }
  /**
   * Determines if the machine has valid inputs, fuel, and space for outputs.
   * @returns {boolean} True if processing can proceed.
   */
  canProcess() {
    return false;
  }
  /**
   * Executed when 'canProcess' returns true.
   * Handles timer increments, item consumption, and product creation.
   */
  processTick(dt) {
  }
  /**
   * Gets players near the machine for UI interactions.
   * Only called when the machine is marked as 'viewed' by the central manager.
   */
  getNearbyPlayers() {
    return this.block.dimension.getPlayers({
      maxDistance: 6,
      location: this.block.location
    });
  }
  /**
   * Checks if the machine is currently active (processing items).
   * @returns {boolean} True if the 'cook' timer is greater than 0 or if the machine can start processing.
   */
  isRunning() {
    return this.timers.cook && this.timers.cook.value > 0 || this.canProcess();
  }
  /**
   * Prevents players from interacting with UI-only slots (placeholders, static icons, animated bars).
   * Also clears cursor if they picked up a UI item.
   * @param {Player[]} players - List of players to enforce inventory rules on.
   */
  enforceCursor(players) {
    for (const player of players) {
      const cursorComp = player.getComponent("minecraft:cursor_inventory");
      if (cursorComp && cursorComp.item) {
        if (this.isUiItem(cursorComp.item)) {
          cursorComp.clear();
        }
      }
    }
  }
  /**
   * Strict cleanup of player inventory and machine functional slots.
   */
  enforcePlayerInventory(players) {
    const uiProfile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (!uiProfile) return;
    for (const player of players) {
      const inventory = player.getComponent("minecraft:inventory");
      if (!inventory) continue;
      const container = inventory.container;
      for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (this.isUiItem(item)) {
          container.setItem(i, void 0);
        }
      }
    }
    const functionalSlots = new Set([
      ...uiProfile.inputSlots || [],
      ...uiProfile.resultSlots || [],
      uiProfile.fuelSlot,
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0));
    for (let slot = 0; slot < this.inventory.size; slot++) {
      const item = this.inventory.getItem(slot);
      if (!item) continue;
      const isUiItem = this.isUiItem(item);
      if (functionalSlots.has(slot)) {
        if (isUiItem) {
          this.setInventoryItem(slot, void 0, uiProfile);
        }
      } else {
        if (isUiItem && item.amount > 1) {
          item.amount = 1;
          this.setInventoryItem(slot, item, uiProfile);
        }
      }
    }
  }
  /**
   * Renders static UI elements and placeholders.
   */
  renderStaticUI(uiProfile) {
    if (!uiProfile) return;
    const userSlots = [
      ...uiProfile.inputSlots || [],
      ...uiProfile.resultSlots || [],
      uiProfile.fuelSlot,
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0);
    for (let slot = 0; slot < this.inventory.size; slot++) {
      if (userSlots.includes(slot)) continue;
      let desiredId = void 0;
      if (uiProfile.staticUI && uiProfile.staticUI[slot]) {
        desiredId = uiProfile.staticUI[slot];
      }
      if (uiProfile.buttons && uiProfile.buttons[slot]) {
        desiredId = uiProfile.buttons[slot].icon;
      }
      if (this.dynamicButtons.has(slot)) {
        desiredId = this.dynamicButtons.get(slot).icon;
      }
      let isAnimatedAndRunning = false;
      if (uiProfile.animatedUI) {
        const animPart = uiProfile.animatedUI.find((part) => part.slot === slot);
        if (animPart) {
          const timer = this.timers[animPart.timer];
          if (timer && timer.value > 0) {
            isAnimatedAndRunning = true;
          }
        }
      }
      if (isAnimatedAndRunning) continue;
      const currentItem = this.inventory.getItem(slot);
      if (desiredId === void 0) {
        if (currentItem && currentItem.typeId !== "minecraft:air") {
          this.ejectItem(currentItem);
          try {
            this.inventory.setItem(slot, void 0);
          } catch (e) {
          }
        }
        continue;
      }
      if (!currentItem || currentItem.typeId !== desiredId) {
        if (currentItem && currentItem.typeId !== "minecraft:air") {
          this.ejectItem(currentItem);
          try {
            this.inventory.setItem(slot, void 0);
          } catch (e) {
          }
        }
        try {
          this.setInventoryItem(slot, new ItemStack5(desiredId, 1), uiProfile);
        } catch (e) {
        }
      }
    }
  }
  /**
   * Renders animated UI elements based on machine state.
   */
  renderAnimatedUI(uiProfile) {
    if (!uiProfile) return;
    if (uiProfile.animatedUI) {
      for (const part of uiProfile.animatedUI) {
        const timer = this.timers[part.timer];
        if (timer === void 0) continue;
        if (timer.value <= 0) continue;
        const remainingTime = timer.value;
        let maxTime = timer.max;
        if (part.maxTimer && this.timers[part.maxTimer]) {
          maxTime = this.timers[part.maxTimer].value;
        }
        const offset = part.segmentOffset || 0;
        const segment = getSegment(maxTime, remainingTime, part.steps) + offset;
        const frameId = `${part.baseId}_${Math.max(0, segment)}`;
        const currentItem = this.inventory.getItem(part.slot);
        if (!currentItem || currentItem.typeId !== frameId) {
          try {
            this.setInventoryItem(part.slot, new ItemStack5(frameId, 1), uiProfile);
          } catch (e) {
          }
        }
      }
    }
  }
  /**
   * Checks if an item is a protected UI element (static or animated).
   * @param {ItemStack | undefined} item 
   */
  isUiItem(item) {
    if (!item) return false;
    if (BANNED_ITEMS.has(item.typeId)) return true;
    for (const prefix of BANNED_PREFIXES) {
      if (item.typeId.startsWith(prefix)) return true;
    }
    const uiProfile = this.getCurrentUiProfile();
    if (!uiProfile) return false;
    const bannedItems = /* @__PURE__ */ new Set(["gaiadimension:placeholder_invisible"]);
    if (uiProfile.staticUI) {
      Object.values(uiProfile.staticUI).forEach((id) => bannedItems.add(id));
    }
    if (uiProfile.buttons) {
      Object.values(uiProfile.buttons).forEach((btn) => bannedItems.add(btn.icon));
    }
    for (const btn of this.dynamicButtons.values()) {
      bannedItems.add(btn.icon);
    }
    if (bannedItems.has(item.typeId)) return true;
    if (uiProfile.animatedUI) {
      for (const part of uiProfile.animatedUI) {
        if (item.typeId.startsWith(part.baseId)) return true;
      }
    }
    return false;
  }
  /**
   * Ejects an item from the machine's inventory, attempting to return it to a player
   * or dropping it in the world if no player can take it.
   * @param {ItemStack} itemStack - The item to eject.
   */
  ejectItem(itemStack) {
    if (!itemStack || itemStack.amount === 0) return;
    if (this.isUiItem(itemStack)) return;
    const player = this.cachedPlayers[0];
    if (player) {
      const inventory = player.getComponent("minecraft:inventory");
      if (inventory) {
        const container = inventory.container;
        const remainder = container.addItem(itemStack);
        if (!remainder) return;
        itemStack = remainder;
      }
    }
    if (itemStack.amount > 0) {
      const dim = this.block.dimension;
      try {
        const dropLoc = { x: this.block.location.x + 0.5, y: this.block.location.y + 1.2, z: this.block.location.z + 0.5 };
        dim.spawnItem(itemStack, dropLoc);
      } catch (e) {
      }
    }
  }
  /**
   * Retrieves the current UI configuration based on block state.
   */
  getCurrentUiProfile() {
    const pocketUi = this.block.permutation.getState("gaiadimension:pocket_ui");
    return this.config.UI_CONFIG[pocketUi ? "pocketProfile" : "classicProfile"];
  }
  handleHopperInteractions() {
    const uiProfile = this.getCurrentUiProfile();
    if (!uiProfile) return;
    try {
      const hopperBelow = this.block.below();
      if (hopperBelow && hopperBelow.typeId === "minecraft:hopper") {
        const outputSlots = [
          ...uiProfile.resultSlots || [],
          uiProfile.secondaryResultSlot
        ].filter((s) => s !== void 0);
        if (outputSlots.length > 0) {
          this.pushToHopper(hopperBelow, outputSlots);
        }
      }
    } catch (e) {
    }
    try {
      const hopperAbove = this.block.above();
      if (hopperAbove && hopperAbove.typeId === "minecraft:hopper") {
        const facing = hopperAbove.permutation.getState("facing_direction");
        const isLocked = hopperAbove.permutation.getState("toggle_bit");
        if (facing === 0 && !isLocked && uiProfile.inputSlots) {
          this.pullFromHopper(hopperAbove, uiProfile.inputSlots);
        }
      }
    } catch (e) {
    }
    if (uiProfile.fuelSlot !== void 0) {
      const directions = {
        north: 3,
        // Hopper at North must face South (3)
        east: 4,
        // Hopper at East must face West (4)
        south: 2,
        // Hopper at South must face North (2)
        west: 5
        // Hopper at West must face East (5)
      };
      for (const [dir, requiredFacing] of Object.entries(directions)) {
        try {
          const hopperSide = this.block[dir]();
          if (hopperSide && hopperSide.typeId === "minecraft:hopper") {
            const facing = hopperSide.permutation.getState("facing_direction");
            const isLocked = hopperSide.permutation.getState("toggle_bit");
            if (facing === requiredFacing && !isLocked) {
              this.pullFromHopper(hopperSide, [uiProfile.fuelSlot]);
            }
          }
        } catch (e) {
        }
      }
    }
  }
  /**
   * Pushes items from specific machine slots into a target hopper.
   */
  pushToHopper(hopperBlock, sourceSlots) {
    if (hopperBlock.permutation.getState("toggle_bit")) return;
    const inventoryComp = hopperBlock.getComponent("minecraft:inventory");
    const hopperInventory = inventoryComp?.container;
    if (!hopperInventory) return;
    for (const slot of sourceSlots) {
      const item = this.inventory.getItem(slot);
      if (!item) continue;
      const itemToMove = new ItemStack5(item.typeId, 1);
      const remainder = hopperInventory.addItem(itemToMove);
      if (!remainder || remainder.amount === 0) {
        if (item.amount > 1) {
          item.amount--;
          this.setInventoryItem(slot, item);
        } else {
          this.setInventoryItem(slot, void 0);
        }
        return;
      }
    }
  }
  /**
   * Pulls items from a source hopper into specific machine slots.
   */
  pullFromHopper(hopperBlock, targetSlots) {
    const inventoryComp = hopperBlock.getComponent("minecraft:inventory");
    const hopperInventory = inventoryComp?.container;
    if (!hopperInventory) return;
    let hopperSlot = -1;
    let itemToMove = null;
    for (let i = 0; i < hopperInventory.size; i++) {
      const item = hopperInventory.getItem(i);
      if (item) {
        hopperSlot = i;
        itemToMove = item;
        break;
      }
    }
    if (!itemToMove) return;
    for (const slot of targetSlots) {
      const currentItem = this.inventory.getItem(slot);
      if (!currentItem) {
        const newItem = new ItemStack5(itemToMove.typeId, 1);
        this.setInventoryItem(slot, newItem);
        if (itemToMove.amount > 1) {
          itemToMove.amount--;
          hopperInventory.setItem(hopperSlot, itemToMove);
        } else {
          hopperInventory.setItem(hopperSlot, void 0);
        }
        return;
      } else if (currentItem.typeId === itemToMove.typeId && currentItem.amount < currentItem.maxStackSize) {
        currentItem.amount++;
        this.setInventoryItem(slot, currentItem);
        if (itemToMove.amount > 1) {
          itemToMove.amount--;
          hopperInventory.setItem(hopperSlot, itemToMove);
        } else {
          hopperInventory.setItem(hopperSlot, void 0);
        }
        return;
      }
    }
  }
  /**
   * Called when the machine is destroyed/removed.
   * Ejects all valid player items (inputs, outputs, fuel) to the world.
   */
  destroy() {
    if (!this.inventory) return;
    const uiProfile = this.getCurrentUiProfile();
    if (!uiProfile) return;
    const functionalSlots = [
      ...uiProfile.inputSlots || [],
      ...uiProfile.resultSlots || [],
      uiProfile.fuelSlot,
      uiProfile.secondaryResultSlot
    ].filter((s) => s !== void 0);
    const itemsToDrop = [];
    const dim = this.entity.dimension;
    const dropLoc = {
      x: this.entity.location.x,
      y: this.entity.location.y + 0.5,
      z: this.entity.location.z
    };
    for (const slot of functionalSlots) {
      const item = this.inventory.getItem(slot);
      if (item) {
        itemsToDrop.push(new ItemStack5(item.typeId, item.amount));
        try {
          this.inventory.setItem(slot, void 0);
        } catch (e) {
        }
      }
    }
    if (itemsToDrop.length > 0) {
      system16.run(() => {
        for (const stack of itemsToDrop) {
          try {
            dim.spawnItem(stack, dropLoc);
          } catch (e) {
            console.warn(`[Machine] Failed to spawn dropped item: ${e}`);
          }
        }
      });
    }
  }
  /**
   * Registers UI items from a machine config to be strictly managed (banned from drop/player inv).
   * @param {UIConfig} config - The machine's UI_CONFIG
   */
  static processUiConfig(config) {
    if (!config) return;
    BANNED_ITEMS.add("gaiadimension:placeholder_invisible");
    const profiles = [config.classicProfile, config.pocketProfile];
    for (const profile of profiles) {
      if (!profile) continue;
      if (profile.staticUI) {
        Object.values(profile.staticUI).forEach((id) => BANNED_ITEMS.add(id));
      }
      if (profile.animatedUI) {
        profile.animatedUI.forEach((part) => {
          if (part.baseId) BANNED_PREFIXES.add(part.baseId);
        });
      }
    }
  }
};
var BANNED_ITEMS = /* @__PURE__ */ new Set(["gaiadimension:placeholder_invisible", "gaiadimension:ui"]);
var BANNED_PREFIXES = /* @__PURE__ */ new Set();
world10.afterEvents.entitySpawn.subscribe((event) => {
  const { entity } = event;
  if (entity.typeId !== "minecraft:item") return;
  try {
    const itemComp = entity.getComponent("minecraft:item");
    if (!itemComp || !itemComp.itemStack) return;
    const typeId = itemComp.itemStack.typeId;
    if (BANNED_ITEMS.has(typeId)) {
      system16.run(() => {
        try {
          if (entity.isValid) entity.remove();
        } catch (e) {
        }
      });
      return;
    }
    for (const prefix of BANNED_PREFIXES) {
      if (typeId.startsWith(prefix)) {
        system16.run(() => {
          try {
            if (entity.isValid) entity.remove();
          } catch (e) {
          }
        });
        return;
      }
    }
  } catch (e) {
  }
});

// src/main/bedrock/ts/furnace_recipes/furnace/NativeFurnaceData.ts
import * as MC from "@minecraft/server";
var nativeRecipes = {
  "minecraft:raw_iron": {
    output: "minecraft:iron_ingot"
  },
  "minecraft:raw_gold": {
    output: "minecraft:gold_ingot"
  },
  "minecraft:raw_copper": {
    output: "minecraft:copper_ingot"
  },
  "minecraft:copper_ore": {
    output: "minecraft:copper_ingot"
  },
  "minecraft:iron_ore": {
    output: "minecraft:iron_ingot"
  },
  "minecraft:gold_ore": {
    output: "minecraft:gold_ingot"
  },
  "minecraft:diamond_ore": {
    output: "minecraft:diamond"
  },
  "minecraft:lapis_ore": {
    output: "minecraft:lapis_lazuli"
  },
  "minecraft:redstone_ore": {
    output: "minecraft:redstone"
  },
  "minecraft:coal_ore": {
    output: "minecraft:coal"
  },
  "minecraft:emerald_ore": {
    output: "minecraft:emerald"
  },
  "minecraft:deepslate_copper_ore": {
    output: "minecraft:copper_ingot"
  },
  "minecraft:deepslate_iron_ore": {
    output: "minecraft:iron_ingot"
  },
  "minecraft:deepslate_gold_ore": {
    output: "minecraft:gold_ingot"
  },
  "minecraft:deepslate_diamond_ore": {
    output: "minecraft:diamond"
  },
  "minecraft:deepslate_lapis_ore": {
    output: "minecraft:lapis_lazuli"
  },
  "minecraft:deepslate_redstone_ore": {
    output: "minecraft:redstone"
  },
  "minecraft:deepslate_coal_ore": {
    output: "minecraft:coal"
  },
  "minecraft:deepslate_emerald_ore": {
    output: "minecraft:emerald"
  },
  "minecraft:quartz_ore": {
    output: "minecraft:quartz"
  },
  "minecraft:ancient_debris": {
    output: "minecraft:netherite_scrap"
  },
  "minecraft:nether_gold_ore": {
    output: "minecraft:gold_ingot"
  },
  "minecraft:porkchop": {
    output: "minecraft:cooked_porkchop"
  },
  "minecraft:beef": {
    output: "minecraft:cooked_beef"
  },
  "minecraft:chicken": {
    output: "minecraft:cooked_chicken"
  },
  "minecraft:cod": {
    output: "minecraft:cooked_cod"
  },
  "minecraft:salmon": {
    output: "minecraft:cooked_salmon"
  },
  "minecraft:potato": {
    output: "minecraft:baked_potato"
  },
  "minecraft:mutton": {
    output: "minecraft:cooked_mutton"
  },
  "minecraft:rabbit": {
    output: "minecraft:cooked_rabbit"
  },
  "minecraft:kelp": {
    output: "minecraft:dried_kelp"
  },
  "minecraft:sand": {
    output: "minecraft:glass"
  },
  "minecraft:cobblestone": {
    output: "minecraft:stone"
  },
  "minecraft:sandstone": {
    output: "minecraft:sandstone",
    outputBlockState: {
      "sand_stone_type": "smooth"
    },
    blockState: {
      "sand_stone_type": "default"
    }
  },
  "minecraft:red_sandstone": {
    output: "minecraft:red_sandstone",
    outputBlockState: {
      "sand_stone_type": "smooth"
    },
    blockState: {
      "sand_stone_type": "default"
    }
  },
  "minecraft:stone": {
    output: "minecraft:smooth_stone",
    blockState: {
      "stone_type": "stone"
    }
  },
  "minecraft:quartz_block": {
    output: "minecraft:quartz_block",
    outputBlockState: {
      "chisel_type": "smooth"
    },
    blockState: {
      "chisel_type": "default"
    }
  },
  "minecraft:clay_ball": {
    output: "minecraft:brick"
  },
  "minecraft:netherrack": {
    output: "minecraft:netherbrick"
  },
  "minecraft:nether_brick": {
    output: "minecraft:cracked_nether_bricks"
  },
  "minecraft:basalt": {
    output: "minecraft:smooth_basalt"
  },
  "minecraft:clay": {
    output: "minecraft:hardened_clay"
  },
  "minecraft:stonebrick": {
    output: "minecraft:stonebrick",
    outputBlockState: {
      "stone_brick_type": "cracked"
    },
    blockState: {
      "stone_brick_type": "default"
    }
  },
  "minecraft:polished_blackstone_bricks": {
    output: "minecraft:cracked_polished_blackstone_bricks"
  },
  "minecraft:cobbled_deepslate": {
    output: "minecraft:deepslate"
  },
  "minecraft:deepslate_bricks": {
    output: "minecraft:cracked_deepslate_bricks"
  },
  "minecraft:deepslate_tiles": {
    output: "minecraft:cracked_deepslate_tiles"
  },
  "minecraft:stained_hardened_clay": {
    //hardcoded
    scriptedOutput: function(item) {
      if (!item) return void 0;
      const colorState = MC.world.getBlockStates().get("color");
      if (!colorState) return void 0;
      const colorValues = colorState.validValues;
      for (let i = 0; i < colorValues.length; i++) {
        const color = colorValues[i];
        const block = MC.BlockPermutation.resolve(item.typeId, { "color": color });
        const itemCompare = block.getItemStack(1);
        if (itemCompare && item.isStackableWith(itemCompare)) {
          return new MC.ItemStack(`minecraft:${color}_glazed_terracotta`);
        }
      }
      return void 0;
    }
  },
  "minecraft:cactus": {
    output: "minecraft:green_dye"
  },
  "minecraft:oak_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:spruce_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:birch_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:jungle_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:acacia_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:dark_oak_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:cherry_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:mangrove_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_oak_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_spruce_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_birch_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_jungle_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_acacia_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_dark_oak_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_cherry_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:stripped_mangrove_log": {
    output: "minecraft:charcoal"
  },
  "minecraft:wood": {
    output: "minecraft:charcoal"
  },
  "minecraft:chorus_fruit": {
    output: "minecraft:popped_chorus_fruit"
  },
  "minecraft:sea_pickle": {
    output: "minecraft:lime_dye"
  }
};
var nativeFuels = {
  "minecraft:coal_block": 16e3,
  "minecraft:dried_kelp_block": 4e3,
  "minecraft:blaze_rod": 2400,
  "minecraft:lava_bucket": {
    burnTime: 2e4,
    return: "minecraft:bucket"
  },
  "tag:wood": 1e3,
  "tag:item:minecraft:coals": 1600,
  "tag:item:minecraft:boats": 1200,
  "tag:item:minecraft:wooden_tier": 200,
  "minecraft:scaffolding": 50,
  "minecraft:bamboo_mosaic": 300,
  "minecraft:beehive": 300,
  "minecraft:bee_nest": 300,
  "minecraft:chiseled_bookshelf": 300,
  "minecraft:bamboo_block": 300,
  "minecraft:stripped_bamboo_block": 300,
  "tag:item:minecraft:wooden_slabs": 150,
  "minecraft:oak_stairs": 150,
  "minecraft:spruce_stairs": 150,
  "minecraft:birch_stairs": 150,
  "minecraft:jungle_stairs": 150,
  "minecraft:acacia_stairs": 150,
  "minecraft:dark_oak_stairs": 150,
  "minecraft:mangrove_stairs": 150,
  "minecraft:cherry_stairs": 150,
  "minecraft:bamboo_stairs": 150,
  "minecraft:bamboo_mosaic_stairs": 150,
  "tag:block:wood": 300,
  "minecraft:crafting_table": 300,
  "minecraft:cartography_table": 300,
  "minecraft:fletching_table": 300,
  "minecraft:smithing_table": 300,
  "minecraft:loom": 300,
  "minecraft:bookshelf": 300,
  "minecraft:lectern": 300,
  "minecraft:composter": 300,
  "minecraft:chest": 300,
  "minecraft:trapped_chest": 300,
  "minecraft:jukebox": 300,
  "minecraft:noteblock": 300,
  "minecraft:banner": 300,
  "minecraft:crossbow": 300,
  "minecraft:bow": 300,
  "minecraft:fishing_rod": 300,
  "minecraft:oak_sign": 200,
  "minecraft:spruce_sign": 200,
  "minecraft:birch_sign": 200,
  "minecraft:acacia_sign": 200,
  "minecraft:jungle_sign": 200,
  "minecraft:dark_oak_sign": 200,
  "minecraft:mangrove_sign": 200,
  "minecraft:cherry_sign": 200,
  "minecraft:bamboo_sign": 200,
  "minecraft:bowl": 200,
  "minecraft:sapling": 100,
  "minecraft:mangrove_propagule": 100,
  "minecraft:cherry_sapling": 100,
  "minecraft:stick": 100,
  "minecraft:azalea": 100,
  "minecraft:flowering_azalea": 100,
  "tag:item:minecraft:wool": 100,
  "minecraft:carpet": 67,
  "minecraft:bamboo": 50,
  // Added Fuels
  "minecraft:oak_log": 300,
  "minecraft:spruce_log": 300,
  "minecraft:birch_log": 300,
  "minecraft:jungle_log": 300,
  "minecraft:acacia_log": 300,
  "minecraft:dark_oak_log": 300,
  "minecraft:mangrove_log": 300,
  "minecraft:cherry_log": 300,
  "minecraft:stripped_oak_log": 300,
  "minecraft:stripped_spruce_log": 300,
  "minecraft:stripped_birch_log": 300,
  "minecraft:stripped_jungle_log": 300,
  "minecraft:stripped_acacia_log": 300,
  "minecraft:stripped_dark_oak_log": 300,
  "minecraft:stripped_mangrove_log": 300,
  "minecraft:stripped_cherry_log": 300,
  "minecraft:oak_wood": 300,
  "minecraft:spruce_wood": 300,
  "minecraft:birch_wood": 300,
  "minecraft:jungle_wood": 300,
  "minecraft:acacia_wood": 300,
  "minecraft:dark_oak_wood": 300,
  "minecraft:mangrove_wood": 300,
  "minecraft:cherry_wood": 300,
  "minecraft:stripped_oak_wood": 300,
  "minecraft:stripped_spruce_wood": 300,
  "minecraft:stripped_birch_wood": 300,
  "minecraft:stripped_jungle_wood": 300,
  "minecraft:stripped_acacia_wood": 300,
  "minecraft:stripped_dark_oak_wood": 300,
  "minecraft:stripped_mangrove_wood": 300,
  "minecraft:stripped_cherry_wood": 300,
  "minecraft:crimson_sign": 200,
  "minecraft:warped_sign": 200,
  "minecraft:oak_hanging_sign": 800,
  "minecraft:spruce_hanging_sign": 800,
  "minecraft:birch_hanging_sign": 800,
  "minecraft:jungle_hanging_sign": 800,
  "minecraft:acacia_hanging_sign": 800,
  "minecraft:dark_oak_hanging_sign": 800,
  "minecraft:mangrove_hanging_sign": 800,
  "minecraft:cherry_hanging_sign": 800,
  "minecraft:bamboo_hanging_sign": 800,
  "minecraft:crimson_hanging_sign": 800,
  "minecraft:warped_hanging_sign": 800,
  "minecraft:white_carpet": 67,
  "minecraft:orange_carpet": 67,
  "minecraft:magenta_carpet": 67,
  "minecraft:light_blue_carpet": 67,
  "minecraft:yellow_carpet": 67,
  "minecraft:lime_carpet": 67,
  "minecraft:pink_carpet": 67,
  "minecraft:gray_carpet": 67,
  "minecraft:light_gray_carpet": 67,
  "minecraft:cyan_carpet": 67,
  "minecraft:purple_carpet": 67,
  "minecraft:blue_carpet": 67,
  "minecraft:brown_carpet": 67,
  "minecraft:green_carpet": 67,
  "minecraft:red_carpet": 67,
  "minecraft:black_carpet": 67
};

// src/main/bedrock/ts/furnace_recipes/furnace/RecipeDiscovery.ts
import { world as world12, system as system17, ItemStack as ItemStack7 } from "@minecraft/server";
var DB_PREFIX = "luminiae:fn_";
var ENTITY_ID = "luminiae:recipe_check";
var TICK_BUDGET_MS = 3;
var RecipeDiscoverySystem = class {
  activeTests = /* @__PURE__ */ new Map();
  // Persistence: ID -> {loc, dim}
  runtimeTests = /* @__PURE__ */ new Map();
  // Logic: ID -> {stage, nextTick, ...}
  failedCooldowns = /* @__PURE__ */ new Map();
  // Cooldown: ID -> Expiry Time
  MAX_CONCURRENT_TESTS = 5;
  customRecipes = [];
  constructor() {
    this.init();
  }
  init() {
    this.loadState();
    system17.runInterval(() => this.tick(), 1);
    system17.runTimeout(() => this.resumeTests(), 40);
    world12.afterEvents.entityLoad.subscribe((ev) => {
      if (ev.entity.typeId === ENTITY_ID) {
        if (ev.entity.hasTag("luminiae:checked")) {
          if (!this.runtimeTests.has(ev.entity.nameTag)) {
            this.cleanupTest(ev.entity, ev.entity.nameTag);
          }
        } else {
          ev.entity.addTag("luminiae:checked");
        }
      }
    });
  }
  cleanupTest(entity, id) {
    if (entity && entity.isValid) entity.remove();
  }
  tick() {
    if (this.runtimeTests.size === 0) return;
    const now = Date.now();
    const currentTick = system17.currentTick;
    const toDelete = [];
    for (const [id, test] of this.runtimeTests) {
      if (Date.now() - now > TICK_BUDGET_MS) break;
      if (currentTick >= test.nextTick) {
        if (!test.marker || !test.marker.isValid) {
          console.warn(`[RecipeDiscovery] Marker lost for ${id}. Restarting setup.`);
          this.cleanupBlocks(test);
          this.startTest(id, test.location, test.dimension);
          return;
        }
        if (test.stage === 0) {
          if (!this.checkLitState(test)) {
            this.markFailed(id);
            toDelete.push(id);
            this.cleanupBlocks(test);
          } else {
            test.stage = 1;
            test.nextTick = currentTick + 205;
          }
        } else if (test.stage === 1) {
          if (this.analyzeResult(id, test)) {
            toDelete.push(id);
            this.cleanupBlocks(test);
          } else {
            this.markFailed(id);
            toDelete.push(id);
            this.cleanupBlocks(test);
          }
        }
      }
    }
    for (const id of toDelete) {
      this.runtimeTests.delete(id);
      this.activeTests.delete(id);
      this.saveState("tests");
    }
  }
  discover(inputId, location, dimension) {
    if (nativeRecipes[inputId] || this.activeTests.has(inputId)) return;
    const cooldown = this.failedCooldowns.get(inputId);
    if (cooldown) {
      if (Date.now() < cooldown) return;
      this.failedCooldowns.delete(inputId);
    }
    if (this.activeTests.size >= this.MAX_CONCURRENT_TESTS) return;
    this.startTest(inputId, location, dimension);
  }
  startTest(inputId, location, dimension) {
    this.activeTests.set(inputId, { location, dimId: dimension.id });
    this.saveState("tests");
    const offset = this.runtimeTests.size * 2;
    const testY = Math.max(dimension.heightRange.min + 4, -60);
    const testLoc = { x: location.x, y: testY, z: location.z + offset };
    let marker;
    try {
      marker = dimension.spawnEntity(ENTITY_ID, testLoc);
      marker.nameTag = inputId;
    } catch (e) {
      this.activeTests.delete(inputId);
      this.saveState("tests");
      return;
    }
    const types = ["furnace", "blast_furnace", "smoker"];
    for (let i = 0; i < types.length; i++) {
      const blockLoc = { x: testLoc.x + i, y: testLoc.y, z: testLoc.z };
      try {
        const block = dimension.getBlock(blockLoc);
        if (block) {
          block.setType(`minecraft:${types[i]}`);
          const inv = block.getComponent("inventory")?.container;
          if (inv) {
            inv.setItem(0, new ItemStack7(inputId, 1));
            inv.setItem(1, new ItemStack7("minecraft:oak_log", 1));
            inv.setItem(2, void 0);
          }
        }
      } catch (e) {
      }
    }
    this.runtimeTests.set(inputId, {
      stage: 0,
      nextTick: system17.currentTick + 60,
      // Wait 60 ticks (3s) for lag/ignition
      location: testLoc,
      dimension,
      marker,
      types
    });
  }
  checkLitState(test) {
    const { location, dimension, types } = test;
    for (let i = 0; i < types.length; i++) {
      try {
        const blockLoc = { x: location.x + i, y: location.y, z: location.z };
        const block = dimension.getBlock(blockLoc);
        if (block && block.typeId.includes("lit")) return true;
      } catch (e) {
      }
    }
    return false;
  }
  analyzeResult(inputId, test) {
    let found = false;
    const { location, dimension, types } = test;
    for (let i = 0; i < types.length; i++) {
      const blockLoc = { x: location.x + i, y: location.y, z: location.z };
      const block = dimension.getBlock(blockLoc);
      if (!block) continue;
      const inv = block.getComponent("inventory")?.container;
      if (inv) {
        const result = inv.getItem(2);
        if (result) {
          this.customRecipes.push({
            input: inputId,
            output: result.typeId,
            type: types[i]
          });
          found = true;
        }
      }
    }
    if (found) {
      this.saveState("recipes");
      this.applyRecipes();
    }
    return found;
  }
  cleanupBlocks(test) {
    const { location, dimension, marker } = test;
    if (marker && marker.isValid) marker.remove();
    for (let i = 0; i < 3; i++) {
      try {
        const block = dimension.getBlock({ x: location.x + i, y: location.y, z: location.z });
        if (block) block.setType("minecraft:air");
      } catch (e) {
      }
    }
  }
  markFailed(inputId) {
    this.failedCooldowns.set(inputId, Date.now() + 12e4);
  }
  resumeTests() {
    for (const [inputId, data] of this.activeTests) {
      if (this.runtimeTests.has(inputId)) continue;
      try {
        const dim = world12.getDimension(data.dimId);
        if (dim) this.startTest(inputId, data.location, dim);
      } catch (e) {
      }
    }
  }
  loadState() {
    try {
      const activeRaw = world12.getDynamicProperty(`${DB_PREFIX}tests`);
      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        for (const [k, v] of Object.entries(parsed)) this.activeTests.set(k, v);
      }
      const customRaw = world12.getDynamicProperty(`${DB_PREFIX}recipes`);
      if (customRaw) {
        this.customRecipes = JSON.parse(customRaw);
        this.applyRecipes();
      }
    } catch (e) {
    }
  }
  saveState(key) {
    try {
      if (key === "tests") world12.setDynamicProperty(`${DB_PREFIX}tests`, JSON.stringify(Object.fromEntries(this.activeTests)));
      else if (key === "recipes") world12.setDynamicProperty(`${DB_PREFIX}recipes`, JSON.stringify(this.customRecipes));
    } catch (e) {
    }
  }
  applyRecipes() {
    for (const recipe of this.customRecipes) {
      nativeRecipes[recipe.input] = { output: recipe.output };
    }
  }
};
var recipeDiscovery = new RecipeDiscoverySystem();

// src/main/bedrock/ts/API/lib/BlockEntity.ts
import { world as world13, system as system18 } from "@minecraft/server";
var BlockEntityManager = class {
  registeredMachineClasses = /* @__PURE__ */ new Map();
  activeMachineInstances = /* @__PURE__ */ new Map();
  // Maps entity.id -> Machine instance
  activeMachineList = [];
  // Array for efficient batch processing
  locationToEntityId = /* @__PURE__ */ new Map();
  // Optimization: Maps "x,y,z" -> entity.id
  lastProcessedIndex = 0;
  // For budget-based ticking
  pendingSpawns = /* @__PURE__ */ new Set();
  // Track locations currently being spawned to prevent duplicates
  lastPlacementTick = 0;
  // Global cooldown to prevent self-healing race conditions
  constructor() {
    this.registerEventListeners();
  }
  /**
   * Registers a new machine class with the system.
   * @param machineClass The class definition of the machine.
   */
  register(machineClass) {
    if (!machineClass || !machineClass.NAME) {
      console.warn("[BlockEntity] Registration failed: machineClass must have a static NAME property.");
      return;
    }
    const blockId = `gaiadimension:${machineClass.NAME}`;
    this.registeredMachineClasses.set(blockId, machineClass);
    if (typeof machineClass.processUiConfig === "function") {
      machineClass.processUiConfig(machineClass.UI_CONFIG);
    }
  }
  registerEventListeners() {
    world13.afterEvents.playerPlaceBlock.subscribe(this.handlePlayerPlaceBlock.bind(this));
    world13.beforeEvents.playerBreakBlock.subscribe(this.handlePlayerBreakBlock.bind(this));
    world13.afterEvents.explosion.subscribe(this.handleExplosion.bind(this));
    system18.runInterval(this.handlePlayerViewCheck.bind(this), 5);
    system18.runInterval(this.handleMachineTick.bind(this), 1);
    world13.afterEvents.worldLoad.subscribe(this.handleWorldLoad.bind(this));
    world13.afterEvents.entityLoad.subscribe(this.handleEntityLoad.bind(this));
  }
  handleExplosion(event) {
    const impactedBlocks = event.getImpactedBlocks();
    for (const block of impactedBlocks) {
      const location = block.location;
      const locKey = `${location.x},${location.y},${location.z}`;
      const entityId = this.locationToEntityId.get(locKey);
      if (entityId) {
        const machineInstance = this.activeMachineInstances.get(entityId);
        if (machineInstance) {
          this.removeMachine(entityId, machineInstance);
        }
      }
    }
  }
  handleEntityLoad(event) {
    const entity = event.entity;
    if (entity.typeId.startsWith("luminiae_generic:block_entity")) {
      this.registerEntityAsMachine(entity);
    }
  }
  registerEntityAsMachine(entity) {
    if (this.activeMachineInstances.has(entity.id)) return;
    let blockLocationStr = entity.getDynamicProperty("blockLocation");
    let blockLocation;
    let blockId = entity.getDynamicProperty("machineId");
    if (blockLocationStr) {
      try {
        blockLocation = JSON.parse(blockLocationStr);
      } catch (e) {
        console.warn(`[BlockEntity] Corrupt blockLocation data for ${entity.id}`);
      }
    }
    if (!blockLocation || !blockId) {
      const loc = entity.location;
      const candidateLoc = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
      try {
        const candidateBlock = entity.dimension.getBlock(candidateLoc);
        if (candidateBlock && this.registeredMachineClasses.has(candidateBlock.typeId)) {
          blockLocation = candidateLoc;
          blockId = candidateBlock.typeId;
          entity.setDynamicProperty("blockLocation", JSON.stringify(blockLocation));
          if (entity.typeId.startsWith("luminiae_generic:block_entity")) {
            entity.setDynamicProperty("machineId", blockId);
          }
        } else {
          return;
        }
      } catch (e) {
        return;
      }
    }
    if (blockId && this.registeredMachineClasses.has(blockId)) {
      try {
        const block = entity.dimension.getBlock(blockLocation);
        if (block && block.typeId === blockId) {
          const locKey = `${blockLocation.x},${blockLocation.y},${blockLocation.z}`;
          const existingEntityId = this.locationToEntityId.get(locKey);
          if (existingEntityId && existingEntityId !== entity.id) {
            try {
              if (entity.isValid) entity.remove();
            } catch (e) {
            }
            return;
          }
          const MachineClass = this.registeredMachineClasses.get(blockId);
          const machineInstance = new MachineClass(entity, block);
          machineInstance.locKey = locKey;
          this.activeMachineInstances.set(entity.id, machineInstance);
          this.activeMachineList.push(machineInstance);
          this.locationToEntityId.set(locKey, entity.id);
        }
      } catch (e) {
        console.warn(`[BlockEntity] Error registering entity ${entity.id}: ${e}`);
      }
    }
  }
  handlePlayerPlaceBlock(event) {
    const { block } = event;
    this.lastPlacementTick = system18.currentTick;
    if (this.registeredMachineClasses.has(block.typeId)) {
      const x = Math.floor(block.location.x);
      const y = Math.floor(block.location.y);
      const z = Math.floor(block.location.z);
      const locKey = `${x},${y},${z}`;
      if (this.locationToEntityId.has(locKey)) {
        return;
      }
      this.pendingSpawns.add(locKey);
      system18.run(() => {
        try {
          if (this.locationToEntityId.has(locKey)) return;
          const MachineClass = this.registeredMachineClasses.get(block.typeId);
          const useLarge = MachineClass.INVENTORY_SIZE === 54;
          const entityId = useLarge ? "luminiae_generic:block_entity_large" : "luminiae_generic:block_entity";
          const center = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
          const entity = block.dimension.spawnEntity(entityId, center);
          entity.setDynamicProperty("blockLocation", JSON.stringify({ x, y, z }));
          entity.setDynamicProperty("machineId", block.typeId);
          const machineInstance = new MachineClass(entity, block);
          machineInstance.locKey = locKey;
          this.activeMachineInstances.set(entity.id, machineInstance);
          this.activeMachineList.push(machineInstance);
          this.locationToEntityId.set(locKey, entity.id);
        } catch (e) {
          console.warn(`[BlockEntity] Error spawning/registering: ${e}`);
        } finally {
          this.pendingSpawns.delete(locKey);
        }
      });
    }
  }
  handlePlayerBreakBlock(event) {
    const { block } = event;
    if (this.registeredMachineClasses.has(block.typeId)) {
      const locKey = `${block.location.x},${block.location.y},${block.location.z}`;
      const entityId = this.locationToEntityId.get(locKey);
      if (entityId) {
        const machineInstance = this.activeMachineInstances.get(entityId);
        if (machineInstance) {
          this.removeMachine(entityId, machineInstance);
        }
      }
    }
  }
  removeMachine(entityId, machineInstance) {
    if (machineInstance && typeof machineInstance.destroy === "function") {
      try {
        machineInstance.destroy();
      } catch (e) {
        console.error(`Error destroying machine instance: ${e}`);
      }
    }
    this.activeMachineInstances.delete(entityId);
    const index = this.activeMachineList.indexOf(machineInstance);
    if (index > -1) {
      this.activeMachineList.splice(index, 1);
    }
    if (machineInstance.locKey) {
      this.locationToEntityId.delete(machineInstance.locKey);
    }
    if (machineInstance.entity && machineInstance.entity.isValid) {
      try {
        const center = { x: machineInstance.block.x + 0.5, y: machineInstance.block.y + 0.5, z: machineInstance.block.z + 0.5 };
        const orphans = machineInstance.block.dimension.getEntities({
          location: center,
          maxDistance: 0.8
        });
        for (const orphan of orphans) {
          if (orphan.typeId.includes("block_entity") || orphan.typeId.includes("storage_crate")) {
            try {
              if (orphan.isValid) orphan.remove();
            } catch (e) {
            }
          }
        }
      } catch (e) {
        system18.run(() => {
          try {
            if (machineInstance.entity.isValid) machineInstance.entity.remove();
          } catch (e2) {
            console.error(`[BlockEntity] Error removing entity: ${e2}`);
          }
        });
      }
    }
  }
  /**
   * Centralized Raycasting: Offloads physics checks from hundreds of individual machines 
   * to a single per-player pass. Flags viewed machines for prioritized 20TPS updates.
   */
  handlePlayerViewCheck() {
    for (const machine of this.activeMachineList) {
      machine.isViewed = false;
    }
    const machinesToShrink = /* @__PURE__ */ new Set();
    for (const player of world13.getAllPlayers()) {
      const blockHit = player.getBlockFromViewDirection({ maxDistance: 7 });
      let targetMachine = null;
      if (blockHit) {
        const locKey = `${blockHit.block.x},${blockHit.block.y},${blockHit.block.z}`;
        const entityId = this.locationToEntityId.get(locKey);
        if (entityId) {
          targetMachine = this.activeMachineInstances.get(entityId) || null;
        } else if (this.registeredMachineClasses.has(blockHit.block.typeId) && !this.pendingSpawns.has(locKey)) {
          if (system18.currentTick - this.lastPlacementTick > 20) {
            try {
              const MachineClass = this.registeredMachineClasses.get(blockHit.block.typeId);
              const useLarge = MachineClass.INVENTORY_SIZE === 54;
              const entityTypeId = useLarge ? "luminiae_generic:block_entity_large" : "luminiae_generic:block_entity";
              const center = { x: blockHit.block.x + 0.5, y: blockHit.block.y + 0.5, z: blockHit.block.z + 0.5 };
              const existingEntities = blockHit.block.dimension.getEntities({
                location: center,
                maxDistance: 0.8,
                type: entityTypeId
              });
              let entity;
              if (existingEntities.length > 0) {
                entity = existingEntities[0];
                for (let i = 1; i < existingEntities.length; i++) {
                  try {
                    if (existingEntities[i].isValid) {
                      existingEntities[i].remove();
                    }
                  } catch (e) {
                  }
                }
              } else {
                entity = blockHit.block.dimension.spawnEntity(entityTypeId, center);
                entity.setDynamicProperty("blockLocation", JSON.stringify(blockHit.block.location));
                entity.setDynamicProperty("machineId", blockHit.block.typeId);
              }
              if (!this.activeMachineInstances.has(entity.id)) {
                const machineInstance = new MachineClass(entity, blockHit.block);
                machineInstance.locKey = locKey;
                this.activeMachineInstances.set(entity.id, machineInstance);
                this.activeMachineList.push(machineInstance);
                this.locationToEntityId.set(locKey, entity.id);
                targetMachine = machineInstance;
              } else {
                targetMachine = this.activeMachineInstances.get(entity.id) || null;
              }
            } catch (e) {
            }
          }
        }
      }
      if (!targetMachine) {
        const entityHits = player.getEntitiesFromViewDirection({ maxDistance: 7 });
        for (const hit of entityHits) {
          if (this.activeMachineInstances.has(hit.entity.id)) {
            targetMachine = this.activeMachineInstances.get(hit.entity.id) || null;
            break;
          }
        }
      }
      if (targetMachine && targetMachine.entity) {
        targetMachine.isViewed = true;
        const isSneaking = player.isSneaking;
        const mainhandItem = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand")?.typeId || "";
        const isHoldingTool = mainhandItem.includes("_pickaxe") || mainhandItem.includes("wrench");
        if (isSneaking || isHoldingTool) {
          machinesToShrink.add(targetMachine.entity.id);
        }
      }
    }
    for (const machineInstance of this.activeMachineList) {
      const entity = machineInstance.entity;
      if (!entity || !entity.isValid) continue;
      const shouldShrink = machinesToShrink.has(entity.id);
      const isShrunk = entity.hasTag("shrunk");
      if (shouldShrink && !isShrunk) {
        entity.triggerEvent("general_block_entity:shrink");
        entity.addTag("shrunk");
      } else if (!shouldShrink && isShrunk) {
        entity.triggerEvent("general_block_entity:expand");
        entity.removeTag("shrunk");
      }
    }
  }
  /**
   * Priority & Budget Ticking:
   * 1. Priority: Viewed machines tick every frame (20TPS) for smooth UI.
   * 2. Budget: Ambient machines tick via round-robin with DT compensation.
   */
  handleMachineTick() {
    const totalMachines = this.activeMachineList.length;
    if (totalMachines === 0) return;
    const PROCESS_LIMIT = 40;
    const TIME_BUDGET_MS = 5;
    const startTime = Date.now();
    const currentTick = system18.currentTick;
    for (const machine of this.activeMachineList) {
      if (machine.isViewed && machine.entity?.isValid) {
        try {
          const dt = currentTick - machine.lastTickTime;
          if (dt > 0) {
            if (machine.block && machine.block.typeId === `gaiadimension:${machine.config.NAME}`) {
              machine.tick(dt);
              machine.lastTickTime = currentTick;
            }
          }
        } catch (e) {
          console.error(`Error ticking viewed machine: ${e}`);
        }
      }
    }
    let processedCount = 0;
    let attempts = 0;
    while (processedCount < PROCESS_LIMIT && attempts < totalMachines) {
      if (Date.now() - startTime > TIME_BUDGET_MS) break;
      this.lastProcessedIndex = (this.lastProcessedIndex + 1) % totalMachines;
      const machine = this.activeMachineList[this.lastProcessedIndex];
      attempts++;
      if (!machine || machine.isViewed) continue;
      if (!machine.entity?.isValid) {
        this.removeMachine(machine.entity.id, machine);
        this.lastProcessedIndex--;
        continue;
      }
      try {
        const dt = currentTick - machine.lastTickTime;
        if (dt > 0) {
          let currentBlockTypeId;
          try {
            currentBlockTypeId = machine.block?.typeId;
          } catch (err) {
            continue;
          }
          if (machine.block && currentBlockTypeId === `gaiadimension:${machine.config.NAME}`) {
            machine.tick(dt);
            machine.lastTickTime = currentTick;
            processedCount++;
          } else {
            this.removeMachine(machine.entity.id, machine);
            this.lastProcessedIndex--;
          }
        }
      } catch (e) {
        console.error(`Error ticking ambient machine: ${e}`);
      }
    }
  }
  handleWorldLoad() {
    const dimensions = getDimensions();
    dimensions.forEach((dimension) => {
      const entities = dimension.getEntities({ families: ["luminiae_generic"] });
      for (const entity of entities) {
        this.registerEntityAsMachine(entity);
      }
    });
  }
  getXP(blockLocation) {
    let xp = 0;
    const locKey = `${blockLocation.x},${blockLocation.y},${blockLocation.z}`;
    const entityId = this.locationToEntityId.get(locKey);
    if (entityId) {
      const machine = this.activeMachineInstances.get(entityId);
      if (machine && typeof machine.getRequiredXP === "function") {
        xp = machine.getRequiredXP();
      }
    }
    return xp;
  }
};
var blockEntityManager = new BlockEntityManager();
var BlockEntity_default = blockEntityManager;

// src/main/bedrock/ts/blocks/furnaces/GaiaFurnace.ts
var GaiaFurnace = class _GaiaFurnace extends Machine {
  static get NAME() {
    return "gaia_furnace";
  }
  static get TIMERS() {
    return {
      burn: { value: 0, max: 0, save: true },
      max_burn: { value: 0, max: 0, save: true },
      cook: { value: 0, max: 200, save: true }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _GaiaFurnace.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _GaiaFurnace.UI_ROUTING_NAME;
    }
  }
  static get UI_CONFIG() {
    return {
      classicProfile: {
        inputSlots: [0],
        fuelSlot: 1,
        resultSlots: [2]
      },
      pocketProfile: {
        inputSlots: [0],
        fuelSlot: 1,
        resultSlots: [2]
      }
    };
  }
  onTick(dt) {
    if (this.timers.burn.value > 0) {
      this.timers.burn.value = Math.max(0, this.timers.burn.value - dt);
    }
    if (!this.canProcess() && this.timers.cook.value > 0) {
      this.timers.cook.value = 0;
    }
    try {
      const isBurning = this.timers.burn.value > 0;
      const currentState = this.block.permutation.getState("gaiadimension:furnace_on");
      if (isBurning !== currentState) {
        this.block.setPermutation(this.block.permutation.withState("gaiadimension:furnace_on", isBurning));
      }
    } catch (e) {
    }
  }
  updateUI() {
    const burnPercent = this.timers.max_burn.value > 0 ? Math.ceil(this.timers.burn.value / this.timers.max_burn.value * 100) : 0;
    const fillBurn = this.timers.max_burn.value > 0 ? Math.ceil(this.timers.burn.value / this.timers.max_burn.value * 14) : 0;
    this.setUiDisplay(3, `\xA76Furnace Heat
\xA77Intensity: ${burnPercent}%`, fillBurn);
    const cookPercent = Math.floor(this.timers.cook.value / this.timers.cook.max * 100);
    const fillCook = Math.ceil(this.timers.cook.value / this.timers.cook.max * 24);
    this.setUiDisplay(4, `\xA7eRefining Progress
\xA77Status: ${cookPercent}%`, fillCook);
  }
  canProcess() {
    const inputItem = this.inventory.getItem(0);
    if (!inputItem) return false;
    const recipe = this.getRecipe(inputItem);
    if (!recipe) return false;
    if (this.timers.burn.value <= 0) {
      const fuelItem = this.inventory.getItem(1);
      if (!fuelItem || !this.getFuelValue(fuelItem)) return false;
    }
    const outputItem = this.inventory.getItem(2);
    if (outputItem) {
      if (outputItem.typeId !== recipe.output || outputItem.amount + 1 > outputItem.maxStackSize) return false;
    }
    return true;
  }
  processTick(dt = 1) {
    const profile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (this.timers.burn.value <= 0) {
      const fuelItem = this.inventory.getItem(1);
      const burnTime = this.getFuelValue(fuelItem);
      if (burnTime > 0) {
        this.consumeItem(1, 1);
        this.timers.burn.value = burnTime;
        this.timers.max_burn.value = burnTime;
      } else return;
    }
    const inputItem = this.inventory.getItem(0);
    const recipe = this.getRecipe(inputItem);
    if (!recipe) {
      this.timers.cook.value = 0;
      return;
    }
    this.timers.cook.max = 200;
    this.timers.cook.add(dt);
    if (this.timers.cook.value >= this.timers.cook.max) {
      this.timers.cook.value = 0;
      this.consumeItem(0, 1);
      this.addToSlot(2, new ItemStack8(recipe.output, 1), profile);
    }
  }
  addToSlot(slot, itemStack, profile) {
    const current = this.inventory.getItem(slot);
    if (!current) {
      this.setInventoryItem(slot, itemStack, profile);
    } else if (current.typeId === itemStack.typeId) {
      const maxStack = current.maxStackSize ?? 64;
      if (current.amount < maxStack) {
        const space = maxStack - current.amount;
        const add = Math.min(space, itemStack.amount);
        if (add > 0) {
          current.amount += add;
          this.setInventoryItem(slot, current, profile);
        }
      }
    }
  }
  getRecipe(input) {
    if (!input) return null;
    if (nativeRecipes[input.typeId]) {
      const recipe = nativeRecipes[input.typeId];
      if (recipe.output) {
        return { output: recipe.output, time: 200 };
      }
    }
    recipeDiscovery.discover(input.typeId, this.block.location, this.block.dimension);
    return null;
  }
  getFuelValue(item) {
    if (!item) return 0;
    if (nativeFuels[item.typeId]) {
      const val = nativeFuels[item.typeId];
      return typeof val === "object" ? val.burnTime : val;
    }
    for (const [key, val] of Object.entries(nativeFuels)) {
      if (key.startsWith("tag:")) {
        let tagName = key.replace("tag:", "");
        if (tagName.startsWith("item:")) tagName = tagName.replace("item:", "");
        if (tagName.startsWith("block:")) tagName = tagName.replace("block:", "");
        if (item.hasTag(tagName)) {
          return typeof val === "object" ? val.burnTime : val;
        }
      }
    }
    return 0;
  }
};
BlockEntity_default.register(GaiaFurnace);
function registerGaiaFurnaceComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:gaia_furnace", {
    onPlayerDestroy: () => {
    }
  });
}

// src/main/bedrock/ts/blocks/furnaces/Restructurer.ts
import { ItemStack as ItemStack9 } from "@minecraft/server";
var GLITTERING_FUELS = {
  "minecraft:gold_nugget": 20,
  "minecraft:gold_ingot": 200,
  "minecraft:golden_axe": 150,
  "minecraft:golden_hoe": 150,
  "minecraft:golden_pickaxe": 150,
  "minecraft:golden_shovel": 150,
  "minecraft:golden_sword": 150,
  "minecraft:golden_helmet": 500,
  "minecraft:golden_chestplate": 500,
  "minecraft:golden_leggings": 500,
  "minecraft:golden_boots": 500,
  "minecraft:golden_horse_armor": 1e3,
  "minecraft:gold_block": 2e3,
  "minecraft:gold_ore": 150,
  "gaiadimension:pyrite": 500,
  "gaiadimension:pyrite_block": 5e3,
  "gaiadimension:sweet_muckball": 250,
  "gaiadimension:frail_glitter_block": 1e3,
  "gaiadimension:thick_glitter_block": 2e3,
  "gaiadimension:gummy_glitter_block": 4e3,
  "minecraft:blaze_powder": 1200,
  "minecraft:blaze_rod": 2400
};
var SHINING_FUELS = {
  "gaiadimension:pink_essence": 100,
  "gaiadimension:pink_goo": 900,
  "gaiadimension:pink_sludge_block": 8100,
  "gaiadimension:aura_residue": 200,
  "gaiadimension:aura_cluster": 1800,
  "gaiadimension:aura_block": 16200
};
var RESTRUCTURER_RECIPES = {
  "gaiadimension:blue_opal": { output: "gaiadimension:benitoite", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:red_opal": { output: "gaiadimension:carnelian", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:white_opal": { output: "gaiadimension:goshenite", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:green_opal": { output: "gaiadimension:diopside", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:labradorite": { output: "gaiadimension:euclase", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:hematite": { output: "gaiadimension:stibnite", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:moonstone": { output: "gaiadimension:albite", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:cinnabar": { output: "gaiadimension:proustite", byproduct: "gaiadimension:black_residue", time: 200 },
  "gaiadimension:blue_opal_block": { output: "gaiadimension:benitoite_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:red_opal_block": { output: "gaiadimension:carnelian_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:white_opal_block": { output: "gaiadimension:goshenite_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:green_opal_block": { output: "gaiadimension:diopside_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:labradorite_block": { output: "gaiadimension:euclase_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:hematite_block": { output: "gaiadimension:stibnite_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:moonstone_block": { output: "gaiadimension:albite_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:cinnabar_block": { output: "gaiadimension:proustite_block", byproduct: "gaiadimension:tektite", time: 200 },
  "gaiadimension:pyrite_block": { output: "gaiadimension:aura_cluster", byproduct: "gaiadimension:bismuth_crystal", time: 200 },
  "gaiadimension:pyrite": { output: "gaiadimension:aura_residue", byproduct: "gaiadimension:bismuth_residue", time: 200 },
  "gaiadimension:bismuth_crystal": { output: "minecraft:diamond", byproduct: "gaiadimension:pink_essence", time: 200 },
  "gaiadimension:scaynyx_ingot": { output: "minecraft:gold_ingot", byproduct: "gaiadimension:pink_essence", time: 200 },
  "gaiadimension:benitoite": { output: "gaiadimension:crystallized_lapis_lazuli", byproduct: "gaiadimension:pink_essence", time: 200 },
  "gaiadimension:carnelian": { output: "gaiadimension:crystallized_redstone", byproduct: "gaiadimension:pink_essence", time: 200 }
};
var Restructurer = class _Restructurer extends Machine {
  static get NAME() {
    return "restructurer";
  }
  static get INVENTORY_SIZE() {
    return 7;
  }
  // 5 real + 2 UI
  static get TIMERS() {
    return {
      cook: { max: 200 },
      burn: { max: 0 },
      max_burn: { max: 0 }
    };
  }
  static get UI_CONFIG() {
    return {
      classicProfile: {
        inputSlots: [0, 2],
        fuelSlot: 1,
        // glittering fuel slot (also need slot 2 for shining)
        resultSlots: [3],
        secondaryResultSlot: 4
      },
      pocketProfile: {
        inputSlots: [0, 2],
        fuelSlot: 1,
        resultSlots: [3],
        secondaryResultSlot: 4
      }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Restructurer.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Restructurer.UI_ROUTING_NAME;
    }
  }
  onTick(dt) {
    if (this.timers.burn.value > 0) {
      this.timers.burn.value = Math.max(0, this.timers.burn.value - dt);
    }
    if (!this.canProcess() && this.timers.cook.value > 0) {
      this.timers.cook.value = Math.max(0, this.timers.cook.value - 2 * dt);
    }
    try {
      const isBurning = this.timers.burn.value > 0;
      const currentState = this.block.permutation.getState("gaiadimension:lit");
      if (isBurning !== currentState) {
        this.block.setPermutation(this.block.permutation.withState("gaiadimension:lit", isBurning));
      }
    } catch (e) {
    }
  }
  updateUI() {
    const burnPercent = this.timers.max_burn.value > 0 ? this.timers.burn.value / this.timers.max_burn.value : 0;
    const burnFill = Math.ceil(burnPercent * 16);
    this.setUiDisplay(5, `\xA76Fuel: ${Math.ceil(burnPercent * 100)}%`, burnFill);
    const cookPercent = this.timers.cook.max > 0 ? this.timers.cook.value / this.timers.cook.max : 0;
    const cookFill = Math.floor(cookPercent * 24);
    this.setUiDisplay(6, `\xA7eProgress: ${Math.floor(cookPercent * 100)}%`, cookFill);
  }
  canProcess() {
    const inputItem = this.inventory.getItem(0);
    if (!inputItem) return false;
    const recipe = RESTRUCTURER_RECIPES[inputItem.typeId];
    if (!recipe) {
      return false;
    }
    if (this.timers.burn.value <= 0) {
      const glitterFuel = this.inventory.getItem(1);
      const shineFuel = this.inventory.getItem(2);
      if (!glitterFuel || !shineFuel) {
        return false;
      }
      if (!GLITTERING_FUELS[glitterFuel.typeId] || !SHINING_FUELS[shineFuel.typeId]) {
        return false;
      }
    }
    const outputItem = this.inventory.getItem(3);
    if (outputItem) {
      if (outputItem.typeId !== recipe.output || outputItem.amount + 1 > outputItem.maxStackSize) {
        if (this.tickCount % 40 === 0) console.warn(`[RESTRUCT] canProcess FAIL: output slot 3 full or wrong type`);
        return false;
      }
    }
    const byproductItem = this.inventory.getItem(4);
    if (byproductItem) {
      if (byproductItem.typeId !== recipe.byproduct || byproductItem.amount + 1 > byproductItem.maxStackSize) {
        if (this.tickCount % 40 === 0) console.warn(`[RESTRUCT] canProcess FAIL: byproduct slot 4 full or wrong type`);
        return false;
      }
    }
    return true;
  }
  processTick(dt = 1) {
    const profile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (this.timers.burn.value <= 0) {
      const glitterFuel = this.inventory.getItem(1);
      const shineFuel = this.inventory.getItem(2);
      if (!glitterFuel || !shineFuel) return;
      const glitterBurn = GLITTERING_FUELS[glitterFuel.typeId] || 0;
      const shineBurn = SHINING_FUELS[shineFuel.typeId] || 0;
      if (glitterBurn <= 0 || shineBurn <= 0) return;
      const averageBurn = Math.floor((glitterBurn + shineBurn) / 2);
      this.consumeItem(1, 1);
      this.consumeItem(2, 1);
      this.timers.burn.value = averageBurn;
      this.timers.max_burn.value = averageBurn;
    }
    const inputItem = this.inventory.getItem(0);
    if (!inputItem) {
      this.timers.cook.value = 0;
      return;
    }
    const recipe = RESTRUCTURER_RECIPES[inputItem.typeId];
    if (!recipe) {
      this.timers.cook.value = 0;
      return;
    }
    this.timers.cook.max = recipe.time;
    this.timers.cook.add(dt);
    if (this.timers.cook.value >= this.timers.cook.max) {
      this.timers.cook.value = 0;
      this.consumeItem(0, 1);
      this.addToSlot(3, new ItemStack9(recipe.output, 1), profile);
      this.addToSlot(4, new ItemStack9(recipe.byproduct, 1), profile);
    }
  }
  addToSlot(slot, itemStack, profile) {
    const current = this.inventory.getItem(slot);
    if (!current) {
      this.setInventoryItem(slot, itemStack, profile);
    } else if (current.typeId === itemStack.typeId) {
      const maxStack = current.maxStackSize ?? 64;
      if (current.amount < maxStack) {
        const space = maxStack - current.amount;
        const add = Math.min(space, itemStack.amount);
        if (add > 0) {
          current.amount += add;
          this.setInventoryItem(slot, current, profile);
        }
      }
    }
  }
};
BlockEntity_default.register(Restructurer);
function registerRestructurerComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:restructurer", {
    onPlayerDestroy: () => {
    }
  });
}

// src/main/bedrock/ts/blocks/furnaces/Purifier.ts
import { ItemStack as ItemStack10 } from "@minecraft/server";
var GLITTERING_FUELS2 = {
  "minecraft:gold_nugget": 20,
  "minecraft:gold_ingot": 200,
  "minecraft:golden_axe": 150,
  "minecraft:golden_hoe": 150,
  "minecraft:golden_pickaxe": 150,
  "minecraft:golden_shovel": 150,
  "minecraft:golden_sword": 150,
  "minecraft:golden_helmet": 500,
  "minecraft:golden_chestplate": 500,
  "minecraft:golden_leggings": 500,
  "minecraft:golden_boots": 500,
  "minecraft:golden_horse_armor": 1e3,
  "minecraft:gold_block": 2e3,
  "minecraft:gold_ore": 150,
  "gaiadimension:pyrite": 500,
  "gaiadimension:pyrite_block": 5e3,
  "gaiadimension:sweet_muckball": 250,
  "gaiadimension:frail_glitter_block": 1e3,
  "gaiadimension:thick_glitter_block": 2e3,
  "gaiadimension:gummy_glitter_block": 4e3,
  "minecraft:blaze_powder": 1200,
  "minecraft:blaze_rod": 2400
};
var SHINING_FUELS2 = {
  "gaiadimension:pink_essence": 100,
  "gaiadimension:pink_goo": 900,
  "gaiadimension:pink_sludge_block": 8100,
  "gaiadimension:aura_residue": 200,
  "gaiadimension:aura_cluster": 1800,
  "gaiadimension:aura_block": 16200
};
var NULLING_FUELS = {
  "gaiadimension:bismuth_residue": 200,
  "gaiadimension:bismuth_crystal": 1800,
  "gaiadimension:bismuth_block": 16200,
  "gaiadimension:black_residue": 100,
  "gaiadimension:tektite": 900,
  "gaiadimension:tektite_block": 8100
};
var PURIFIER_RECIPES = {
  "gaiadimension:corrupted_grass": { output: "gaiadimension:glitter_grass", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_soil": { output: "gaiadimension:heavy_soil", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_leaves": { output: "gaiadimension:pink_agate_leaves", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_log": { output: "gaiadimension:pink_agate_log", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 2, time: 200 },
  "gaiadimension:stripped_corrupted_log": { output: "gaiadimension:stripped_pink_agate_log", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 2, time: 200 },
  "gaiadimension:corrupted_wood": { output: "gaiadimension:pink_agate_wood", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 2, time: 200 },
  "gaiadimension:stripped_corrupted_wood": { output: "gaiadimension:stripped_pink_agate_wood", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 2, time: 200 },
  "gaiadimension:corrupted_tiles": { output: "gaiadimension:pink_agate_tiles", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_tile_stairs": { output: "gaiadimension:pink_agate_tile_stairs", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_tile_slab": { output: "gaiadimension:pink_agate_tile_slab", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_sapling": { output: "gaiadimension:pink_agate_sapling", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 },
  "gaiadimension:corrupted_varloom": { output: "gaiadimension:varloom", outputCount: 1, byproduct: "gaiadimension:goldstone_residue", byproductCount: 1, time: 200 }
};
var Purifier = class _Purifier extends Machine {
  static get NAME() {
    return "purifier";
  }
  static get INVENTORY_SIZE() {
    return 8;
  }
  // 6 real + 2 UI
  static get TIMERS() {
    return {
      cook: { max: 200 },
      burn: { max: 0 },
      max_burn: { max: 0 }
    };
  }
  static get UI_CONFIG() {
    return {
      classicProfile: {
        inputSlots: [0, 2, 3],
        fuelSlot: 1,
        // glittering (also 2=shining, 3=nulling)
        resultSlots: [4],
        secondaryResultSlot: 5
      },
      pocketProfile: {
        inputSlots: [0, 2, 3],
        fuelSlot: 1,
        resultSlots: [4],
        secondaryResultSlot: 5
      }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Purifier.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Purifier.UI_ROUTING_NAME;
    }
  }
  onTick(dt) {
    if (this.timers.burn.value > 0) {
      this.timers.burn.value = Math.max(0, this.timers.burn.value - dt);
    }
    if (!this.canProcess() && this.timers.cook.value > 0) {
      this.timers.cook.value = Math.max(0, this.timers.cook.value - 2 * dt);
    }
    try {
      const isBurning = this.timers.burn.value > 0;
      const currentState = this.block.permutation.getState("gaiadimension:lit");
      if (isBurning !== currentState) {
        this.block.setPermutation(this.block.permutation.withState("gaiadimension:lit", isBurning));
      }
    } catch (e) {
    }
  }
  updateUI() {
    const burnPercent = this.timers.max_burn.value > 0 ? this.timers.burn.value / this.timers.max_burn.value : 0;
    const burnFill = Math.ceil(burnPercent * 22);
    this.setUiDisplay(6, `\xA76Fuel: ${Math.ceil(burnPercent * 100)}%`, burnFill);
    const cookPercent = this.timers.cook.max > 0 ? this.timers.cook.value / this.timers.cook.max : 0;
    const cookFill = Math.ceil(cookPercent * 24);
    this.setUiDisplay(7, `\xA7eProgress: ${Math.floor(cookPercent * 100)}%`, cookFill);
  }
  canProcess() {
    const inputItem = this.inventory.getItem(0);
    if (!inputItem) return false;
    const recipe = PURIFIER_RECIPES[inputItem.typeId];
    if (!recipe) return false;
    if (this.timers.burn.value <= 0) {
      const glitterFuel = this.inventory.getItem(1);
      const shineFuel = this.inventory.getItem(2);
      const nullFuel = this.inventory.getItem(3);
      if (!glitterFuel || !shineFuel || !nullFuel) return false;
      if (!GLITTERING_FUELS2[glitterFuel.typeId] || !SHINING_FUELS2[shineFuel.typeId] || !NULLING_FUELS[nullFuel.typeId]) return false;
    }
    const outputItem = this.inventory.getItem(4);
    if (outputItem) {
      if (outputItem.typeId !== recipe.output || outputItem.amount + recipe.outputCount > outputItem.maxStackSize) return false;
    }
    const byproductItem = this.inventory.getItem(5);
    if (byproductItem) {
      if (byproductItem.typeId !== recipe.byproduct || byproductItem.amount + recipe.byproductCount > byproductItem.maxStackSize) return false;
    }
    return true;
  }
  processTick(dt = 1) {
    const profile = this.cachedUiProfile || this.getCurrentUiProfile();
    if (this.timers.burn.value <= 0) {
      const glitterFuel = this.inventory.getItem(1);
      const shineFuel = this.inventory.getItem(2);
      const nullFuel = this.inventory.getItem(3);
      if (!glitterFuel || !shineFuel || !nullFuel) return;
      const glitterBurn = GLITTERING_FUELS2[glitterFuel.typeId] || 0;
      const shineBurn = SHINING_FUELS2[shineFuel.typeId] || 0;
      const nullBurn = NULLING_FUELS[nullFuel.typeId] || 0;
      if (glitterBurn <= 0 || shineBurn <= 0 || nullBurn <= 0) return;
      const averageBurn = Math.floor((glitterBurn + shineBurn + nullBurn) / 3);
      this.consumeItem(1, 1);
      this.consumeItem(2, 1);
      this.consumeItem(3, 1);
      this.timers.burn.value = averageBurn;
      this.timers.max_burn.value = averageBurn;
    }
    const inputItem = this.inventory.getItem(0);
    if (!inputItem) {
      this.timers.cook.value = 0;
      return;
    }
    const recipe = PURIFIER_RECIPES[inputItem.typeId];
    if (!recipe) {
      this.timers.cook.value = 0;
      return;
    }
    this.timers.cook.max = recipe.time;
    this.timers.cook.add(dt);
    if (this.timers.cook.value >= this.timers.cook.max) {
      this.timers.cook.value = 0;
      this.consumeItem(0, 1);
      this.addToSlot(4, new ItemStack10(recipe.output, recipe.outputCount), profile);
      this.addToSlot(5, new ItemStack10(recipe.byproduct, recipe.byproductCount), profile);
    }
  }
  addToSlot(slot, itemStack, profile) {
    const current = this.inventory.getItem(slot);
    if (!current) {
      this.setInventoryItem(slot, itemStack, profile);
    } else if (current.typeId === itemStack.typeId) {
      const maxStack = current.maxStackSize ?? 64;
      if (current.amount < maxStack) {
        const space = maxStack - current.amount;
        const add = Math.min(space, itemStack.amount);
        if (add > 0) {
          current.amount += add;
          this.setInventoryItem(slot, current, profile);
        }
      }
    }
  }
};
BlockEntity_default.register(Purifier);
function registerPurifierComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:purifier", {
    onPlayerDestroy: () => {
    }
  });
}

// src/main/bedrock/ts/blocks/augmenter/Augmenter.ts
import { ItemStack as ItemStack11 } from "@minecraft/server";
var ELEMENT_MAP = {
  "gaiadimension:tektite": "physical",
  "gaiadimension:crystal_core": "physical",
  "gaiadimension:spitfire_heart": "fire",
  "gaiadimension:shockshooter_soul": "electric",
  "gaiadimension:moss_agate_claw": "poison",
  "gaiadimension:howlite_fang": "frost",
  "gaiadimension:spellbound_core": "magic",
  "gaiadimension:bismuth_horn": "energy"
};
var BEHAVIOR_MAP = {
  "gaiadimension:tektite": "basic",
  "gaiadimension:stibnite": "scatter",
  "gaiadimension:euclase": "ricochet",
  "gaiadimension:carnelian": "blast",
  "gaiadimension:benitoite": "linger",
  "gaiadimension:goshenite": "burst"
};
var STAT_MAP = {
  "gaiadimension:tektite": "standard",
  "gaiadimension:scaynyx_ingot": "power",
  "gaiadimension:glitter_rod": "speed",
  "gaiadimension:shiny_bone": "recharge",
  "gaiadimension:magnetite_rod": "force",
  "gaiadimension:aura_rod": "sustain"
};
var Augmenter = class _Augmenter extends Machine {
  static get NAME() {
    return "augmenter";
  }
  static get INVENTORY_SIZE() {
    return 5;
  }
  static get UI_CONFIG() {
    return {
      classicProfile: {
        inputSlots: [0, 1, 2, 3],
        resultSlots: [4]
      },
      pocketProfile: {
        inputSlots: [0, 1, 2, 3],
        resultSlots: [4]
      }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Augmenter.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _Augmenter.UI_ROUTING_NAME;
    }
  }
  onTick(dt) {
    this.updateOutputPreview();
  }
  updateUI() {
  }
  updateOutputPreview() {
    try {
      const staffItem = this.inventory.getItem(0);
      const coreItem = this.inventory.getItem(1);
      const headItem = this.inventory.getItem(2);
      const rodItem = this.inventory.getItem(3);
      if (!staffItem || !staffItem.typeId.includes("magic_staff")) {
        const currentOutput = this.inventory.getItem(4);
        if (currentOutput) {
          this.inventory.setItem(4, void 0);
        }
        return;
      }
      const hasCore = coreItem && ELEMENT_MAP[coreItem.typeId] !== void 0;
      const hasHead = headItem && BEHAVIOR_MAP[headItem.typeId] !== void 0;
      const hasRod = rodItem && STAT_MAP[rodItem.typeId] !== void 0;
      if (!hasCore && !hasHead && !hasRod) {
        const currentOutput = this.inventory.getItem(4);
        if (currentOutput) {
          this.inventory.setItem(4, void 0);
        }
        return;
      }
      const outputPreview = new ItemStack11(staffItem.typeId, 1);
      const loreLines = [];
      if (hasCore) loreLines.push(`\xA79Element: ${ELEMENT_MAP[coreItem.typeId]}`);
      if (hasHead) loreLines.push(`\xA75Behavior: ${BEHAVIOR_MAP[headItem.typeId]}`);
      if (hasRod) loreLines.push(`\xA76Stat: ${STAT_MAP[rodItem.typeId]}`);
      outputPreview.setLore(loreLines);
      outputPreview.nameTag = staffItem.nameTag || "\xA7dModified Magic Staff";
      this.inventory.setItem(4, outputPreview);
    } catch (e) {
    }
  }
  /**
   * Called when a player takes the output item.
   * Consume the ingredients.
   */
  canProcess() {
    return false;
  }
  processTick(dt = 1) {
  }
};
BlockEntity_default.register(Augmenter);
function registerAugmenterComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:augmenter", {
    onPlace: (arg) => {
      const { block, dimension } = arg;
      const location = block.location;
      const center = { x: location.x + 0.5, y: location.y, z: location.z + 0.5 };
      try {
        const entity = dimension.spawnEntity("luminiae_generic:block_entity", center);
        BlockEntity_default.registerEntityAsMachine(entity);
      } catch (e) {
        console.warn("Failed to spawn augmenter entity", e);
      }
    },
    onPlayerDestroy: () => {
    }
  });
}

// src/main/bedrock/ts/blocks/glittering_fire.ts
import { world as world15, system as system19 } from "@minecraft/server";

// src/main/bedrock/ts/API/lib/PortalLib.ts
import {
  BlockPermutation as BlockPermutation9,
  BlockVolume
} from "@minecraft/server";
var PortalManager = class {
  static registeredPortals = /* @__PURE__ */ new Map();
  static register(portalBlockId, frameBlockId, options = {}) {
    this.registeredPortals.set(portalBlockId, {
      frameId: frameBlockId,
      ...options
    });
  }
  static tryIgnite(originBlock) {
    if (!originBlock || !originBlock.dimension) {
      return false;
    }
    for (const [portalId, config] of this.registeredPortals) {
      if (this.attemptPortalCreation(originBlock, portalId, config.frameId)) {
        return true;
      }
    }
    return false;
  }
  static attemptPortalCreation(originBlock, portalId, frameId) {
    const shapeX = this.detectPortalShape(originBlock, frameId, "x");
    if (shapeX) {
      this.fillPortal(shapeX, portalId, "x");
      return true;
    }
    const shapeZ = this.detectPortalShape(originBlock, frameId, "z");
    if (shapeZ) {
      this.fillPortal(shapeZ, portalId, "z");
      return true;
    }
    return false;
  }
  static detectPortalShape(startBlock, frameId, axis) {
    const dim = startBlock.dimension;
    if (!dim) return null;
    const { x, y, z } = startBlock.location;
    const MAX_SIZE = 21;
    const MIN_SIZE = 2;
    const fillerId = startBlock.typeId;
    const dx = axis === "x" ? 1 : 0;
    const dz = axis === "z" ? 1 : 0;
    const minYLimit = dim.heightRange ? dim.heightRange.min : -64;
    const maxYLimit = dim.heightRange ? dim.heightRange.max : 320;
    let bottomY = y;
    while (true) {
      const checkY = bottomY - 1;
      if (bottomY - y < -MAX_SIZE) return null;
      if (checkY < minYLimit) return null;
      let block;
      try {
        block = dim.getBlock({ x, y: checkY, z });
      } catch (e) {
        return null;
      }
      if (!block) return null;
      if (this.isEmptyBlock(dim, block.location) || block.typeId === fillerId) {
        bottomY = checkY;
      } else if (block.typeId === frameId) {
        break;
      } else {
        return null;
      }
    }
    let topY = bottomY;
    while (true) {
      if (topY - bottomY >= MAX_SIZE) return null;
      if (topY + 1 > maxYLimit) return null;
      let block;
      try {
        block = dim.getBlock({ x, y: topY + 1, z });
      } catch (e) {
        return null;
      }
      if (!block) return null;
      if (this.isEmptyBlock(dim, block.location) || block.typeId === fillerId) {
        topY++;
      } else if (block.typeId === frameId) {
        break;
      } else {
        return null;
      }
    }
    const height = topY - bottomY + 1;
    if (height < MIN_SIZE) {
      return null;
    }
    let minSide = 0;
    let maxSide = 0;
    for (let i = 1; i <= MAX_SIZE; i++) {
      const cx = x - dx * i;
      const cz = z - dz * i;
      if (!this.checkColumn(dim, cx, cz, bottomY, topY, frameId, fillerId)) {
        if (this.checkFrameColumn(dim, cx, cz, bottomY, topY, frameId)) {
          minSide = -i;
          break;
        } else {
          return null;
        }
      }
    }
    for (let i = 1; i <= MAX_SIZE; i++) {
      const cx = x + dx * i;
      const cz = z + dz * i;
      if (!this.checkColumn(dim, cx, cz, bottomY, topY, frameId, fillerId)) {
        if (this.checkFrameColumn(dim, cx, cz, bottomY, topY, frameId)) {
          maxSide = i;
          break;
        } else {
          return null;
        }
      }
    }
    if (minSide === 0 || maxSide === 0) return null;
    const width = maxSide - minSide - 1;
    if (width < MIN_SIZE) return null;
    for (let i = minSide; i <= maxSide; i++) {
      const cx = x + dx * i;
      const cz = z + dz * i;
      const floorBlock = dim.getBlock({ x: cx, y: bottomY - 1, z: cz });
      const ceilBlock = dim.getBlock({ x: cx, y: topY + 1, z: cz });
      if (!floorBlock || floorBlock.typeId !== frameId) return null;
      if (!ceilBlock || ceilBlock.typeId !== frameId) return null;
    }
    return {
      dimension: dim,
      bounds: {
        minX: x + dx * minSide + (axis === "x" ? 1 : 0),
        maxX: x + dx * maxSide - (axis === "x" ? 1 : 0),
        minZ: z + dz * minSide + (axis === "z" ? 1 : 0),
        maxZ: z + dz * maxSide - (axis === "z" ? 1 : 0),
        minY: bottomY,
        maxY: topY
      }
    };
  }
  static checkColumn(dim, x, z, minY, maxY, frameId, fillerId) {
    for (let y = minY; y <= maxY; y++) {
      let block;
      try {
        block = dim.getBlock({ x, y, z });
      } catch (e) {
        return false;
      }
      if (!block || !this.isEmptyBlock(dim, block.location) && block.typeId !== fillerId) return false;
    }
    return true;
  }
  static checkFrameColumn(dim, x, z, minY, maxY, frameId) {
    for (let y = minY; y <= maxY; y++) {
      let block;
      try {
        block = dim.getBlock({ x, y, z });
      } catch (e) {
        return false;
      }
      if (!block || block.typeId !== frameId) return false;
    }
    return true;
  }
  static fillPortal(shape, portalId, axis) {
    const { dimension, bounds } = shape;
    const { minX, maxX, minZ, maxZ, minY, maxY } = bounds;
    let blockPerm = null;
    try {
      const perm = BlockPermutation9.resolve(portalId);
      try {
        const dir = axis === "x" ? "north" : "east";
        blockPerm = perm.withState("minecraft:cardinal_direction", dir);
      } catch (e2) {
        blockPerm = perm;
      }
    } catch (e) {
    }
    let filled = false;
    if (blockPerm) {
      try {
        const volume = new BlockVolume(
          { x: minX, y: minY, z: minZ },
          { x: maxX, y: maxY, z: maxZ }
        );
        dimension.fillBlocks(volume, blockPerm, { matchingBlock: void 0 });
        filled = true;
      } catch (e) {
      }
    }
    if (!filled) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let y = minY; y <= maxY; y++) {
            const block = dimension.getBlock({ x, y, z });
            if (block) {
              try {
                if (blockPerm) {
                  block.setPermutation(blockPerm);
                } else {
                  block.setType(portalId);
                }
              } catch (e) {
                try {
                  block.setType(portalId);
                } catch (e2) {
                }
              }
            }
          }
        }
      }
    }
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    };
    dimension.playSound("block.end_portal.spawn", center);
  }
  static getExistingPortal(pos, dimension, portalBlockId, range = 128) {
    const startX = Math.floor(pos.x);
    const startZ = Math.floor(pos.z);
    const scanRange = 16;
    for (let x = startX - scanRange; x <= startX + scanRange; x += 16) {
      for (let z = startZ - scanRange; z <= startZ + scanRange; z += 16) {
        for (let y = dimension.heightRange.min; y < dimension.heightRange.max; y += 16) {
          try {
            const block = dimension.getBlock({ x, y, z });
            if (block && block.typeId === portalBlockId) {
              return block;
            }
          } catch (e) {
          }
        }
      }
    }
    return null;
  }
  static makePortal(pos, dimension, axis, portalBlockId, frameBlockId) {
    const origin = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
    const worldBorder = 3e7;
    const heightMax = dimension.heightRange.max;
    const heightMin = dimension.heightRange.min;
    const direction = axis === "x" ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    const crossDir = axis === "x" ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    let d0 = -1;
    let blockpos = null;
    let d1 = -1;
    let blockpos1 = null;
    const spiral = this.spiralAround(origin, 16);
    for (const mut of spiral) {
      if (!this.isWithinBounds(mut, worldBorder) || !this.isWithinBounds(this.offset(mut, direction), worldBorder)) continue;
      const checkPos = this.offset(mut, { x: -direction.x, y: -direction.y, z: -direction.z });
      for (let l = heightMax - 1; l >= heightMin; l--) {
        checkPos.y = l;
        if (this.canReplaceBlock(dimension, checkPos)) {
          let i1 = l;
          while (l > heightMin && this.canReplaceBlock(dimension, this.offset(checkPos, { x: 0, y: -1, z: 0 }))) {
            l--;
          }
          if (l + 4 <= heightMax) {
            let j1 = i1 - l;
            if (j1 <= 0 || j1 >= 3) {
              checkPos.y = l;
              if (this.checkRegionForPlacement(dimension, checkPos, direction, crossDir, 0)) {
                const d2 = this.distSqr(origin, checkPos);
                if (this.checkRegionForPlacement(dimension, checkPos, direction, crossDir, -1) && this.checkRegionForPlacement(dimension, checkPos, direction, crossDir, 1) && (d0 === -1 || d0 > d2)) {
                  d0 = d2;
                  blockpos = { ...checkPos };
                }
                if (d0 === -1 && (d1 === -1 || d1 > d2)) {
                  d1 = d2;
                  blockpos1 = { ...checkPos };
                }
              }
            }
          }
        }
      }
    }
    if (d0 === -1 && d1 !== -1) {
      blockpos = blockpos1;
      d0 = d1;
    }
    if (d0 === -1 || !blockpos) {
      blockpos = {
        x: origin.x,
        y: Math.max(heightMin + 70, Math.min(origin.y, heightMax - 10)),
        z: origin.z
      };
      for (let fOffset = -1; fOffset < 2; ++fOffset) {
        for (let fWidth = 0; fWidth < 2; ++fWidth) {
          for (let fHeight = -1; fHeight < 3; ++fHeight) {
            const isFloor = fHeight < 0;
            const p = {
              x: blockpos.x + fWidth * direction.x + fOffset * crossDir.x,
              y: blockpos.y + fHeight,
              z: blockpos.z + fWidth * direction.z + fOffset * crossDir.z
            };
            const blk = dimension.getBlock(p);
            if (blk) blk.setPermutation(BlockPermutation9.resolve(isFloor ? frameBlockId : "minecraft:air"));
          }
        }
      }
    }
    for (let fWidth = -1; fWidth < 3; ++fWidth) {
      for (let fHeight = -1; fHeight < 4; ++fHeight) {
        if (fWidth === -1 || fWidth === 2 || fHeight === -1 || fHeight === 3) {
          const p = {
            x: blockpos.x + fWidth * direction.x,
            y: blockpos.y + fHeight,
            z: blockpos.z + fWidth * direction.z
          };
          const blk = dimension.getBlock(p);
          if (blk) blk.setPermutation(BlockPermutation9.resolve(frameBlockId));
        }
      }
    }
    const portalPerm = BlockPermutation9.resolve(portalBlockId);
    let orientedPerm;
    try {
      orientedPerm = portalPerm.withState("axis", axis);
    } catch {
      try {
        orientedPerm = portalPerm.withState("minecraft:cardinal_direction", axis === "x" ? "east" : "south");
      } catch {
        orientedPerm = portalPerm;
      }
    }
    for (let pWidth = 0; pWidth < 2; ++pWidth) {
      for (let pHeight = 0; pHeight < 3; ++pHeight) {
        const p = {
          x: blockpos.x + pWidth * direction.x,
          y: blockpos.y + pHeight,
          z: blockpos.z + pWidth * direction.z
        };
        const blk = dimension.getBlock(p);
        if (blk) blk.setPermutation(orientedPerm);
      }
    }
    return blockpos;
  }
  static breakPortal(dimension, startLoc, portalBlockId) {
    const queue = [startLoc];
    const visited = /* @__PURE__ */ new Set();
    const key = (l) => `${l.x},${l.y},${l.z}`;
    visited.add(key(startLoc));
    const blocksToBreak = [];
    const MAX_BLOCKS = 600;
    let head = 0;
    while (head < queue.length && blocksToBreak.length < MAX_BLOCKS) {
      const current = queue[head++];
      let block;
      try {
        block = dimension.getBlock(current);
      } catch (e) {
        continue;
      }
      if (!block) continue;
      if (block.typeId === portalBlockId) {
        blocksToBreak.push(block);
        const neighbors = [
          { x: current.x + 1, y: current.y, z: current.z },
          { x: current.x - 1, y: current.y, z: current.z },
          { x: current.x, y: current.y + 1, z: current.z },
          { x: current.x, y: current.y - 1, z: current.z },
          { x: current.x, y: current.y, z: current.z + 1 },
          { x: current.x, y: current.y, z: current.z - 1 }
        ];
        for (const n of neighbors) {
          const k = key(n);
          if (!visited.has(k)) {
            visited.add(k);
            queue.push(n);
          }
        }
      }
    }
    if (blocksToBreak.length > 0) {
      dimension.playSound("break.amethyst_block", startLoc);
      for (const b of blocksToBreak) {
        try {
          b.setType("minecraft:air");
        } catch (e) {
        }
      }
    }
  }
  static checkRegionForPlacement(dimension, originalPos, direction, crossDir, offsetScale) {
    for (let i = -1; i < 3; ++i) {
      for (let j = -1; j < 4; ++j) {
        const p = {
          x: originalPos.x + direction.x * i + crossDir.x * offsetScale,
          y: originalPos.y + j,
          z: originalPos.z + direction.z * i + crossDir.z * offsetScale
        };
        if (j < 0 && !this.isSolid(dimension, p)) {
          return false;
        }
        if (j >= 0 && !this.isEmptyBlock(dimension, p)) {
          return false;
        }
      }
    }
    return true;
  }
  static canReplaceBlock(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      if (!block) return false;
      if (block.isAir || block.isLiquid || block.typeId.includes("minecraft:light_block")) return true;
      if (block.typeId.includes("grass") || block.typeId.includes("flower") || block.typeId.includes("snow")) return true;
      return false;
    } catch (e) {
      return false;
    }
  }
  static isSolid(dimension, pos) {
    try {
      const block = dimension.getBlock(pos);
      return block !== void 0 && !block.isAir && !block.isLiquid && !block.typeId.includes("minecraft:light_block");
    } catch (e) {
      return false;
    }
  }
  static isEmptyBlock(dimension, pos) {
    return this.canReplaceBlock(dimension, pos);
  }
  static isWithinBounds(pos, border) {
    return Math.abs(pos.x) < border && Math.abs(pos.z) < border;
  }
  static distSqr(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return dx * dx + dy * dy + dz * dz;
  }
  static offset(pos, offset) {
    return { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
  }
  static *spiralAround(center, radius) {
    let x = 0;
    let z = 0;
    let dx = 0;
    let dz = -1;
    yield { x: center.x, y: center.y, z: center.z };
    const maxSteps = (2 * radius + 1) ** 2;
    for (let i = 0; i < maxSteps; i++) {
      if (-radius <= x && x <= radius && -radius <= z && z <= radius) {
        if (x !== 0 || z !== 0) {
          yield { x: center.x + x, y: center.y, z: center.z + z };
        }
      }
      if (x === z || x < 0 && x === -z || x > 0 && x === 1 - z) {
        const temp = dx;
        dx = -dz;
        dz = temp;
      }
      x += dx;
      z += dz;
    }
  }
};

// src/main/bedrock/ts/config/mod_config.ts
import { world as world14 } from "@minecraft/server";

// src/main/bedrock/ts/systems/DataSystem.ts
var DataSystem = class {
  /**
   * Traverses an object using a path string (e.g., "inventory[0].id")
   */
  static getByPath(obj, path) {
    if (!path) return obj;
    const parts = path.split(/[.\[\]]+/).filter((p) => p !== "");
    let current = obj;
    for (const part of parts) {
      if (current === void 0 || current === null) return void 0;
      current = current[part];
    }
    return current;
  }
  /**
   * Sets a value in an object using a path string.
   */
  static setByPath(obj, path, value) {
    const parts = path.split(/[.\[\]]+/).filter((p) => p !== "");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const currentObj = current;
      if (!(part in currentObj)) {
        const nextPart = parts[i + 1];
        currentObj[part] = !isNaN(Number(nextPart)) ? [] : {};
      }
      current = currentObj[part];
    }
    current[parts[parts.length - 1]] = value;
    return obj;
  }
  /**
   * Deep merges source into target
   */
  static deepMerge(target, source) {
    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (sourceValue instanceof Object && key in target && targetValue instanceof Object) {
        Object.assign(sourceValue, this.deepMerge(targetValue, sourceValue));
      }
    }
    Object.assign(target || {}, source);
    return target;
  }
  /**
   * Helper to read the "root" data object from a target's dynamic property
   */
  static getRoot(target, key = "nbt") {
    const raw = target.getDynamicProperty(key);
    if (typeof raw !== "string") return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  /**
   * Helper to save the "root" data object
   */
  static saveRoot(target, data, key = "nbt") {
    target.setDynamicProperty(key, JSON.stringify(data));
  }
};

// src/main/bedrock/ts/config/mod_config.ts
var CONFIG_KEY = "mod_config";
var DEFAULT_HOT_BIOMES = [
  "minecraft:desert",
  "minecraft:desert_hills",
  "minecraft:mutated_desert",
  "minecraft:jungle",
  "minecraft:jungle_hills",
  "minecraft:jungle_edge",
  "minecraft:mutated_jungle",
  "minecraft:mutated_jungle_edge",
  "minecraft:bamboo_jungle",
  "minecraft:bamboo_jungle_hills",
  "minecraft:savanna",
  "minecraft:savanna_plateau",
  "minecraft:mutated_savanna",
  "minecraft:mutated_savanna_rocky",
  "minecraft:badlands",
  "minecraft:eroded_badlands",
  "minecraft:badlands_plateau",
  "minecraft:mutated_badlands_plateau",
  "minecraft:wooded_badlands_plateau",
  "minecraft:mutated_wooded_badlands_plateau"
];
var ModConfig = class {
  /**
   * Portal Biome Restriction Setting
   */
  static get portalBiomeRestriction() {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    return root.portalBiomeRestriction ?? true;
  }
  static set portalBiomeRestriction(value) {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    root.portalBiomeRestriction = value;
    DataSystem.saveRoot(world14, root, CONFIG_KEY);
  }
  /**
   * Allow All Biomes Setting
   */
  static get allowAllBiomes() {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    return root.allowAllBiomes ?? false;
  }
  static set allowAllBiomes(value) {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    root.allowAllBiomes = value;
    DataSystem.saveRoot(world14, root, CONFIG_KEY);
  }
  /**
   * List of biomes where the portal can be ignited
   */
  static get hotBiomes() {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    return root.hotBiomes ?? [...DEFAULT_HOT_BIOMES];
  }
  static set hotBiomes(value) {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    root.hotBiomes = value;
    DataSystem.saveRoot(world14, root, CONFIG_KEY);
  }
  /**
   * Comprehensive list of all biomes encountered by players
   */
  static get discoveredBiomes() {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    const discovered = root.discoveredBiomes ?? [...DEFAULT_HOT_BIOMES];
    return discovered;
  }
  static set discoveredBiomes(value) {
    const root = DataSystem.getRoot(world14, CONFIG_KEY);
    root.discoveredBiomes = value;
    DataSystem.saveRoot(world14, root, CONFIG_KEY);
  }
  static registerDiscoveredBiome(biomeId) {
    const discovered = this.discoveredBiomes;
    if (!discovered.includes(biomeId)) {
      discovered.push(biomeId);
      discovered.sort();
      this.discoveredBiomes = discovered;
    }
  }
  static addHotBiome(biomeId) {
    this.registerDiscoveredBiome(biomeId);
    const biomes = this.hotBiomes;
    if (!biomes.includes(biomeId)) {
      biomes.push(biomeId);
      this.hotBiomes = biomes;
    }
  }
  static removeHotBiome(biomeId) {
    const biomes = this.hotBiomes.filter((id) => id !== biomeId);
    this.hotBiomes = biomes;
  }
  static getAll() {
    return {
      portalBiomeRestriction: this.portalBiomeRestriction,
      allowAllBiomes: this.allowAllBiomes,
      hotBiomes: this.hotBiomes,
      discoveredBiomes: this.discoveredBiomes
    };
  }
};

// src/main/bedrock/ts/blocks/glittering_fire.ts
PortalManager.register("gaiadimension:gaia_dimension_portal", "gaiadimension:keystone_block");
var playerHitboxes = /* @__PURE__ */ new Map();
function registerGlitteringFireComponent() {
  system19.runInterval(() => {
    for (const player of world15.getAllPlayers()) {
      const raycast = player.getBlockFromViewDirection({ maxDistance: 5 });
      const currentHitbox = playerHitboxes.get(player.id);
      if (raycast && raycast.block.typeId === "gaiadimension:glittering_fire") {
        const fireBlock = raycast.block;
        const loc = fireBlock.location;
        const center = { x: loc.x + 0.5, y: loc.y + 0.2, z: loc.z + 0.5 };
        if (currentHitbox) {
          const hLoc = currentHitbox.location;
          if (Math.floor(hLoc.x) !== loc.x || Math.floor(hLoc.y) !== loc.y || Math.floor(hLoc.z) !== loc.z) {
            try {
              currentHitbox.teleport(center);
            } catch (e) {
              playerHitboxes.delete(player.id);
            }
          }
        } else {
          try {
            const entity = player.dimension.spawnEntity("gaiadimension:fire_hitbox", center);
            playerHitboxes.set(player.id, entity);
          } catch (e) {
          }
        }
      } else if (currentHitbox) {
        try {
          if (currentHitbox.isValid) currentHitbox.remove();
        } catch (e) {
        }
        playerHitboxes.delete(player.id);
      }
    }
  }, 2);
  world15.afterEvents.playerLeave.subscribe((event) => {
    const { playerId } = event;
    const currentHitbox = playerHitboxes.get(playerId);
    if (currentHitbox) {
      try {
        if (currentHitbox.isValid) currentHitbox.remove();
      } catch (e) {
      }
      playerHitboxes.delete(playerId);
    }
  });
  world15.afterEvents.entityHitEntity.subscribe((event) => {
    const { hitEntity } = event;
    if (hitEntity.typeId === "gaiadimension:fire_hitbox") {
      const loc = hitEntity.location;
      const blockLoc = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
      const dimension = hitEntity.dimension;
      system19.run(() => {
        const block = dimension.getBlock(blockLoc);
        if (block && block.typeId === "gaiadimension:glittering_fire") {
          block.setType("minecraft:air");
          dimension.playSound("random.fizz", blockLoc, {
            volume: 1,
            pitch: 1
          });
        }
        if (hitEntity.isValid) hitEntity.remove();
        for (const [pid, entity] of playerHitboxes) {
          if (entity.id === hitEntity.id) {
            playerHitboxes.delete(pid);
            break;
          }
        }
      });
    }
  });
  world15.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { block } = event;
    if (block.typeId === "gaiadimension:glittering_fire") {
      system19.run(() => {
        try {
          const dimension = block.dimension;
          const location = block.location;
          if (dimension.id === "minecraft:overworld" && ModConfig.portalBiomeRestriction && !ModConfig.allowAllBiomes) {
            const biome = dimension.getBiome(location);
            const hotBiomes = ModConfig.hotBiomes;
            if (!hotBiomes.includes(biome.id)) {
              const currentBlock2 = dimension.getBlock(location);
              if (currentBlock2 && currentBlock2.typeId === "gaiadimension:glittering_fire") {
                currentBlock2.setType("minecraft:air");
                dimension.playSound("random.fizz", location);
              }
              return;
            }
          }
          const currentBlock = dimension.getBlock(location);
          if (currentBlock && currentBlock.typeId === "gaiadimension:glittering_fire") {
            PortalManager.tryIgnite(currentBlock);
          }
        } catch (e) {
        }
      });
    }
  });
  world15.beforeEvents.playerBreakBlock.subscribe((event) => {
    const { block } = event;
    if (block.typeId === "gaiadimension:glittering_fire") {
      event.cancel = true;
    }
  });
  world15.afterEvents.playerBreakBlock.subscribe((event) => {
    const { block, brokenBlockPermutation, dimension } = event;
    const brokenId = brokenBlockPermutation.type.id;
    if (PortalManager.registeredPortals.has(brokenId)) {
      const neighbors = [
        block.above(),
        block.below(),
        block.north(),
        block.south(),
        block.east(),
        block.west()
      ];
      for (const neighbor of neighbors) {
        if (neighbor && neighbor.typeId === brokenId) {
          PortalManager.breakPortal(dimension, neighbor.location, brokenId);
          break;
        }
      }
      return;
    }
    for (const [portalId, config] of PortalManager.registeredPortals) {
      if (config.frameId === brokenId) {
        const neighbors = [
          block.above(),
          block.below(),
          block.north(),
          block.south(),
          block.east(),
          block.west()
        ];
        for (const neighbor of neighbors) {
          if (neighbor && neighbor.typeId === portalId) {
            PortalManager.breakPortal(dimension, neighbor.location, portalId);
            break;
          }
        }
      }
    }
  });
}

// src/main/bedrock/ts/blocks/crates/crude_storage_crate.ts
var CrudeStorageCrate = class _CrudeStorageCrate extends Machine {
  static get NAME() {
    return "crude_storage_crate";
  }
  static get INVENTORY_SIZE() {
    return 27;
  }
  static get UI_CONFIG() {
    const slots = Array.from({ length: 27 }, (_, i) => i);
    return {
      classicProfile: {
        inputSlots: slots
      },
      pocketProfile: {
        inputSlots: slots
      }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _CrudeStorageCrate.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _CrudeStorageCrate.UI_ROUTING_NAME;
    }
  }
};
BlockEntity_default.register(CrudeStorageCrate);
function registerCrudeStorageCrateComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:crude_storage_crate", {
    onPlace: (event) => {
      const { block, dimension } = event;
      const location = block.location;
      const center = { x: location.x + 0.5, y: location.y, z: location.z + 0.5 };
      try {
        const entity = dimension.spawnEntity("gaiadimension:crude_storage_crate", center);
        BlockEntity_default.registerEntityAsMachine(entity);
      } catch (e) {
        console.warn("Failed to spawn crude storage crate entity", e);
      }
    }
  });
}

// src/main/bedrock/ts/blocks/crates/mega_storage_crate.ts
var MegaStorageCrate = class _MegaStorageCrate extends Machine {
  static get NAME() {
    return "mega_storage_crate";
  }
  static get INVENTORY_SIZE() {
    return 54;
  }
  static get UI_CONFIG() {
    const slots = Array.from({ length: 54 }, (_, i) => i);
    return {
      classicProfile: {
        inputSlots: slots
      },
      pocketProfile: {
        inputSlots: slots
      }
    };
  }
  constructor(entity, block) {
    super(entity, block);
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _MegaStorageCrate.UI_ROUTING_NAME;
    }
  }
  onLoad() {
    if (this.entity && this.entity.isValid) {
      this.entity.nameTag = _MegaStorageCrate.UI_ROUTING_NAME;
    }
  }
};
BlockEntity_default.register(MegaStorageCrate);
function registerMegaStorageCrateComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:mega_storage_crate", {
    onPlace: (event) => {
      const { block, dimension } = event;
      const location = block.location;
      const center = { x: location.x + 0.5, y: location.y, z: location.z + 0.5 };
      try {
        const entity = dimension.spawnEntity("gaiadimension:mega_storage_crate", center);
        BlockEntity_default.registerEntityAsMachine(entity);
      } catch (e) {
        console.warn("Failed to spawn mega storage crate entity", e);
      }
    }
  });
}

// src/main/bedrock/ts/blocks/flora/AuraShoot.ts
import {
  world as world16
} from "@minecraft/server";
var AuraShootComponent = {
  onRandomTick(event) {
    const { block } = event;
    const blockAbove = block.above();
    if (!blockAbove || !blockAbove.isAir) {
      return;
    }
    let currentBlock = block;
    let count = 1;
    while (true) {
      const blockBelow = currentBlock.below();
      if (blockBelow && blockBelow.typeId === "gaiadimension:aura_shoot") {
        count++;
        currentBlock = blockBelow;
      } else {
        break;
      }
    }
    if (count < 15) {
      const permutation = block.permutation;
      let age = permutation.getState("gaiadimension:age");
      if (age === 5) {
        blockAbove.setType("gaiadimension:aura_shoot");
        const loc = blockAbove.location;
        const locationColor = Math.abs(loc.x % 5) + Math.abs(loc.z % 5);
        const newPerm = blockAbove.permutation.withState("gaiadimension:is_top", true).withState("gaiadimension:age", 0).withState("gaiadimension:color", locationColor);
        blockAbove.setPermutation(newPerm);
        const currentPerm = permutation.withState("gaiadimension:age", 0).withState("gaiadimension:is_top", false);
        block.setPermutation(currentPerm);
      } else {
        const currentPerm = permutation.withState("gaiadimension:age", age + 1);
        block.setPermutation(currentPerm);
      }
    }
  },
  onPlace(event) {
    const { block } = event;
    const loc = block.location;
    const locationColor = Math.abs(loc.x % 5) + Math.abs(loc.z % 5);
    let isTop = true;
    const blockAbove = block.above();
    if (blockAbove) {
      const isTrunk = blockAbove.typeId.includes("log") || blockAbove.typeId.includes("wood");
      if (blockAbove.typeId === "gaiadimension:aura_shoot" || isTrunk) {
        isTop = false;
      }
    }
    block.setPermutation(block.permutation.withState("gaiadimension:color", locationColor).withState("gaiadimension:is_top", isTop));
    const blockBelow = block.below();
    if (blockBelow && blockBelow.typeId === "gaiadimension:aura_shoot") {
      const currentPerm = blockBelow.permutation.withState("gaiadimension:is_top", false);
      blockBelow.setPermutation(currentPerm);
    }
  },
  onPlayerDestroy(event) {
    const { block } = event;
    const blockBelow = block.below();
    if (blockBelow && blockBelow.typeId === "gaiadimension:aura_shoot") {
      const currentPerm = blockBelow.permutation.withState("gaiadimension:is_top", true);
      blockBelow.setPermutation(currentPerm);
    }
  }
};
function registerAuraShootComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:aura_shoot", AuraShootComponent);
  world16.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { block } = event;
    const blockBelow = block.below();
    if (blockBelow && blockBelow.typeId === "gaiadimension:aura_shoot") {
      const isTrunk = block.typeId.includes("log") || block.typeId.includes("wood");
      if (block.typeId === "gaiadimension:aura_shoot" || isTrunk) {
        const currentPerm = blockBelow.permutation.withState("gaiadimension:is_top", false);
        blockBelow.setPermutation(currentPerm);
      }
    }
  });
  world16.afterEvents.playerBreakBlock.subscribe((event) => {
    const { block } = event;
    const blockBelow = block.below();
    if (blockBelow && blockBelow.typeId === "gaiadimension:aura_shoot") {
      const blockAbove = blockBelow.above();
      let isTop = true;
      if (blockAbove) {
        const isTrunk = blockAbove.typeId.includes("log") || blockAbove.typeId.includes("wood");
        if (blockAbove.typeId === "gaiadimension:aura_shoot" || isTrunk) {
          isTop = false;
        }
      }
      if (isTop) {
        const currentPerm = blockBelow.permutation.withState("gaiadimension:is_top", true);
        blockBelow.setPermutation(currentPerm);
      }
    }
  });
}

// src/main/bedrock/ts/mixins/LightMixin.ts
import { world as world19, system as system22, BlockPermutation as BlockPermutation12 } from "@minecraft/server";

// src/main/bedrock/ts/world/Gaia.ts
import { world as world18, system as system21, BlockPermutation as BlockPermutation11, BlockVolume as BlockVolume2 } from "@minecraft/server";

// src/main/bedrock/ts/world/GaiaChunkCoordinator.ts
import {
  world as world17,
  system as system20,
  BlockPermutation as BlockPermutation10
} from "@minecraft/server";
var GAIA_DIMENSION_ID = "gaiadimension:gaia_dimension";
var GAIA_FEATURE_ID = "gaiadimension:gen/base/chunk_sequence";
var SCOREBOARD_OBJECTIVE_GAIA = "gaia_chunks";
var MAX_TICK_BUDGET_MS = 0.45;
var MAX_PLACEMENTS_PER_TICK = 6;
var DEFAULT_RADIUS = 3;
var generatedChunks = /* @__PURE__ */ new Set();
var chunkGenerationQueue = [];
function packChunkCoords(cx, cz) {
  const ux = BigInt.asUintN(32, BigInt(Math.floor(cx)));
  const uz = BigInt.asUintN(32, BigInt(Math.floor(cz)));
  return (ux | uz << 32n).toString(16);
}
function getScoreboardObjective() {
  try {
    if (!world17 || !world17.scoreboard) return null;
    let obj = world17.scoreboard.getObjective(SCOREBOARD_OBJECTIVE_GAIA);
    if (!obj) {
      obj = world17.scoreboard.addObjective(SCOREBOARD_OBJECTIVE_GAIA, SCOREBOARD_OBJECTIVE_GAIA);
    }
    return obj ?? null;
  } catch {
    return null;
  }
}
function isChunkGenerated(cx, cz) {
  const memKey = `${GAIA_DIMENSION_ID}:${cx},${cz}`;
  if (generatedChunks.has(memKey)) return true;
  const obj = getScoreboardObjective();
  if (!obj) return false;
  const hexKey = packChunkCoords(cx, cz);
  try {
    if (typeof obj.getScore === "function") {
      const score = obj.getScore(hexKey);
      if (score !== void 0) {
        generatedChunks.add(memKey);
        return true;
      }
    }
    if (typeof obj.hasParticipant === "function" && obj.hasParticipant(hexKey)) {
      generatedChunks.add(memKey);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
function markChunkGenerated(cx, cz) {
  const memKey = `${GAIA_DIMENSION_ID}:${cx},${cz}`;
  generatedChunks.add(memKey);
  const obj = getScoreboardObjective();
  if (!obj) return;
  const hexKey = packChunkCoords(cx, cz);
  try {
    obj.setScore(hexKey, 1);
  } catch {
  }
}
function isChunkPhysicallyMissing(dimension, cx, cz) {
  if (!dimension || typeof dimension.getBlock !== "function") return false;
  try {
    const b = dimension.getBlock({ x: cx * 16 + 8, y: 0, z: cz * 16 + 8 });
    return b !== void 0 && b !== null && b.typeId === "minecraft:air";
  } catch {
    return false;
  }
}
function buildSafeLandingPlatform(dimension, x = 0, y = 65, z = 0) {
  if (typeof x === "object" && x !== null) {
    y = x.y !== void 0 ? x.y : 65;
    z = x.z !== void 0 ? x.z : 0;
    x = x.x !== void 0 ? x.x : 0;
  }
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const targetY = Math.floor(y);
  const floorY = targetY - 1;
  let platformPerm = null;
  try {
    platformPerm = BlockPermutation10.resolve("gaiadimension:agate_block");
  } catch {
    try {
      platformPerm = BlockPermutation10.resolve("minecraft:obsidian");
    } catch {
      platformPerm = null;
    }
  }
  let airPerm = null;
  try {
    airPerm = BlockPermutation10.resolve("minecraft:air");
  } catch {
    airPerm = null;
  }
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
        } catch {
        }
      }
      if (airPerm) {
        for (let dy = floorY + 1; dy <= floorY + 3; dy++) {
          try {
            const spaceBlock = dimension.getBlock({ x: bx, y: dy, z: bz });
            if (spaceBlock && spaceBlock.typeId !== "minecraft:air") {
              spaceBlock.setPermutation(airPerm);
            }
          } catch {
          }
        }
      }
    }
  }
}
function generateSpawnTerrain(dimension, chunkCenterX = 0, chunkCenterZ = 0, chunkRadius = 2) {
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
      } catch {
      }
    }
  }
}
function getClock() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function updatePlayerChunks(player, radius = DEFAULT_RADIUS, tickStart = getClock(), maxBudgetMs = MAX_TICK_BUDGET_MS) {
  if (!player || !player.isValid || !player.dimension) return 0;
  const dim = player.dimension;
  if (dim.id !== GAIA_DIMENSION_ID) return 0;
  const loc = player.location;
  if (!loc) return 0;
  const centerChunkX = Math.floor(loc.x / 16);
  const centerChunkZ = Math.floor(loc.z / 16);
  if (loc.y < 0) {
    let safeX = loc.x;
    let safeZ = loc.z;
    let safeY = 65;
    generatedChunks.delete(`${GAIA_DIMENSION_ID}:${centerChunkX},${centerChunkZ}`);
    try {
      const placed = dim.placeFeature(GAIA_FEATURE_ID, { x: centerChunkX * 16, y: 0, z: centerChunkZ * 16 });
      if (placed) {
        markChunkGenerated(centerChunkX, centerChunkZ);
      }
    } catch {
    }
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
      } catch {
      }
      buildSafeLandingPlatform(dim, 0, safeY, 0);
    }
    try {
      player.teleport({ x: safeX, y: safeY, z: safeZ }, { dimension: dim });
      if (typeof player.addEffect === "function") {
        player.addEffect("slow_falling", 60, { showParticles: false, amplifier: 0 });
        player.addEffect("resistance", 60, { showParticles: false, amplifier: 4 });
      }
      if (player.onScreenDisplay && typeof player.onScreenDisplay.setActionBar === "function") {
        player.onScreenDisplay.setActionBar("\xA7b\xA7l[GAIA ANOMALY] \xA7eSpace-time anomaly: Void fall prevented!");
      }
      if (typeof player.playSound === "function") {
        player.playSound("portal.travel", { pitch: 1.8, volume: 0.7 });
      }
    } catch {
    }
  }
  const chunkUnderneathMissing = !isChunkGenerated(centerChunkX, centerChunkZ) || isChunkPhysicallyMissing(dim, centerChunkX, centerChunkZ);
  if (chunkUnderneathMissing) {
    generatedChunks.delete(`${GAIA_DIMENSION_ID}:${centerChunkX},${centerChunkZ}`);
    try {
      const placed = dim.placeFeature(GAIA_FEATURE_ID, { x: centerChunkX * 16, y: 0, z: centerChunkZ * 16 });
      if (placed) {
        markChunkGenerated(centerChunkX, centerChunkZ);
      }
    } catch {
    }
    if (loc.y < 60) {
      try {
        if (typeof player.addEffect === "function") {
          player.addEffect("slow_falling", 40, { showParticles: false, amplifier: 0 });
        }
      } catch {
      }
    }
  }
  let dirX = 0;
  let dirZ = 0;
  let isMoving = false;
  try {
    const vel = player.getVelocity?.();
    if (vel) {
      const speedSq = vel.x * vel.x + vel.z * vel.z;
      if (speedSq > 5e-3) {
        const speed = Math.sqrt(speedSq);
        dirX = vel.x / speed;
        dirZ = vel.z / speed;
        isMoving = true;
      }
    }
  } catch {
    isMoving = false;
  }
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
    return 0;
  }
  const maxActiveRing = minUngeneratedRing <= 1 ? 1 : minUngeneratedRing === 2 ? 2 : radius;
  const candidates = [];
  for (let dx = -maxActiveRing; dx <= maxActiveRing; dx++) {
    for (let dz = -maxActiveRing; dz <= maxActiveRing; dz++) {
      const cx = centerChunkX + dx;
      const cz = centerChunkZ + dz;
      if (isChunkGenerated(cx, cz)) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring > maxActiveRing) continue;
      const rawDistSq = dx * dx + dz * dz;
      let distSq2 = ring * 1e3 + rawDistSq;
      if (isMoving && dx * dirX + dz * dirZ > 0) {
        distSq2 -= 10;
      }
      candidates[candidates.length] = { cx, cz, ring, distSq: distSq2 };
    }
  }
  if (candidates.length === 0) {
    chunkGenerationQueue.length = 0;
    return 0;
  }
  candidates.sort((a, b) => a.distSq - b.distSq);
  chunkGenerationQueue.length = 0;
  for (let i = 0; i < candidates.length; i++) {
    chunkGenerationQueue[chunkGenerationQueue.length] = candidates[i];
  }
  let placedCount = 0;
  for (const candidate of candidates) {
    if (placedCount >= MAX_PLACEMENTS_PER_TICK) {
      break;
    }
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
    }
  }
  return placedCount;
}
var coordinatorRunId = null;
function initializeGaiaChunkCoordinator(intervalTicks = 1, radius = DEFAULT_RADIUS, maxBudgetMs = MAX_TICK_BUDGET_MS) {
  if (coordinatorRunId !== null) return coordinatorRunId;
  coordinatorRunId = system20.runInterval(() => {
    const tickStart = getClock();
    try {
      if (!world17 || typeof world17.getAllPlayers !== "function") return;
      const players = world17.getAllPlayers();
      for (const player of players) {
        if (getClock() - tickStart >= maxBudgetMs) break;
        updatePlayerChunks(player, radius, tickStart, maxBudgetMs);
      }
    } catch {
    }
  }, intervalTicks);
  return coordinatorRunId;
}

// src/main/bedrock/ts/world/Gaia.ts
var GAIA_DIMENSION_ID2 = "gaiadimension:gaia_dimension";
var DimensionSystem = class {
  static isInGaia(player) {
    return player.dimension.id === GAIA_DIMENSION_ID2;
  }
  static getBiome(player) {
    try {
      const biome = player.dimension.getBiome(player.location);
      return biome ? biome.id.replace("minecraft:", "").replace("gaiadimension:", "") : "crystal_plains";
    } catch (e) {
      return "crystal_plains";
    }
  }
  static getBiomeAt(dimension, location) {
    try {
      const biome = dimension.getBiome(location);
      return biome ? biome.id.replace("minecraft:", "").replace("gaiadimension:", "") : "crystal_plains";
    } catch (e) {
      return "crystal_plains";
    }
  }
  static async teleport(player, targetDimId) {
    if (!player.isValid) return;
    const targetDim = world18.getDimension(targetDimId);
    const isToGaia = targetDimId === GAIA_DIMENSION_ID2;
    const targetX = player.location.x / (isToGaia ? 4 : 0.25);
    const targetZ = player.location.z / (isToGaia ? 4 : 0.25);
    const targetY = isToGaia ? 100 : 70;
    const spawn = { x: targetX, y: targetY, z: targetZ };
    const tickingAreaId = `teleport_${player.id}`;
    player.sendMessage(`\xA7eLoading Gaia Dimension...`);
    await world18.tickingAreaManager.createTickingArea(tickingAreaId, {
      dimension: targetDim,
      from: { x: spawn.x - 8, y: 0, z: spawn.z - 8 },
      to: { x: spawn.x + 8, y: 128, z: spawn.z + 8 }
    });
    if (isToGaia) {
      const targetChunkX = Math.floor(targetX / 16);
      const targetChunkZ = Math.floor(targetZ / 16);
      generateSpawnTerrain(targetDim, targetChunkX, targetChunkZ, 2);
    }
    const px = Math.floor(spawn.x);
    const py = Math.floor(spawn.y);
    const pz = Math.floor(spawn.z);
    targetDim.fillBlocks(
      new BlockVolume2({ x: px - 2, y: py - 1, z: pz - 2 }, { x: px + 2, y: py - 1, z: pz + 2 }),
      "minecraft:obsidian",
      { ignoreChunkBoundErrors: true }
    );
    const keystone = "gaiadimension:keystone_block";
    const portal = "gaiadimension:gaia_dimension_portal";
    for (let i = -1; i <= 2; i++) {
      targetDim.getBlock({ x: px + i, y: py, z: pz })?.setType(keystone);
      targetDim.getBlock({ x: px + i, y: py + 4, z: pz })?.setType(keystone);
    }
    for (let i = 1; i <= 3; i++) {
      targetDim.getBlock({ x: px - 1, y: py + i, z: pz })?.setType(keystone);
      targetDim.getBlock({ x: px + 2, y: py + i, z: pz })?.setType(keystone);
    }
    const portalPerm = BlockPermutation11.resolve(portal, { "gaiadimension:perm_dim": 0 });
    for (let ix = 0; ix <= 1; ix++) {
      for (let iy = 1; iy <= 3; iy++) {
        targetDim.getBlock({ x: px + ix, y: py + iy, z: pz })?.setPermutation(portalPerm);
      }
    }
    player.teleport({ x: px + 0.5, y: py + 1, z: pz + 0.5 }, { dimension: targetDim });
    system21.runTimeout(() => {
      try {
        world18.tickingAreaManager.removeTickingArea(tickingAreaId);
      } catch (e) {
      }
    }, 100);
  }
};
system21.runInterval(() => {
  for (const player of world18.getAllPlayers()) {
    if (!player.isValid) continue;
    const block = player.dimension.getBlock(player.location);
    if (block && block.typeId === "gaiadimension:gaia_dimension_portal") {
      const lastTeleport = player.getDynamicProperty("last_teleport") ?? 0;
      if (system21.currentTick - lastTeleport < 150) continue;
      player.setDynamicProperty("last_teleport", system21.currentTick);
      const targetDim = DimensionSystem.isInGaia(player) ? "minecraft:overworld" : GAIA_DIMENSION_ID2;
      DimensionSystem.teleport(player, targetDim);
    }
  }
}, 10);

// src/main/bedrock/ts/mixins/LightMixin.ts
var lightBlockPermutation;
system22.run(() => {
  try {
    lightBlockPermutation = BlockPermutation12.resolve("minecraft:light_block", { "minecraft:block_light_level": 15 });
  } catch (e) {
  }
});
function initializeLightMixin() {
  world19.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { block, dimension, player } = event;
    const dimId = dimension.id;
    let stateVal = 0;
    const typeId = block.typeId;
    const isExcluded = typeId === "gaiadimension:glittering_fire" || typeId === "gaiadimension:stairs_collision" || typeId.includes("curtain") || typeId.includes("door") || typeId.includes("fluid") || typeId.includes("liquid") || typeId.includes("water") || typeId.includes("magma") || typeId.includes("muck");
    try {
      const currentState = block.permutation.getState("gaiadimension:perm_dim");
      if (currentState === void 0) return;
      const inGaia = DimensionSystem.isInGaia({
        location: block.location,
        dimension,
        isValid: true
      });
      if (inGaia) {
        stateVal = 0;
      } else if (dimId === "minecraft:overworld" && !inGaia) {
        stateVal = 1;
      } else if (dimId === "minecraft:nether") {
        stateVal = 2;
      }
      if (currentState !== stateVal) {
        const newPerm = block.permutation.withState("gaiadimension:perm_dim", stateVal);
        block.setPermutation(newPerm);
      }
    } catch (e) {
    }
  });
  world19.afterEvents.playerBreakBlock.subscribe((event) => {
  });
}

// src/main/bedrock/ts/systems/scriptevents.ts
import { system as system23, ItemStack as ItemStack12 } from "@minecraft/server";
function initializeScriptEvents() {
  system23.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === "gaiadimension:give_agate_arrow") {
      const arrow = event.sourceEntity;
      if (!arrow) return;
      const { dimension, location } = arrow;
      const players = dimension.getPlayers({
        location,
        maxDistance: 3,
        closest: 1
      });
      if (players.length > 0) {
        const player = players[0];
        const inventory = player.getComponent("minecraft:inventory");
        if (inventory && inventory.container) {
          inventory.container.addItem(new ItemStack12("gaiadimension:agate_arrow", 1));
        }
      }
    }
  });
}

// src/main/bedrock/ts/fluids/fluids.ts
import { world as world21, system as system25, BlockPermutation as BlockPermutation13, ItemStack as ItemStack13, BlockVolume as BlockVolume3, Player as Player18, GameMode as GameMode4 } from "@minecraft/server";

// src/main/bedrock/ts/fluids/lib/FluidTemplate.ts
var FluidTemplate = class {
  static blockResolver;
  static physicsStates = /* @__PURE__ */ new Map();
  /**
   * The amount the level decreases for each horizontal block spread.
   */
  get decayPerBlock() {
    return 1;
  }
  /**
   * How far to search for a slope/hole when spreading horizontally.
   */
  get slopeFindDistance() {
    return 4;
  }
  /**
   * The delay in ticks between each spread operation.
   * Higher values result in slower flow.
   */
  get spreadDelay() {
    return 5;
  }
};

// src/main/bedrock/ts/fluids/lib/utils.ts
function generateFluidIDs(baseName) {
  return [
    baseName,
    baseName + "_down",
    baseName + "1",
    baseName + "2",
    baseName + "3"
  ];
}

// src/main/bedrock/ts/fluids/lib/FogManager.ts
var FogManager = class {
  static pushFog(player, fogId, userFogId) {
    try {
      player.runCommand(`fog @s push "${fogId}" "${userFogId}"`);
    } catch (e) {
    }
  }
  static popFog(player, userFogId) {
    try {
      player.runCommand(`fog @s remove "${userFogId}"`);
    } catch (e) {
    }
  }
};

// src/main/bedrock/ts/fluids/templates/LavaTemplate.ts
import { system as system24 } from "@minecraft/server";
var LavaTemplate = class extends FluidTemplate {
  _ids;
  _idsSet;
  playerState = /* @__PURE__ */ new Map();
  constructor(baseName) {
    super();
    this._ids = generateFluidIDs(baseName);
    this._idsSet = new Set(this._ids);
  }
  get fluidIDs() {
    return this._ids;
  }
  get spreadDelay() {
    return 15;
  }
  get decayPerBlock() {
    return 2;
  }
  get slopeFindDistance() {
    return 2;
  }
  getInteractions() {
    return [
      {
        targetBlock: ["minecraft:water", "minecraft:flowing_water"],
        action: "transformSelf",
        resultBlock: "pu_bn:fragile_magma",
        directions: "adjacent",
        sound: "random.fizz"
      },
      {
        targetBlock: ["minecraft:water", "minecraft:flowing_water"],
        action: "transformTarget",
        resultBlock: "pu_bn:fragile_magma",
        directions: "below",
        sound: "random.fizz"
      },
      {
        targetBlock: ["minecraft:water", "minecraft:flowing_water"],
        action: "transformSelf",
        resultBlock: "pu_bn:fragile_magma",
        directions: "below",
        sound: "random.fizz"
      }
    ];
  }
  onPlayerTick(player, block, isHeadInside, isFeetInside) {
    const prevState = this.playerState.get(player.id) || { head: false };
    let gravityScale = 1;
    let amplifier = 0;
    if (isHeadInside) {
      gravityScale = 0.6;
      amplifier = 2;
    } else if (isFeetInside) {
      const loc = player.location;
      const resolver = FluidTemplate.blockResolver;
      const midBlock = resolver ? resolver(player.dimension, loc.x, loc.y + 0.8, loc.z) : player.dimension.getBlock({ x: loc.x, y: loc.y + 0.8, z: loc.z });
      if (midBlock && this._idsSet.has(midBlock.typeId)) {
        gravityScale = 1;
        amplifier = 1;
      } else {
        gravityScale = 1.6;
        amplifier = 0;
      }
    }
    if (player.isSneaking) {
      gravityScale = Math.max(0.2, gravityScale - 0.4);
      amplifier = Math.min(2, amplifier + 1);
    }
    if (isHeadInside || isFeetInside) {
      FluidTemplate.physicsStates.set(player.id, {
        player,
        drag: 0.5,
        acceleration: 0.02,
        gravityScale,
        canSprint: false
      });
    }
    player.setOnFire(10, true);
    if (system24.currentTick % 20 === 0) {
      player.applyDamage(4, { cause: "lava" });
    }
    const userFogId = "fluid_fog";
    if (isHeadInside) {
      FogManager.pushFog(player, "pu_bn:liquid_magma_fog", userFogId);
    } else if (prevState.head) {
      FogManager.popFog(player, userFogId);
    }
    this.playerState.set(player.id, { head: isHeadInside });
  }
  onEntityTick(entity, block) {
    if (entity.typeId === "minecraft:item") {
      entity.setOnFire(5, true);
      return;
    }
    entity.setOnFire(10, true);
    if (system24.currentTick % 20 === 0) {
      entity.applyDamage(4, { cause: "lava" });
    }
    entity.addEffect("slow_falling", 4, { amplifier: 1, showParticles: false });
  }
  processBoat(boat, dimension, isDeep) {
  }
};

// src/main/bedrock/ts/fluids/templates/WaterTemplate.ts
var WaterTemplate = class extends FluidTemplate {
  _ids;
  _idsSet;
  config;
  playerState = /* @__PURE__ */ new Map();
  constructor(config) {
    super();
    this.config = config;
    this._ids = generateFluidIDs(config.baseName);
    this._idsSet = new Set(this._ids);
  }
  get fluidIDs() {
    return this._ids;
  }
  get spreadDelay() {
    return this.config.spreadDelay ?? 5;
  }
  get decayPerBlock() {
    return this.config.decayPerBlock ?? 1;
  }
  get slopeFindDistance() {
    return this.config.slopeFindDistance ?? 4;
  }
  getInteractions() {
    return this.config.interactions || [];
  }
  onPlayerTick(player, block, isHeadInside, isFeetInside) {
    const prevState = this.playerState.get(player.id) || { head: false, feet: false };
    let gravityScale = 1;
    let amplifier = 0;
    if (this.config.viscosity !== void 0) {
      gravityScale = this.config.viscosity / 2;
      amplifier = 2;
    } else {
      if (isHeadInside) {
        gravityScale = 0.6;
        amplifier = 2;
      } else if (isFeetInside) {
        const loc = player.location;
        const resolver = FluidTemplate.blockResolver;
        const midBlock = resolver ? resolver(player.dimension, loc.x, loc.y + 0.8, loc.z) : player.dimension.getBlock({ x: loc.x, y: loc.y + 0.8, z: loc.z });
        if (midBlock && this._idsSet.has(midBlock.typeId)) {
          gravityScale = 1;
          amplifier = 1;
        } else {
          gravityScale = 1.5;
          amplifier = 0;
        }
      }
      if (player.isSneaking) {
        gravityScale = Math.max(0.2, gravityScale - 0.6);
        amplifier = Math.min(2, amplifier + 1);
      }
    }
    const baseDrag = this.config.stickiness ? Math.max(0.3, 0.8 - this.config.stickiness * 0.1) : 0.8;
    if (isHeadInside || isFeetInside) {
      FluidTemplate.physicsStates.set(player.id, {
        player,
        drag: baseDrag,
        acceleration: 0.02,
        gravityScale,
        canSprint: !this.config.stickiness
      });
    }
    const userFogId = "fluid_fog";
    if (isHeadInside) {
      if (this.config.fogId) {
        FogManager.pushFog(player, this.config.fogId, userFogId);
      }
    } else if (prevState.head) {
      FogManager.popFog(player, userFogId);
    }
    if (isHeadInside && !prevState.head) {
      player.playSound("ambient.underwater.enter", { volume: 0.5, pitch: 1 });
      player.playSound("ambient.underwater.loop", { volume: 1, pitch: 1 });
    } else if (!isHeadInside && prevState.head) {
      player.playSound("ambient.underwater.exit", { volume: 0.5, pitch: 1 });
      player.runCommand("stopsound @s ambient.underwater.loop");
    }
    this.playerState.set(player.id, { head: isHeadInside, feet: isFeetInside });
  }
  processBoat(boat, dimension, isDeep) {
    if (!this.config.hasBoatPhysics) return;
    if (isDeep) {
      boat.applyImpulse({ x: 0, y: 0.2, z: 0 });
    }
    const rotation = boat.getRotation().y;
    const dirX = -Math.sin(rotation * (Math.PI / 180));
    const dirZ = Math.cos(rotation * (Math.PI / 180));
    const vel = boat.getVelocity();
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed > 0.01) {
      boat.applyImpulse({ x: dirX * 0.15, y: 0, z: dirZ * 0.15 });
    }
    this.manageBoatHolder(boat, dimension);
  }
  manageBoatHolder(boat, dimension) {
    const location = boat.location;
    const holders = dimension.getEntities({
      type: "pu_bn:boat_holder",
      location,
      maxDistance: 2
    });
    let holder = holders.length > 0 ? holders[0] : null;
    let waterTopY = Math.floor(location.y) + 1;
    const targetHolderY = waterTopY - 0.55;
    if (!holder) {
      holder = dimension.spawnEntity("pu_bn:boat_holder", { x: location.x, y: targetHolderY, z: location.z });
    }
    if (holder && holder.isValid) {
      try {
        holder.teleport(
          { x: location.x, y: targetHolderY, z: location.z },
          { dimension, rotation: { x: 0, y: boat.getRotation().y } }
        );
      } catch {
      }
    }
  }
};

// src/main/bedrock/ts/fluids/EntityEffects.ts
var ENTITY_EFFECT_QUERY_RADIUS = 32;
var ENTITY_EFFECT_CLUSTER_JOIN_RADIUS = 32;
var ENTITY_EFFECT_CLUSTER_FETCH_RADIUS = ENTITY_EFFECT_QUERY_RADIUS + ENTITY_EFFECT_CLUSTER_JOIN_RADIUS;
var distanceSquared = (left, right) => {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
};
var buildEntityEffectClusters = (players) => {
  const clusters = [];
  const maxJoinDistanceSquared = ENTITY_EFFECT_CLUSTER_JOIN_RADIUS * ENTITY_EFFECT_CLUSTER_JOIN_RADIUS;
  for (const player of players) {
    if (!player?.isValid) continue;
    let matchedCluster;
    for (const cluster of clusters) {
      if (cluster.dimensionId !== player.dimension.id) continue;
      if (distanceSquared(cluster.anchor, player.location) > maxJoinDistanceSquared) continue;
      matchedCluster = cluster;
      break;
    }
    if (!matchedCluster) {
      clusters.push({
        dimensionId: player.dimension.id,
        dimension: player.dimension,
        anchor: { ...player.location }
      });
    }
  }
  return clusters;
};
function runEntityEffects(idToTemplate2, fluidIDs2, players) {
  if (players.length === 0) return;
  const entitiesToProcess = /* @__PURE__ */ new Set();
  for (const cluster of buildEntityEffectClusters(players)) {
    const entities = cluster.dimension.getEntities({
      location: cluster.anchor,
      maxDistance: ENTITY_EFFECT_CLUSTER_FETCH_RADIUS,
      excludeFamilies: ["inanimate"]
    });
    for (const entity of entities) {
      if (entity.typeId === "minecraft:player") continue;
      entitiesToProcess.add(entity);
    }
  }
  for (const entity of entitiesToProcess) {
    try {
      const dimension = entity.dimension;
      const location = entity.location;
      const blockAt = dimension.getBlock(location);
      const blockTypeId = blockAt?.typeId;
      if (blockAt && blockTypeId && fluidIDs2.has(blockTypeId)) {
        const template = idToTemplate2.get(blockTypeId);
        if (template && template.onEntityTick) {
          template.onEntityTick(entity, blockAt);
        }
      }
    } catch (e) {
    }
  }
}

// src/main/bedrock/ts/utils/MotionEngine.ts
import { InputButton, ButtonState } from "@minecraft/server";
var DEG2RAD = Math.PI / 180;
var FLUID_GRAVITY = 0.02;
var SWIM_UP_FORCE = 0.04;
var DEADZONE = 3e-3;
var MAX_H_SPEED = 0.45;
var MAX_H_SPEED_SPRINT = 0.6;
var MAX_V_SPEED = 2;
var MotionEngine = class {
  /**
   * Java-parity fluid physics tick.
   *
   * @param player         Target player
   * @param drag           Per-tick XZ velocity multiplier — Java: 0.8 (water), 0.5 (lava)
   * @param acceleration   Per-tick input acceleration — Java: 0.02
   * @param gravityScale   Multiplier on FLUID_GRAVITY (0.02). 1.0 = vanilla water/lava
   * @param canSprint      Whether sprinting boosts drag (Java: true for water, false for lava)
   */
  static tickPlayer(player, drag = 0.8, acceleration = 0.02, gravityScale = 1, canSprint = true) {
    const p = player;
    if (player.isFlying || player.isGliding) {
      p._fluidVX = void 0;
      p._fluidVZ = void 0;
      p._fluidVY = void 0;
      p._lastSmoothImpX = void 0;
      p._lastSmoothImpZ = void 0;
      p._lastSmoothImpY = void 0;
      p._smoothDirX = void 0;
      p._smoothDirZ = void 0;
      p._walkExcessX = 0;
      p._walkExcessZ = 0;
      return;
    }
    if (p._fluidVX === void 0) {
      const v = player.getVelocity();
      p._fluidVX = v.x;
      p._fluidVZ = v.z;
      p._fluidVY = v.y;
    }
    let forward = 0;
    let right = 0;
    try {
      const mv = p.inputInfo?.getMovementVector();
      if (mv) {
        forward = mv.y;
        right = -mv.x;
      }
    } catch {
    }
    const yaw = player.getRotation().y * DEG2RAD;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const rawWorldX = right * cosY - forward * sinY;
    const rawWorldZ = forward * cosY + right * sinY;
    const inputLen = Math.sqrt(rawWorldX * rawWorldX + rawWorldZ * rawWorldZ);
    const rawInputMag = Math.min(inputLen, 1);
    const rawNormX = inputLen > 1e-4 ? rawWorldX / inputLen : 0;
    const rawNormZ = inputLen > 1e-4 ? rawWorldZ / inputLen : 0;
    const DIR_LERP = 0.35;
    let normX, normZ, inputMag;
    if (rawInputMag > 0.01) {
      if (p._smoothDirX === void 0) {
        p._smoothDirX = rawNormX * rawInputMag;
        p._smoothDirZ = rawNormZ * rawInputMag;
      } else {
        p._smoothDirX += DIR_LERP * (rawNormX * rawInputMag - p._smoothDirX);
        p._smoothDirZ += DIR_LERP * (rawNormZ * rawInputMag - p._smoothDirZ);
      }
    } else {
      if (p._smoothDirX !== void 0) {
        p._smoothDirX *= 0.7;
        p._smoothDirZ *= 0.7;
        if (p._smoothDirX * p._smoothDirX + p._smoothDirZ * p._smoothDirZ < 1e-4) {
          p._smoothDirX = 0;
          p._smoothDirZ = 0;
        }
      } else {
        p._smoothDirX = 0;
        p._smoothDirZ = 0;
      }
    }
    const smoothLen = Math.sqrt((p._smoothDirX ?? 0) * (p._smoothDirX ?? 0) + (p._smoothDirZ ?? 0) * (p._smoothDirZ ?? 0));
    inputMag = Math.min(smoothLen, 1);
    normX = smoothLen > 1e-4 ? (p._smoothDirX ?? 0) / smoothLen : 0;
    normZ = smoothLen > 1e-4 ? (p._smoothDirZ ?? 0) / smoothLen : 0;
    let effectiveDrag = drag;
    if (canSprint && player.isSprinting && drag >= 0.7) {
      effectiveDrag = Math.min(drag + 0.1, 0.95);
    }
    let swimSpeed = acceleration;
    if (canSprint && player.isSprinting) swimSpeed *= 1.3;
    const speedAmp = (player.getEffect("speed")?.amplifier ?? -1) + 1;
    const slowAmp = (player.getEffect("slowness")?.amplifier ?? -1) + 1;
    swimSpeed *= Math.max(0.1, 1 + (speedAmp - slowAmp) * 0.2);
    let isJumping = false;
    try {
      const jumpState = p.inputInfo?.getButtonState(InputButton.Jump);
      isJumping = jumpState === ButtonState.Pressed;
    } catch {
    }
    if (!isJumping) {
      try {
        isJumping = player.isJumping;
      } catch {
      }
    }
    const onGround = player.isOnGround;
    p._fluidVX = (p._fluidVX ?? 0) + swimSpeed * normX * inputMag;
    p._fluidVZ = (p._fluidVZ ?? 0) + swimSpeed * normZ * inputMag;
    p._fluidVX *= effectiveDrag;
    p._fluidVZ *= effectiveDrag;
    const yDrag = drag >= 0.7 ? 0.8 : drag;
    if (onGround) {
      if ((p._fluidVY ?? 0) < 0) p._fluidVY = 0;
      if ((p._fluidVY ?? 0) > 0) p._fluidVY = (p._fluidVY ?? 0) * yDrag;
      if (isJumping) {
        const targetRise = SWIM_UP_FORCE + effectiveDrag * 0.1;
        p._fluidVY = (p._fluidVY ?? 0) + (targetRise - (p._fluidVY ?? 0)) * 0.4;
      } else if (!player.isSneaking && drag >= 0.7) {
        p._fluidVY = (p._fluidVY ?? 0) + SWIM_UP_FORCE * 0.6;
      }
    } else {
      p._fluidVY = (p._fluidVY ?? 0) * yDrag;
      p._fluidVY -= FLUID_GRAVITY * gravityScale;
      if (isJumping) {
        p._fluidVY += SWIM_UP_FORCE;
      }
      if (player.isSneaking) {
        p._fluidVY -= FLUID_GRAVITY * 0.8;
      }
      if (!isJumping && !player.isSneaking && (p._fluidVY ?? 0) < 0 && (p._fluidVY ?? 0) > -0.15) {
        const buoyancy = drag >= 0.7 ? 0.4 : 0.3;
        p._fluidVY *= buoyancy;
      }
    }
    if (Math.abs(p._fluidVX ?? 0) < DEADZONE && inputMag < 0.01) p._fluidVX = 0;
    if (Math.abs(p._fluidVZ ?? 0) < DEADZONE && inputMag < 0.01) p._fluidVZ = 0;
    if (Math.abs(p._fluidVY ?? 0) < 1e-3 && !isJumping && (onGround || !player.isSneaking)) p._fluidVY = 0;
    p._fluidVY = Math.max(-MAX_V_SPEED, Math.min(MAX_V_SPEED, p._fluidVY ?? 0));
    const maxH = canSprint && player.isSprinting ? MAX_H_SPEED_SPRINT : MAX_H_SPEED;
    const hSpeed = Math.sqrt((p._fluidVX ?? 0) * (p._fluidVX ?? 0) + (p._fluidVZ ?? 0) * (p._fluidVZ ?? 0));
    if (hSpeed > maxH) {
      const scale = maxH / hSpeed;
      p._fluidVX = (p._fluidVX ?? 0) * scale;
      p._fluidVZ = (p._fluidVZ ?? 0) * scale;
    }
    try {
      const headLoc = player.getHeadLocation();
      const hDir = Math.sqrt((p._fluidVX ?? 0) * (p._fluidVX ?? 0) + (p._fluidVZ ?? 0) * (p._fluidVZ ?? 0));
      if (hDir > 0.01) {
        const ray = player.dimension.getBlockFromRay(
          headLoc,
          { x: (p._fluidVX ?? 0) / hDir, y: 0, z: (p._fluidVZ ?? 0) / hDir },
          { maxDistance: 0.45 }
        );
        if (ray && !ray.block.isAir && !ray.block.isLiquid) {
          p._fluidVX = (p._fluidVX ?? 0) * 0.15;
          p._fluidVZ = (p._fluidVZ ?? 0) * 0.15;
          if ((p._fluidVY ?? 0) < 0.08) p._fluidVY = (p._fluidVY ?? 0) + 0.04;
        }
      }
    } catch {
    }
    const walkExX = p._walkExcessX ?? 0;
    const walkExZ = p._walkExcessZ ?? 0;
    let targetImpX = (p._fluidVX ?? 0) - walkExX;
    let targetImpZ = (p._fluidVZ ?? 0) - walkExZ;
    let targetImpY = p._fluidVY ?? 0;
    const IMPULSE_LERP = 0.6;
    if (p._lastSmoothImpX !== void 0) {
      targetImpX = p._lastSmoothImpX + IMPULSE_LERP * (targetImpX - p._lastSmoothImpX);
      targetImpZ = p._lastSmoothImpZ + IMPULSE_LERP * (targetImpZ - p._lastSmoothImpZ);
    }
    p._lastSmoothImpX = targetImpX;
    p._lastSmoothImpZ = targetImpZ;
    const Y_LERP = 0.5;
    if (p._lastSmoothImpY !== void 0) {
      targetImpY = p._lastSmoothImpY + Y_LERP * (targetImpY - p._lastSmoothImpY);
    }
    p._lastSmoothImpY = targetImpY;
    player.clearVelocity();
    player.applyImpulse({
      x: targetImpX,
      y: targetImpY,
      z: targetImpZ
    });
  }
};
var Geo = new class {
  distance(v1, v2) {
    return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2 + (v1.z - v2.z) ** 2);
  }
  getDirection3D(v1, v2) {
    const d = this.distance(v1, v2) || 1;
    return { x: (v2.x - v1.x) / d, y: (v2.y - v1.y) / d, z: (v2.z - v1.z) / d };
  }
  rotate(offset, angle, axis = ["x", "z"]) {
    const [pa, sa] = axis;
    const flat = { [pa]: offset[pa] ?? 0, [sa]: offset[sa] ?? 0 };
    const zero = { x: 0, y: 0, z: 0 };
    const flatVec = sumObjects(zero, flat);
    const dir = this.getDirection3D(zero, flatVec);
    const dist = this.distance(zero, flatVec);
    const paVal = dir[pa] ?? 0;
    const saVal = dir[sa] ?? 0;
    angle += Math.acos(paVal) * 57.2958 * (saVal < 0 ? -1 : 1);
    const d = { [pa]: Math.cos(angle / 57.2958), [sa]: Math.sin(angle / 57.2958) };
    return sumObjects(zero, d, dist);
  }
}();
function sumObjects(v1, v2, multi = 1) {
  return {
    x: (v1.x || 0) + (v2.x || 0) * multi,
    y: (v1.y || 0) + (v2.y || 0) * multi,
    z: (v1.z || 0) + (v2.z || 0) * multi
  };
}

// src/main/bedrock/ts/fluids/fluids.ts
var blockCache = /* @__PURE__ */ new Map();
var playersInFluids = /* @__PURE__ */ new Set();
var typeInfoCache = /* @__PURE__ */ new Map();
var REPLACABLE_IDS = /* @__PURE__ */ new Set([
  "minecraft:snow_layer",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:double_plant",
  "minecraft:tallgrass",
  "minecraft:short_grass",
  "minecraft:deadbush",
  "minecraft:web",
  "minecraft:dandelion",
  "minecraft:oxeye_daisy",
  "minecraft:poppy",
  "minecraft:azure_bluet",
  "minecraft:cornflower"
]);
function getCachedBlock(dimension, x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  if (fy < dimension.heightRange.min || fy > dimension.heightRange.max) return void 0;
  const key = `${dimension.id}:${fx},${fy},${fz}`;
  let blk = blockCache.get(key);
  if (blk !== void 0) return blk;
  blk = dimension.getBlock({ x: fx, y: fy, z: fz });
  blockCache.set(key, blk);
  return blk;
}
function getTypeInfo(typeId) {
  let info = typeInfoCache.get(typeId);
  if (info) return info;
  let currentStage = 0;
  let baseId = typeId;
  if (typeId.endsWith("_down")) {
    currentStage = -1;
    baseId = typeId.replace("_down", "");
  } else {
    const match = typeId.match(/(\d+)$/);
    if (match) {
      currentStage = parseInt(match[1]);
      baseId = typeId.slice(0, -match[1].length);
    } else {
      for (const template of templates) {
        if (typeId === template.baseName) {
          currentStage = 0;
          baseId = typeId;
          break;
        }
      }
    }
  }
  info = { stage: currentStage, baseId };
  typeInfoCache.set(typeId, info);
  return info;
}
var templates = [
  new LavaTemplate("gaiadimension:superhot_magma"),
  new LavaTemplate("gaiadimension:liquid_bismuth"),
  new WaterTemplate({
    baseName: "gaiadimension:liquid_aura",
    fogId: "gaiadimension:liquid_aura_fog",
    interactions: [
      {
        targetBlock: ["gaiadimension:superhot_magma", "gaiadimension:superhot_magma_down", "gaiadimension:superhot_magma1", "gaiadimension:superhot_magma2", "gaiadimension:superhot_magma3", "gaiadimension:superhot_magma4", "gaiadimension:superhot_magma5", "gaiadimension:superhot_magma6", "gaiadimension:superhot_magma7"],
        action: "transformTarget",
        resultBlock: "gaiadimension:aura_crystal_block",
        directions: "adjacent"
      }
    ]
  }),
  new WaterTemplate({
    baseName: "gaiadimension:mineral_water",
    fogId: "gaiadimension:mineral_water_fog",
    hasBoatPhysics: true,
    interactions: [
      {
        targetBlock: ["gaiadimension:superhot_magma", "gaiadimension:superhot_magma_down", "gaiadimension:superhot_magma1", "gaiadimension:superhot_magma2", "gaiadimension:superhot_magma3", "gaiadimension:superhot_magma4", "gaiadimension:superhot_magma5", "gaiadimension:superhot_magma6", "gaiadimension:superhot_magma7"],
        action: "transformTarget",
        resultBlock: "gaiadimension:primal_mass",
        directions: "adjacent"
      }
    ]
  }),
  new WaterTemplate({
    baseName: "gaiadimension:sweet_muck",
    viscosity: 5,
    spreadDelay: 10,
    fogId: "gaiadimension:sweet_muck_fog",
    interactions: [
      {
        targetBlock: ["gaiadimension:superhot_magma", "gaiadimension:superhot_magma_down", "gaiadimension:superhot_magma1", "gaiadimension:superhot_magma2", "gaiadimension:superhot_magma3", "gaiadimension:superhot_magma4", "gaiadimension:superhot_magma5", "gaiadimension:superhot_magma6", "gaiadimension:superhot_magma7"],
        action: "transformTarget",
        resultBlock: "gaiadimension:primal_mass",
        directions: "adjacent"
      }
    ]
  })
];
var fluidIDs = /* @__PURE__ */ new Set();
var idToTemplate = /* @__PURE__ */ new Map();
for (const template of templates) {
  for (const id of template.fluidIDs) {
    fluidIDs.add(id);
    idToTemplate.set(id, template);
  }
}
var BUDGET = 4;
var MAX_QUEUE_SIZE = 1e3;
var playerInteractionDummies = /* @__PURE__ */ new Map();
var PENDING_BLOCKS = /* @__PURE__ */ new Map();
var STABLE_BLOCKS = /* @__PURE__ */ new Set();
var taskIndex = 0;
var DIRECTIONS = [
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 }
];
system25.runInterval(() => {
  blockCache.clear();
  const start = Date.now();
  const players = world21.getAllPlayers();
  const tasks = [
    () => runPlayerEffects(players),
    () => runEntityEffects(idToTemplate, fluidIDs, players),
    () => runBoatLogic(players),
    () => runFluidFlowLogic(start),
    () => runFluidInteractionDummies(players)
  ];
  const priorityTask = taskIndex % tasks.length;
  tasks[priorityTask]();
  for (let i = 0; i < tasks.length; i++) {
    if (i === priorityTask) continue;
    if (Date.now() - start > BUDGET) break;
    tasks[i]();
  }
  taskIndex++;
}, 1);
var _fluidPosTrack = /* @__PURE__ */ new Map();
system25.runInterval(() => {
  for (const state of FluidTemplate.physicsStates.values()) {
    try {
      if (!state.player.isValid) {
        FluidTemplate.physicsStates.delete(state.player.id);
        _fluidPosTrack.delete(state.player.id);
        continue;
      }
      const player = state.player;
      const pos = player.location;
      const pid = player.id;
      const p = player;
      const track = _fluidPosTrack.get(pid);
      if (track) {
        const rawExX = pos.x - track.lx - track.vx;
        const rawExZ = pos.z - track.lz - track.vz;
        const prevExX = p._walkExcessX ?? 0;
        const prevExZ = p._walkExcessZ ?? 0;
        const clampedExX = Math.max(-0.15, Math.min(0.15, rawExX));
        const clampedExZ = Math.max(-0.15, Math.min(0.15, rawExZ));
        p._walkExcessX = prevExX + 0.2 * (clampedExX - prevExX);
        p._walkExcessZ = prevExZ + 0.2 * (clampedExZ - prevExZ);
      } else {
        p._walkExcessX = 0;
        p._walkExcessZ = 0;
      }
      MotionEngine.tickPlayer(
        player,
        state.drag,
        state.acceleration,
        state.gravityScale,
        state.canSprint
      );
      _fluidPosTrack.set(pid, {
        lx: pos.x,
        lz: pos.z,
        vx: p._fluidVX ?? 0,
        vz: p._fluidVZ ?? 0
      });
    } catch {
    }
  }
  for (const pid of _fluidPosTrack.keys()) {
    if (!FluidTemplate.physicsStates.has(pid)) {
      _fluidPosTrack.delete(pid);
    }
  }
});
function runFluidInteractionDummies(players) {
  for (const player of players) {
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory) continue;
    const heldItem = inventory.getItem(player.selectedSlotIndex);
    const isHoldingBucket = heldItem?.typeId === "minecraft:bucket" || heldItem?.typeId.startsWith("gaiadimension:") && heldItem?.typeId.endsWith("_bucket");
    const isHoldingBlock = heldItem && (heldItem.typeId.includes("planks") || heldItem.typeId.includes("log") || heldItem.typeId.includes("stairs") || heldItem.typeId.includes("slab") || heldItem.typeId.includes("fence") || heldItem.typeId.includes("stone") || heldItem.typeId.includes("dirt") || heldItem.typeId.includes("sand") || heldItem.typeId.includes("glass") || heldItem.typeId.includes("cobblestone"));
    if (!isHoldingBucket && !isHoldingBlock) {
      const existing = playerInteractionDummies.get(player.id);
      if (existing) {
        if (existing.isValid) existing.remove();
        playerInteractionDummies.delete(player.id);
      }
      continue;
    }
    const viewVec = player.getViewDirection();
    const headLoc = player.getHeadLocation();
    let targetFluid;
    for (let d = 0.5; d <= 5; d += 0.5) {
      const checkPos = { x: headLoc.x + viewVec.x * d, y: headLoc.y + viewVec.y * d, z: headLoc.z + viewVec.z * d };
      const block = getCachedBlock(player.dimension, checkPos.x, checkPos.y, checkPos.z);
      if (block) {
        if (fluidIDs.has(block.typeId)) {
          targetFluid = block;
          break;
        }
        if (!block.isAir && !isReplaceable(block)) break;
      }
    }
    if (targetFluid) {
      let dummy = playerInteractionDummies.get(player.id);
      const center = targetFluid.center();
      const targetPos = { x: center.x, y: center.y - 0.5, z: center.z };
      if (!dummy || !dummy.isValid) {
        dummy = player.dimension.spawnEntity("gaiadimension:fluid_interaction_dummy", targetPos);
        playerInteractionDummies.set(player.id, dummy);
      } else {
        const distSq2 = Math.pow(dummy.location.x - targetPos.x, 2) + Math.pow(dummy.location.y - targetPos.y, 2) + Math.pow(dummy.location.z - targetPos.z, 2);
        if (distSq2 > 0.01) dummy.teleport(targetPos);
      }
    } else {
      const existing = playerInteractionDummies.get(player.id);
      if (existing) {
        if (existing.isValid) existing.remove();
        playerInteractionDummies.delete(player.id);
      }
    }
  }
}
function runFluidFlowLogic(startTime) {
  if (PENDING_BLOCKS.size === 0) return;
  const currentTick = system25.currentTick;
  const iterator = PENDING_BLOCKS.entries();
  let processedCount = 0;
  const MAX_PER_TICK = 50;
  for (let entry = iterator.next(); !entry.done; entry = iterator.next()) {
    const timeSpent = Date.now() - startTime;
    if (timeSpent > BUDGET && processedCount > 0) break;
    if (processedCount >= MAX_PER_TICK) break;
    const [key, data] = entry.value;
    if (currentTick < data.scheduledTick) continue;
    PENDING_BLOCKS.delete(key);
    try {
      const { block, dimension } = data;
      if (block.isValid) {
        const changed = processFluidBlock(block, dimension);
        if (changed) {
          wakeNeighbors(block.location, dimension);
        } else {
          STABLE_BLOCKS.add(key);
        }
        processedCount++;
      }
    } catch (e) {
    }
  }
}
function runPlayerEffects(players) {
  for (const player of players) {
    try {
      const dim = player.dimension;
      const loc = player.location;
      const blockAt = getCachedBlock(dim, loc.x, loc.y, loc.z);
      const blockHead = getCachedBlock(dim, loc.x, loc.y + 1.63, loc.z);
      let template;
      let isHead = false;
      let isFeet = false;
      if (blockHead && fluidIDs.has(blockHead.typeId)) {
        template = idToTemplate.get(blockHead.typeId);
        isHead = true;
      }
      if (blockAt && fluidIDs.has(blockAt.typeId)) {
        const t = idToTemplate.get(blockAt.typeId);
        if (!template) template = t;
        isFeet = true;
      }
      if (template) {
        playersInFluids.add(player.id);
        template.onPlayerTick(player, blockAt || blockHead, isHead, isFeet);
      } else if (playersInFluids.has(player.id)) {
        player.runCommand("fog @s remove fluid_fog");
        playersInFluids.delete(player.id);
        FluidTemplate.physicsStates.delete(player.id);
        _fluidPosTrack.delete(player.id);
        const p = player;
        p._fluidVX = void 0;
        p._fluidVZ = void 0;
        p._fluidVY = void 0;
        p._lastSmoothImpX = void 0;
        p._lastSmoothImpZ = void 0;
        p._lastSmoothImpY = void 0;
        p._smoothDirX = void 0;
        p._smoothDirZ = void 0;
        p._walkExcessX = 0;
        p._walkExcessZ = 0;
      }
    } catch {
    }
  }
}
function runBoatLogic(players) {
  if (players.length === 0) return;
  const activeDimensions = new Set(players.map((p) => p.dimension));
  for (const dimension of activeDimensions) {
    const boats = dimension.getEntities({ families: ["boat"] });
    for (const boat of boats) {
      if (!boat.isValid) continue;
      const loc = boat.location;
      const blockAt = getCachedBlock(dimension, loc.x, loc.y, loc.z);
      const blockBelow = getCachedBlock(dimension, loc.x, loc.y - 0.1, loc.z);
      let template;
      let isDeep = false;
      if (blockAt && fluidIDs.has(blockAt.typeId)) {
        template = idToTemplate.get(blockAt.typeId);
        isDeep = true;
      } else if (blockBelow && fluidIDs.has(blockBelow.typeId)) {
        template = idToTemplate.get(blockBelow.typeId);
      }
      if (template) template.processBoat(boat, dimension, isDeep);
      else {
        const holders = dimension.getEntities({ type: "gaiadimension:boat_holder", location: loc, maxDistance: 2 });
        for (const h of holders) if (h.isValid) h.remove();
      }
    }
  }
}
function isReplaceable(blk) {
  if (!blk || !blk.isValid) return false;
  if (blk.isAir) return true;
  const id = blk.typeId;
  if (blk.isLiquid || fluidIDs.has(id)) return false;
  if (REPLACABLE_IDS.has(id)) return true;
  if (id.includes("flower") || id.includes("sapling") || id.includes("bush") || id.includes("plant") || id.includes("leaf_litter")) return true;
  const vegetationTags = ["minecraft:is_plant", "flower", "plant", "double_plant", "minecraft:crop"];
  for (const tag2 of vegetationTags) {
    if (blk.hasTag(tag2)) return true;
  }
  return false;
}
function getSlopeDistance(dimension, x, y, z, maxDistance, baseId) {
  const visited = /* @__PURE__ */ new Set();
  const qX = [x], qZ = [z], qD = [0];
  let head = 0, tail = 1;
  const KEY_MUL = 200003;
  visited.add(x * KEY_MUL + z);
  while (head < tail) {
    const cx = qX[head], cz = qZ[head], d = qD[head++];
    if (d >= maxDistance) continue;
    for (const dir of DIRECTIONS) {
      const nx = cx + dir.x, nz = cz + dir.z;
      const key = nx * KEY_MUL + nz;
      if (visited.has(key)) continue;
      visited.add(key);
      const neighbor = getCachedBlock(dimension, nx, y, nz);
      if (!neighbor) continue;
      const isSameFluid = neighbor.typeId.startsWith(baseId);
      if (!isSameFluid && !isReplaceable(neighbor)) continue;
      const below = getCachedBlock(dimension, nx, y - 1, nz);
      if (below && isReplaceable(below)) return d;
      qX[tail] = nx;
      qZ[tail] = nz;
      qD[tail++] = d + 1;
    }
  }
  return 999;
}
function processFluidBlock(block, dimension) {
  const typeId = block.typeId;
  let changesHappened = false;
  const { stage: currentStage, baseId } = getTypeInfo(typeId);
  if (!fluidIDs.has(baseId)) return false;
  const template = idToTemplate.get(baseId);
  if (template) {
    const interactions = template.getInteractions();
    if (interactions.length > 0) {
      const neighbors = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
      for (const rule of interactions) {
        const checkIndices = rule.directions === "below" ? [5] : rule.directions === "all" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
        let triggered = false;
        for (const idx of checkIndices) {
          const off = neighbors[idx];
          const nb = getCachedBlock(dimension, block.x + off.x, block.y + off.y, block.z + off.z);
          if (nb && (Array.isArray(rule.targetBlock) ? rule.targetBlock.includes(nb.typeId) : nb.typeId === rule.targetBlock)) {
            if (rule.action === "transformTarget") {
              dimension.fillBlocks(new BlockVolume3(nb.location, nb.location), rule.resultBlock);
              triggered = true;
            } else if (rule.action === "transformSelf") {
              triggered = true;
              break;
            }
          }
        }
        if (triggered) {
          changesHappened = true;
          if (rule.sound) dimension.playSound(rule.sound, block.location, { volume: 0.5, pitch: 1 });
          if (rule.action === "transformSelf") {
            dimension.fillBlocks(new BlockVolume3(block.location, block.location), rule.resultBlock);
            return true;
          }
        }
      }
    }
  }
  let requiredParentTag = "";
  if (currentStage === 1) requiredParentTag = "template_full";
  else if (currentStage === 2) requiredParentTag = "template1";
  else if (currentStage === 3) requiredParentTag = "template2";
  if (currentStage > 0) {
    const above = getCachedBlock(dimension, block.location.x, block.location.y + 1, block.location.z);
    if (above) {
      const aboveId = above.typeId;
      const isAboveDown = aboveId === baseId + "_down";
      const isAboveHalf = aboveId === baseId + "1" || aboveId === baseId + "2" || aboveId === baseId + "3";
      if (isAboveDown || isAboveHalf) {
        if (block.isValid) {
          dimension.fillBlocks(new BlockVolume3(block.location, block.location), BlockPermutation13.resolve(baseId + "_down"));
          changesHappened = true;
        }
        return changesHappened;
      }
    }
  }
  if (currentStage > 0) {
    let hasParent = false;
    for (const dir of DIRECTIONS) {
      const neighbor = getCachedBlock(dimension, block.location.x + dir.x, block.location.y, block.location.z + dir.z);
      if (neighbor && neighbor.hasTag(requiredParentTag)) {
        hasParent = true;
        break;
      }
    }
    if (!hasParent) {
      if (block.isValid) {
        dimension.fillBlocks(new BlockVolume3(block.location, block.location), "minecraft:air");
        changesHappened = true;
      }
      return changesHappened;
    }
  } else if (currentStage === -1) {
    const above = getCachedBlock(dimension, block.location.x, block.location.y + 1, block.location.z);
    if (!above) {
      if (block.isValid) {
        dimension.fillBlocks(new BlockVolume3(block.location, block.location), "minecraft:air");
        changesHappened = true;
      }
      return changesHappened;
    }
    const aboveId = above.typeId;
    const validAbove = [baseId, baseId + "_down", baseId + "1", baseId + "2", baseId + "3"];
    if (!validAbove.includes(aboveId)) {
      if (block.isValid) {
        dimension.fillBlocks(new BlockVolume3(block.location, block.location), "minecraft:air");
        changesHappened = true;
      }
      return changesHappened;
    }
  }
  if (currentStage <= 0) {
    const states = block.permutation.getAllStates();
    let changedStates = false;
    const neighbors = [
      { x: 1, y: 0, z: 0, state: "gaiadimension:x" },
      { x: -1, y: 0, z: 0, state: "gaiadimension:nx" },
      { x: 0, y: 0, z: 1, state: "gaiadimension:z" },
      { x: 0, y: 0, z: -1, state: "gaiadimension:nz" },
      { x: 0, y: 1, z: 0, state: "gaiadimension:top" },
      { x: 0, y: -1, z: 0, state: "gaiadimension:bottom" }
    ];
    for (const nbDef of neighbors) {
      const nb = getCachedBlock(dimension, block.x + nbDef.x, block.y + nbDef.y, block.z + nbDef.z);
      const isFluid = nb && (nb.typeId.startsWith(baseId) || nb.isLiquid);
      const newState = isFluid ? 1 : 0;
      if (states[nbDef.state] !== newState) {
        states[nbDef.state] = newState;
        changedStates = true;
      }
    }
    if (changedStates) {
      dimension.fillBlocks(new BlockVolume3(block.location, block.location), BlockPermutation13.resolve(block.typeId, states));
    }
  }
  const below = getCachedBlock(dimension, block.location.x, block.location.y - 1, block.location.z);
  let flowedDown = false;
  if (below && isReplaceable(below)) {
    dimension.fillBlocks(new BlockVolume3(below.location, below.location), baseId + "_down");
    flowedDown = true;
    changesHappened = true;
  } else if (below && (below.typeId === baseId + "_down" || below.typeId === baseId)) flowedDown = true;
  const maxStages = 3;
  const canSpread = currentStage === 0 || currentStage === -1 && !flowedDown || currentStage > 0 && !flowedDown && currentStage < maxStages;
  if (canSpread) {
    if (!template) return changesHappened;
    const nextStageNum = currentStage <= 0 ? 1 : currentStage + 1;
    const nextStageId = currentStage === 0 || currentStage === -1 ? baseId + "1" : baseId + (currentStage + 1).toString();
    let anyOverwritable = false;
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      const neighbor = getCachedBlock(dimension, block.location.x + dir.x, block.location.y, block.location.z + dir.z);
      if (neighbor) {
        if (isReplaceable(neighbor)) {
          anyOverwritable = true;
          break;
        }
        if (neighbor.typeId.startsWith(baseId)) {
          const nInfo = getTypeInfo(neighbor.typeId);
          if (nInfo.stage > 0 && nextStageNum < nInfo.stage) {
            anyOverwritable = true;
            break;
          }
        }
      }
    }
    if (anyOverwritable) {
      const maxSearch = template.slopeFindDistance;
      let minDistance = 999;
      const distances = [];
      for (let i = 0; i < DIRECTIONS.length; i++) {
        const dir = DIRECTIONS[i];
        const dist = getSlopeDistance(dimension, block.location.x + dir.x, block.location.y, block.location.z + dir.z, maxSearch, baseId);
        distances[i] = dist;
        if (dist < minDistance) minDistance = dist;
      }
      for (let i = 0; i < DIRECTIONS.length; i++) {
        const dir = DIRECTIONS[i];
        if (minDistance < 999 && distances[i] > minDistance) continue;
        const nx = block.location.x + dir.x, ny = block.location.y, nz = block.location.z + dir.z;
        const neighbor = getCachedBlock(dimension, nx, ny, nz);
        if (neighbor) {
          let canOverwrite = false;
          if (isReplaceable(neighbor)) {
            canOverwrite = true;
          } else if (neighbor.typeId.startsWith(baseId)) {
            const nInfo = getTypeInfo(neighbor.typeId);
            const neighborStage = nInfo.stage;
            if (neighborStage > 0 && nextStageNum < neighborStage) {
              canOverwrite = true;
            }
          }
          if (canOverwrite) {
            if (neighbor.isValid) {
              let dirState = 0;
              if (dir.z === -1) dirState = 1;
              else if (dir.x === 1) dirState = 7;
              else if (dir.z === 1) dirState = 5;
              else if (dir.x === -1) dirState = 3;
              const perm = BlockPermutation13.resolve(nextStageId, { "gaiadimension:flow_dir": dirState });
              dimension.fillBlocks(new BlockVolume3(neighbor.location, neighbor.location), perm);
              PENDING_BLOCKS.set(`${neighbor.location.x},${neighbor.location.y},${neighbor.location.z},${dimension.id}`, { block: neighbor, dimension, scheduledTick: system25.currentTick + (template?.spreadDelay ?? 5) });
              changesHappened = true;
            }
          }
        }
      }
    }
  }
  if (currentStage > 0) {
    let flowX = 0;
    let flowZ = 0;
    for (const dir of DIRECTIONS) {
      const neighbor = getCachedBlock(dimension, block.x + dir.x, block.y, block.z + dir.z);
      if (!neighbor) continue;
      let nLevel = -999;
      if (neighbor.typeId.startsWith(baseId)) {
        const nInfo = getTypeInfo(neighbor.typeId);
        nLevel = nInfo.stage === -1 ? 0 : nInfo.stage;
      } else {
        const below2 = getCachedBlock(dimension, neighbor.x, neighbor.y - 1, neighbor.z);
        if (isReplaceable(neighbor) && below2 && isReplaceable(below2)) {
          nLevel = 99;
        } else {
          continue;
        }
      }
      if (nLevel < currentStage) {
        flowX -= dir.x;
        flowZ -= dir.z;
      } else if (nLevel > currentStage) {
        flowX += dir.x;
        flowZ += dir.z;
      }
    }
    flowX = flowX > 0 ? 1 : flowX < 0 ? -1 : 0;
    flowZ = flowZ > 0 ? 1 : flowZ < 0 ? -1 : 0;
    let dirState;
    if (flowX === 0 && flowZ === 0) {
      dirState = block.permutation.getAllStates()["gaiadimension:flow_dir"] ?? 0;
    } else if (flowX === 0 && flowZ === -1) dirState = 1;
    else if (flowX === -1 && flowZ === -1) dirState = 2;
    else if (flowX === -1 && flowZ === 0) dirState = 3;
    else if (flowX === -1 && flowZ === 1) dirState = 4;
    else if (flowX === 0 && flowZ === 1) dirState = 5;
    else if (flowX === 1 && flowZ === 1) dirState = 6;
    else if (flowX === 1 && flowZ === 0) dirState = 7;
    else if (flowX === 1 && flowZ === -1) dirState = 8;
    else dirState = 0;
    const perms = block.permutation.getAllStates();
    if (perms["gaiadimension:flow_dir"] !== dirState) {
      perms["gaiadimension:flow_dir"] = dirState;
      dimension.fillBlocks(new BlockVolume3(block.location, block.location), BlockPermutation13.resolve(typeId, perms));
      changesHappened = true;
    }
  }
  return changesHappened;
}
var FluidFlowComponent = class {
  constructor() {
    this.onTick = this.onTick.bind(this);
    this.onPlayerDestroy = this.onPlayerDestroy.bind(this);
  }
  onPlayerDestroy(event) {
    wakeNeighbors(event.block.location, event.dimension);
  }
  onTick(event) {
    if (PENDING_BLOCKS.size >= MAX_QUEUE_SIZE) return;
    const { block } = event;
    const key = `${block.x},${block.y},${block.z},${block.dimension.id}`;
    if (STABLE_BLOCKS.has(key)) return;
    if (!PENDING_BLOCKS.has(key)) {
      let delay = 5;
      const info = getTypeInfo(block.typeId);
      const template = idToTemplate.get(info.baseId);
      if (template) delay = template.spreadDelay;
      PENDING_BLOCKS.set(key, { block, dimension: block.dimension, scheduledTick: system25.currentTick + delay });
    }
  }
};
function wakeNeighbors(location, dimension) {
  const { x, y, z } = location;
  const centerBlock = getCachedBlock(dimension, x, y, z);
  if (!centerBlock) return;
  let delay = 5;
  const info = getTypeInfo(centerBlock.typeId);
  const template = idToTemplate.get(info.baseId);
  if (template) delay = template.spreadDelay;
  const locations = [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }];
  const scheduledTick = system25.currentTick + delay;
  for (const offset of locations) {
    const nx = x + offset.x, ny = y + offset.y, nz = z + offset.z;
    const key = `${nx},${ny},${nz},${dimension.id}`;
    STABLE_BLOCKS.delete(key);
    if (!PENDING_BLOCKS.has(key)) {
      const neighbor = getCachedBlock(dimension, nx, ny, nz);
      if (neighbor && neighbor.isValid && fluidIDs.has(neighbor.typeId)) PENDING_BLOCKS.set(key, { block: neighbor, dimension, scheduledTick });
    }
  }
}
world21.afterEvents.playerPlaceBlock.subscribe((e) => wakeNeighbors(e.block.location, e.block.dimension));
world21.afterEvents.playerBreakBlock.subscribe((e) => wakeNeighbors(e.block.location, e.block.dimension));
world21.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack } = event;
  if (!itemStack || !itemStack.typeId.startsWith("gaiadimension:") || !itemStack.typeId.endsWith("_bucket")) return;
  const fluidId = itemStack.typeId.replace("_bucket", "");
  const isFlowingVariant = (blk) => blk.typeId.startsWith(fluidId) && (blk.typeId.endsWith("_down") || /\d+$/.test(blk.typeId));
  if (isFlowingVariant(block)) {
    event.cancel = true;
    system25.run(() => {
      if (block.isValid) {
        block.setPermutation(BlockPermutation13.resolve(fluidId));
        wakeNeighbors(block.location, block.dimension);
        const isHot = fluidId.includes("magma") || fluidId.includes("bismuth");
        player.playSound(isHot ? "bucket.empty_lava" : "bucket.empty_water", { pitch: 1, volume: 1 });
        if (player.getGameMode() !== GameMode4.Creative) {
          const container = player.getComponent("inventory")?.container;
          if (container) {
            const slot = player.selectedSlotIndex;
            const currentItem = container.getItem(slot);
            if (currentItem && currentItem.typeId === itemStack.typeId) {
              if (currentItem.amount > 1) {
                currentItem.amount--;
                container.setItem(slot, currentItem);
                const emptyBucket = new ItemStack13("minecraft:bucket", 1);
                const remainder = container.addItem(emptyBucket);
                if (remainder) player.dimension.spawnItem(remainder, player.location);
              } else container.setItem(slot, new ItemStack13("minecraft:bucket", 1));
            }
          }
        }
      }
    });
    return;
  }
});
world21.afterEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target, itemStack } = event;
  if (target.typeId !== "gaiadimension:fluid_interaction_dummy" || !(player instanceof Player18)) return;
  const dimension = player.dimension;
  const location = { x: Math.floor(target.location.x), y: Math.floor(target.location.y), z: Math.floor(target.location.z) };
  const fluidBlock = getCachedBlock(dimension, location.x, location.y, location.z);
  if (!fluidBlock || !fluidIDs.has(fluidBlock.typeId)) return;
  if (itemStack?.typeId === "minecraft:bucket") {
    const info = getTypeInfo(fluidBlock.typeId);
    if (info.stage === 0) {
      const bucketId = info.baseId + "_bucket", filledBucket = new ItemStack13(bucketId, 1);
      const inventory = player.getComponent("inventory")?.container;
      if (inventory) {
        const slot = player.selectedSlotIndex;
        if (itemStack.amount > 1) {
          itemStack.amount--;
          inventory.setItem(slot, itemStack);
          const remainder = inventory.addItem(filledBucket);
          if (remainder) dimension.spawnItem(remainder, player.location);
        } else inventory.setItem(slot, filledBucket);
      }
      const isHot = fluidBlock.typeId.includes("magma") || fluidBlock.typeId.includes("bismuth");
      dimension.playSound(isHot ? "bucket.fill_lava" : "bucket.fill_water", location);
      dimension.fillBlocks(new BlockVolume3(location, location), "minecraft:air");
      wakeNeighbors(location, dimension);
    }
    return;
  }
  if (itemStack) {
    const fluidId = itemStack.typeId.replace("_bucket", "");
    if (fluidIDs.has(fluidId)) {
      const viewVec = player.getViewDirection();
      const absX = Math.abs(viewVec.x), absY = Math.abs(viewVec.y), absZ = Math.abs(viewVec.z);
      let offset = { x: 0, y: 0, z: 0 };
      if (absY > absX && absY > absZ) offset.y = viewVec.y > 0 ? 1 : -1;
      else if (absX > absZ) offset.x = viewVec.x > 0 ? 1 : -1;
      else offset.z = viewVec.z > 0 ? 1 : -1;
      const placeLoc = { x: location.x + offset.x, y: location.y + offset.y, z: location.z + offset.z };
      const targetBlock = dimension.getBlock(placeLoc);
      if (targetBlock && (targetBlock.isAir || isReplaceable(targetBlock))) {
        dimension.fillBlocks(new BlockVolume3(placeLoc, placeLoc), fluidId);
        wakeNeighbors(placeLoc, dimension);
        const isHot = fluidId.includes("magma") || fluidId.includes("bismuth");
        player.playSound(isHot ? "bucket.empty_lava" : "bucket.empty_water");
        if (player.getGameMode() !== GameMode4.Creative) {
          const inventory = player.getComponent("inventory")?.container;
          if (inventory) {
            const slot = player.selectedSlotIndex;
            if (itemStack.amount > 1) {
              itemStack.amount--;
              inventory.setItem(slot, itemStack);
              const emptyBucket = new ItemStack13("minecraft:bucket", 1);
              const remainder = inventory.addItem(emptyBucket);
              if (remainder) dimension.spawnItem(remainder, player.location);
            } else inventory.setItem(slot, new ItemStack13("minecraft:bucket", 1));
          }
        }
      }
    } else {
      try {
        const perm = BlockPermutation13.resolve(itemStack.typeId);
        if (perm) {
          dimension.fillBlocks(new BlockVolume3(location, location), perm);
          player.playSound("stone.dig", { location });
          if (player.getGameMode() !== GameMode4.Creative) {
            const inventory = player.getComponent("inventory")?.container;
            if (inventory) {
              const slot = player.selectedSlotIndex;
              if (itemStack.amount > 1) {
                itemStack.amount--;
                inventory.setItem(slot, itemStack);
              } else inventory.setItem(slot, void 0);
            }
          }
          wakeNeighbors(location, dimension);
        }
      } catch {
      }
    }
  }
});
system25.runInterval(() => {
  for (const player of world21.getAllPlayers()) {
    const container = player.getComponent("inventory")?.container;
    if (!container) continue;
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      if (item.typeId === "gaiadimension:tar_cauldron") {
        try {
          container.setItem(i, new ItemStack13("minecraft:cauldron", item.amount));
        } catch (e) {
        }
        continue;
      }
      if (fluidIDs.has(item.typeId)) {
        let baseId = item.typeId;
        if (baseId.endsWith("_down")) baseId = baseId.slice(0, -5);
        else {
          const m = baseId.match(/(\d+)$/);
          if (m) baseId = baseId.slice(0, -m[1].length);
        }
        try {
          container.setItem(i, new ItemStack13(baseId + "_bucket", item.amount));
        } catch (e) {
        }
      }
    }
  }
}, 80);
function registerFluidComponent({ blockComponentRegistry }) {
  blockComponentRegistry.registerCustomComponent("gaiadimension:fluid_flow", new FluidFlowComponent());
}

// src/main/bedrock/ts/durability.ts
import {
  system as system26,
  EquipmentSlot as EquipmentSlot4
} from "@minecraft/server";
function registerCustomTool() {
  system26.beforeEvents.startup.subscribe((event) => {
    event.itemComponentRegistry.registerCustomComponent("luminiae:durability", {
      onUseOn(e, params) {
        const { source, itemStack, block } = e;
        if (!source || !itemStack || !block) return;
        if (!itemStack.hasTag("minecraft:is_axe")) return;
        const typeId = block.typeId;
        const isWood = typeId.includes("wood") || typeId.includes("log") || typeId.includes("hyphae") || typeId.includes("minecraft:");
        if (!isWood) return;
        source.playSound("use.wood", { location: block.location });
        if (source.getGameMode() === "creative") return;
        const stripDamage = params.stripDamage !== void 0 ? params.stripDamage : 1;
        applyCustomDamage(source, itemStack, stripDamage);
      },
      onMineBlock(e, params) {
        const { source, itemStack } = e;
        if (!source || !itemStack) return;
        if (source.getGameMode() === "creative") return;
        const mineDamage = params.mineDamage !== void 0 ? params.mineDamage : 1;
        applyCustomDamage(source, itemStack, mineDamage);
      }
    });
  });
}
function applyCustomDamage(player, itemStack, damageAmount) {
  const durability = itemStack.getComponent("minecraft:durability");
  if (!durability) return;
  const enchantable = itemStack.getComponent("minecraft:enchantable");
  const unbreakingLevel = enchantable ? enchantable.getEnchantment("unbreaking")?.level ?? 0 : 0;
  const chance = 1 / (unbreakingLevel + 1);
  if (Math.random() > chance) return;
  const equippable = player.getComponent("minecraft:equippable");
  if (!equippable) return;
  const newDamage = durability.damage + damageAmount;
  if (newDamage >= durability.maxDurability) {
    equippable.setEquipment(EquipmentSlot4.Mainhand, void 0);
    player.playSound("random.break", { location: player.location });
  } else {
    durability.damage = newDamage;
    equippable.setEquipment(EquipmentSlot4.Mainhand, itemStack);
  }
}

// src/main/bedrock/ts/systems/Commands.ts
import {
  Player as Player20,
  system as system27,
  CommandPermissionLevel,
  CustomCommandParamType
} from "@minecraft/server";
import { ModalFormData as ModalFormData2 } from "@minecraft/server-ui";

// src/main/bedrock/ts/Vec3.ts
var Vec3 = class {
  /**
   * Returns a zero vector (0, 0, 0).
   */
  static get zero() {
    return { x: 0, y: 0, z: 0 };
  }
  /**
   * Adds two vectors together.
   * @param v1 The first vector.
   * @param v2 The second vector.
   * @returns A new vector that is the sum of v1 and v2.
   */
  static add(v1, v2) {
    return { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
  }
  /**
   * Subtracts the second vector from the first.
   * @param v1 The first vector.
   * @param v2 The second vector.
   * @returns A new vector that is the difference of v1 and v2.
   */
  static subtract(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
  }
  /**
   * Multiplies a vector by a scalar.
   * @param v The vector to multiply.
   * @param scale The scalar to multiply by.
   * @returns A new scaled vector.
   */
  static multiply(v, scale) {
    return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
  }
  /**
   * Divides a vector by a scalar. Returns zero vector if scale is 0.
   * @param v The vector to divide.
   * @param scale The scalar to divide by.
   * @returns A new divided vector.
   */
  static divide(v, scale) {
    if (scale === 0) return this.zero;
    return { x: v.x / scale, y: v.y / scale, z: v.z / scale };
  }
  /**
   * Calculates the dot product of two vectors.
   */
  static dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  }
  /**
   * Calculates the cross product of two vectors.
   */
  static cross(v1, v2) {
    return {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x
    };
  }
  /**
   * Calculates the magnitude (length) of a vector.
   */
  static magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  /**
   * Returns a normalized version of the vector (magnitude of 1).
   * Returns zero vector if original magnitude is 0.
   */
  static normalize(v) {
    const mag = this.magnitude(v);
    if (mag === 0) return this.zero;
    return this.divide(v, mag);
  }
  /**
   * Calculates the distance between two vectors.
   */
  static distance(v1, v2) {
    return this.magnitude(this.subtract(v1, v2));
  }
  /**
   * Linearly interpolates between two vectors.
   * @param v1 Start vector.
   * @param v2 End vector.
   * @param t Interpolation factor (0.0 to 1.0).
   */
  static lerp(v1, v2, t) {
    return this.add(v1, this.multiply(this.subtract(v2, v1), t));
  }
  /**
   * Applies Math.floor to each component of the vector.
   */
  static floor(v) {
    return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
  }
  /**
   * Applies Math.ceil to each component of the vector.
   */
  static ceil(v) {
    return { x: Math.ceil(v.x), y: Math.ceil(v.y), z: Math.ceil(v.z) };
  }
  /**
   * Applies Math.round to each component of the vector.
   */
  static round(v) {
    return { x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z) };
  }
  /**
   * Applies Math.abs to each component of the vector.
   */
  static abs(v) {
    return { x: Math.abs(v.x), y: Math.abs(v.y), z: Math.abs(v.z) };
  }
  /**
   * Returns a vector containing the minimum components of two vectors.
   */
  static min(v1, v2) {
    return { x: Math.min(v1.x, v2.x), y: Math.min(v1.y, v2.y), z: Math.min(v1.z, v2.z) };
  }
  /**
   * Returns a vector containing the maximum components of two vectors.
   */
  static max(v1, v2) {
    return { x: Math.max(v1.x, v2.x), y: Math.max(v1.y, v2.y), z: Math.max(v1.z, v2.z) };
  }
  /**
   * Returns a string representation of the vector.
   */
  static toString(v) {
    return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
  }
};

// src/main/bedrock/ts/systems/MathParser.ts
var MathParser = class _MathParser {
  /**
   * Gets the default context with standard math and vector functions.
   * @param extra Optional extra context to merge.
   */
  static getContext(extra = {}) {
    return {
      v: (x, y, z) => ({ x: Number(x), y: Number(y), z: Number(z) }),
      vec3: (x, y, z) => ({ x: Number(x), y: Number(y), z: Number(z) }),
      add: (v1, v2) => Vec3.add(v1, v2),
      sub: (v1, v2) => Vec3.subtract(v1, v2),
      mul: (v, s) => typeof v === "number" ? v * s : Vec3.multiply(v, s),
      div: (v, s) => typeof v === "number" ? v / s : Vec3.divide(v, s),
      dot: (v1, v2) => Vec3.dot(v1, v2),
      cross: (v1, v2) => Vec3.cross(v1, v2),
      mag: (v) => Vec3.magnitude(v),
      magnitude: (v) => Vec3.magnitude(v),
      norm: (v) => Vec3.normalize(v),
      normalize: (v) => Vec3.normalize(v),
      dist: (v1, v2) => Vec3.distance(v1, v2),
      distance: (v1, v2) => Vec3.distance(v1, v2),
      lerp: (v1, v2, t) => Vec3.lerp(v1, v2, t),
      floor: (v) => typeof v === "number" ? Math.floor(v) : Vec3.floor(v),
      ceil: (v) => typeof v === "number" ? Math.ceil(v) : Vec3.ceil(v),
      round: (v) => typeof v === "number" ? Math.round(v) : Vec3.round(v),
      abs: (v) => typeof v === "number" ? Math.abs(v) : Vec3.abs(v),
      min: (a, b) => typeof a === "number" ? Math.min(a, b) : Vec3.min(a, b),
      max: (a, b) => typeof a === "number" ? Math.max(a, b) : Vec3.max(a, b),
      pi: () => Math.PI,
      e: () => Math.E,
      sin: (x) => Math.sin(x),
      cos: (x) => Math.cos(x),
      tan: (x) => Math.tan(x),
      sqrt: (x) => Math.sqrt(x),
      pow: (x, y) => Math.pow(x, y),
      log: (x) => Math.log(x),
      log10: (x) => Math.log10(x),
      random: () => Math.random(),
      // Simple linear solver: ax + b = 0 => x = -b/a
      solve_linear: (a, b) => -b / a,
      // Quadratic solver: ax^2 + bx + c = 0
      solve_quadratic: (a, b, c) => {
        const d = b * b - 4 * a * c;
        if (d < 0) return "No real roots";
        if (d === 0) return [-b / (2 * a)];
        return [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)];
      },
      // Universal numerical solver using Secant method for f(x) = 0
      solve: (exprStr, guess1 = 0, guess2 = 1) => {
        if (typeof exprStr !== "string") return "Error: solve() requires a string expression (e.g., 'x^2 - 4'). Use single quotes.";
        let finalExpr = exprStr;
        if (exprStr.includes("=") && !exprStr.includes("<=") && !exprStr.includes(">=") && !exprStr.includes("==")) {
          const parts = exprStr.split("=");
          finalExpr = `${parts[0]} - (${parts[1]})`;
        }
        let x0 = Number(guess1);
        let x1 = Number(guess2);
        let f0 = _MathParser.evaluate(finalExpr, { ...extra, x: x0 });
        let f1 = _MathParser.evaluate(finalExpr, { ...extra, x: x1 });
        for (let i = 0; i < 100; i++) {
          if (Math.abs(f1) < 1e-10) return x1;
          if (Math.abs(f1 - f0) < 1e-15) break;
          let x2 = x1 - f1 * ((x1 - x0) / (f1 - f0));
          x0 = x1;
          f0 = f1;
          x1 = x2;
          f1 = _MathParser.evaluate(finalExpr, { ...extra, x: x1 });
        }
        return Math.abs(f1) < 1e-5 ? x1 : "No real solution found near guesses";
      },
      ...extra
    };
  }
  /**
   * Evaluates a mathematical expression and returns the result.
   * @param expression The expression string to evaluate.
   * @param extra Optional extra context variables or functions.
   */
  static evaluate(expression, extra = {}) {
    const tokens = this.tokenize(expression);
    const context = this.getContext(extra);
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];
    const parsePrimary = () => {
      let token = consume();
      if (!token) throw new Error("Unexpected end of expression");
      if (token === "-") {
        const val = parsePrimary();
        return typeof val === "number" ? -val : Vec3.multiply(val, -1);
      }
      if (token === "(") {
        const val = parseExpr();
        if (consume() !== ")") throw new Error("Expected ')'");
        return val;
      }
      if (token.startsWith("'") || token.startsWith('"')) {
        return token.slice(1, -1);
      }
      if (!isNaN(Number(token))) return Number(token);
      const lowerToken = token.toLowerCase();
      if (lowerToken === "x" && extra.x !== void 0) {
        return extra.x;
      }
      if (context[lowerToken] !== void 0) {
        let current = context[lowerToken];
        while (peek() === ".") {
          consume();
          const prop = consume();
          if (!prop) throw new Error("Expected property name after '.'");
          current = current[prop];
        }
        if (typeof current === "function") {
          if (peek() === "(") {
            consume();
            const args = [];
            if (peek() !== ")") {
              args.push(parseExpr());
              while (peek() === ",") {
                consume();
                args.push(parseExpr());
              }
            }
            if (consume() !== ")") throw new Error(`Expected ')' after arguments for ${token}`);
            return current(...args);
          } else {
            try {
              return current();
            } catch (e) {
              return current;
            }
          }
        } else {
          return current;
        }
      }
      if (extra[lowerToken] !== void 0) {
        let current = extra[lowerToken];
        while (peek() === ".") {
          consume();
          const prop = consume();
          if (!prop) throw new Error("Expected property name after '.'");
          current = current[prop];
        }
        return current;
      }
      throw new Error(`Unexpected token: '${token}'`);
    };
    const parsePower = () => {
      let left = parsePrimary();
      while (peek() === "^") {
        consume();
        const right = parsePrimary();
        left = Math.pow(left, right);
      }
      return left;
    };
    const parseImplicitMul = () => {
      let left = parsePower();
      while (peek() && !["+", "-", "*", "/", "^", ",", ")", "<", ">", "=", "<=", ">="].includes(peek())) {
        const right = parsePower();
        left = typeof left === "number" && typeof right === "number" ? left * right : typeof left === "object" ? Vec3.multiply(left, right) : Vec3.multiply(right, left);
      }
      return left;
    };
    const parseMulDiv = () => {
      let left = parseImplicitMul();
      while (peek() === "*" || peek() === "/") {
        const op = consume();
        const right = parseImplicitMul();
        if (op === "*") {
          left = typeof left === "number" && typeof right === "number" ? left * right : typeof left === "object" ? Vec3.multiply(left, right) : Vec3.multiply(right, left);
        } else {
          left = typeof left === "number" ? left / right : Vec3.divide(left, right);
        }
      }
      return left;
    };
    const parseAddSub = () => {
      let left = parseMulDiv();
      while (peek() === "+" || peek() === "-") {
        const op = consume();
        const right = parseMulDiv();
        if (op === "+") {
          left = typeof left === "number" && typeof right === "number" ? left + right : Vec3.add(left, right);
        } else {
          left = typeof left === "number" && typeof right === "number" ? left - right : Vec3.subtract(left, right);
        }
      }
      return left;
    };
    const parseComparison = () => {
      let left = parseAddSub();
      while (peek() === "<" || peek() === ">" || peek() === "=" || peek() === "<=" || peek() === ">=") {
        const op = consume();
        const right = parseAddSub();
        if (op === "<") left = left < right;
        else if (op === ">") left = left > right;
        else if (op === "=") left = left == right;
        else if (op === "<=") left = left <= right;
        else if (op === ">=") left = left >= right;
      }
      return left;
    };
    const parseExpr = () => parseComparison();
    const result = parseExpr();
    if (pos < tokens.length) throw new Error(`Unexpected extra tokens starting at '${tokens[pos]}'`);
    return result;
  }
  /**
   * Tokenizes an expression string into an array of tokens.
   * @param str The expression string to tokenize.
   */
  static tokenize(str) {
    const regex = /"[^"]*"|'[^']*'|[a-zA-Z_]+|[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?|\.|\(|\)|,|\+|\-|\*|\/|\^|\<=|\>=|\<|\>|\=/gi;
    return str.match(regex) || [];
  }
};

// src/main/bedrock/ts/systems/Commands.ts
function registerGaiaCommands(registry) {
  registry.registerCommand({
    name: "gaiadimension:math",
    description: "Evaluates a mathematical expression with Vec3 and Math support.",
    permissionLevel: CommandPermissionLevel.Any,
    optionalParameters: [
      { name: "p1", type: CustomCommandParamType.String },
      { name: "p2", type: CustomCommandParamType.String },
      { name: "p3", type: CustomCommandParamType.String },
      { name: "p4", type: CustomCommandParamType.String },
      { name: "p5", type: CustomCommandParamType.String },
      { name: "p6", type: CustomCommandParamType.String },
      { name: "p7", type: CustomCommandParamType.String },
      { name: "p8", type: CustomCommandParamType.String }
    ]
  }, (origin, p1, p2, p3, p4, p5, p6, p7, p8) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      try {
        const expression = [p1, p2, p3, p4, p5, p6, p7, p8].filter((p) => p !== void 0).join(" ");
        if (!expression) {
          player.sendMessage("\xA7cUsage: /gaiadimension:math <expression>");
          return;
        }
        const pos = { x: player.location.x, y: player.location.y, z: player.location.z };
        const view = player.getViewDirection();
        const rot = player.getRotation();
        const contextExtra = {
          pos,
          view,
          rot,
          self: player,
          lp: pos,
          lx: pos.x,
          ly: pos.y,
          lz: pos.z,
          vx: view.x,
          vy: view.y,
          vz: view.z,
          rx: rot.x,
          ry: rot.y
        };
        const result = MathParser.evaluate(expression, contextExtra);
        let output = "";
        if (typeof result === "object" && result !== null) {
          if ("x" in result && "y" in result && "z" in result) {
            output = Vec3.toString(result);
          } else {
            output = JSON.stringify(result);
          }
        } else {
          output = String(result);
        }
        player.sendMessage(`\xA78[\xA76Math\xA78] \xA7f${expression} \xA77= \xA7a${output}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        player.sendMessage(`\xA78[\xA76Math\xA78] \xA7cError: ${message}`);
      }
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:tpmath",
    description: "Calculates a location and teleports you there.",
    permissionLevel: CommandPermissionLevel.Any,
    optionalParameters: [
      { name: "p1", type: CustomCommandParamType.String },
      { name: "p2", type: CustomCommandParamType.String },
      { name: "p3", type: CustomCommandParamType.String },
      { name: "p4", type: CustomCommandParamType.String },
      { name: "p5", type: CustomCommandParamType.String },
      { name: "p6", type: CustomCommandParamType.String },
      { name: "p7", type: CustomCommandParamType.String },
      { name: "p8", type: CustomCommandParamType.String }
    ]
  }, (origin, p1, p2, p3, p4, p5, p6, p7, p8) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      try {
        const expression = [p1, p2, p3, p4, p5, p6, p7, p8].filter((p) => p !== void 0).join(" ");
        if (!expression) {
          player.sendMessage("\xA7cUsage: /gaiadimension:tpmath <expression>");
          return;
        }
        const pos = { x: player.location.x, y: player.location.y, z: player.location.z };
        const view = player.getViewDirection();
        const rot = player.getRotation();
        const contextExtra = {
          pos,
          view,
          rot,
          self: player,
          lp: pos,
          lx: pos.x,
          ly: pos.y,
          lz: pos.z,
          vx: view.x,
          vy: view.y,
          vz: view.z,
          rx: rot.x,
          ry: rot.y
        };
        const result = MathParser.evaluate(expression, contextExtra);
        if (typeof result === "object" && result !== null && "x" in result && "y" in result && "z" in result) {
          player.teleport(result);
          player.sendMessage(`\xA78[\xA76TPMath\xA78] \xA77Teleported to \xA7a${Vec3.toString(result)}`);
        } else {
          player.sendMessage("\xA7cError: The expression must result in a Vector3.");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        player.sendMessage(`\xA78[\xA76TPMath\xA78] \xA7cError: ${message}`);
      }
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:data",
    description: "Allows you to get, merge, modify, and remove data from block entities and entities.",
    permissionLevel: CommandPermissionLevel.GameDirectors,
    optionalParameters: [
      { name: "op", type: CustomCommandParamType.String },
      { name: "target", type: CustomCommandParamType.String },
      { name: "path", type: CustomCommandParamType.String },
      { name: "v1", type: CustomCommandParamType.String },
      { name: "v2", type: CustomCommandParamType.String },
      { name: "v3", type: CustomCommandParamType.String },
      { name: "v4", type: CustomCommandParamType.String },
      { name: "v5", type: CustomCommandParamType.String }
    ]
  }, (origin, op, target, path, v1, v2, v3, v4, v5) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      try {
        const operation = op ? op.toLowerCase() : "get";
        const targetType = target ? target.toLowerCase() : "self";
        const getTarget = (type2) => {
          if (type2 === "block") {
            const ray = player.getBlockFromViewDirection({ maxDistance: 10 });
            return ray ? ray.block : null;
          } else if (type2 === "entity") {
            const ray = player.getEntitiesFromViewDirection({ maxDistance: 10 });
            return ray && ray.length > 0 ? ray[0].entity : null;
          } else if (type2 === "self") {
            return player;
          }
          return null;
        };
        let targetObj = getTarget(targetType);
        if (!targetObj) throw new Error(`Target '${targetType}' not found or out of range.`);
        const data = DataSystem.getRoot(targetObj);
        const targetName = targetType === "self" ? player.name : targetType;
        if (operation === "get") {
          const val = DataSystem.getByPath(data, path);
          if (path) {
            player.sendMessage(`${targetName} has the following entity data: ${JSON.stringify(val, null, 2)}`);
          } else {
            player.sendMessage(`${targetName} has the following entity data: ${JSON.stringify(data, null, 2)}`);
          }
        } else if (operation === "merge") {
          const jsonStr = [path, v1, v2, v3, v4, v5].filter((p) => p !== void 0).join(" ");
          const source = JSON.parse(jsonStr);
          DataSystem.deepMerge(data, source);
          DataSystem.saveRoot(targetObj, data);
          player.sendMessage(`Modified entity data of ${targetName}`);
        } else if (operation === "modify") {
          const subOp = v1 ? v1.toLowerCase() : "set";
          const sourceType = v2 ? v2.toLowerCase() : "value";
          let finalVal = void 0;
          if (sourceType === "value") {
            const rawVal = [v3, v4, v5].filter((p) => p !== void 0).join(" ");
            finalVal = rawVal;
            try {
              finalVal = JSON.parse(rawVal);
            } catch (e) {
            }
            if (!isNaN(Number(rawVal)) && rawVal.trim() !== "") finalVal = Number(rawVal);
            if (rawVal === "true") finalVal = true;
            if (rawVal === "false") finalVal = false;
          } else if (sourceType === "from") {
            const fromSourceType = v3 ? v3.toLowerCase() : "self";
            const fromSourcePath = v4;
            const sourceObj = getTarget(fromSourceType);
            if (!sourceObj) throw new Error(`Source '${fromSourceType}' not found.`);
            const sourceData = DataSystem.getRoot(sourceObj);
            finalVal = DataSystem.getByPath(sourceData, fromSourcePath);
          }
          if (subOp === "set") {
            DataSystem.setByPath(data, path, finalVal);
          }
          DataSystem.saveRoot(targetObj, data);
          player.sendMessage(`Modified entity data of ${targetName}`);
        } else if (operation === "remove") {
          if (!path) throw new Error("Path required for remove.");
          DataSystem.setByPath(data, path, void 0);
          DataSystem.saveRoot(targetObj, data);
          player.sendMessage(`Modified entity data of ${targetName}`);
        } else if (operation === "math") {
          const expression = [v1, v2, v3, v4, v5].filter((p) => p !== void 0).join(" ");
          const pos = { x: player.location.x, y: player.location.y, z: player.location.z };
          const view = player.getViewDirection();
          const rot = player.getRotation();
          const contextExtra = {
            pos,
            view,
            rot,
            self: player,
            lp: pos,
            lx: pos.x,
            ly: pos.y,
            lz: pos.z,
            vx: view.x,
            vy: view.y,
            vz: view.z,
            rx: rot.x,
            ry: rot.y,
            ...data
          };
          const result = MathParser.evaluate(expression, contextExtra);
          DataSystem.setByPath(data, path, result);
          DataSystem.saveRoot(targetObj, data);
          player.sendMessage(`Modified entity data of ${targetName}`);
        } else {
          throw new Error("Unknown operation. Use get, merge, modify, remove, or math.");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        player.sendMessage(`\xA7cError: ${message}`);
      }
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:gaiahelp",
    description: "Technical information and lore regarding the Gaia Dimension Bedrock Port.",
    permissionLevel: CommandPermissionLevel.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      player.sendMessage("\xA78\xA7l========================================");
      player.sendMessage("\xA76\xA7lGAIA DIMENSION BEDROCK PORT");
      player.sendMessage("\xA77Basked under an eternal sun, a world preserved in time, a land sprouting with crystals and minerals, the ground seeping a mysterious energy.");
      player.sendMessage("");
      player.sendMessage("\xA7eWelcome to Gaia. Now its on Bedrock.");
      player.sendMessage("\xA7bThis is a Bedrock port of the Java Mod Gaia Dimension.");
      player.sendMessage("\xA78\xA7l========================================");
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:whereami",
    description: "Identify your current dimensional location.",
    permissionLevel: CommandPermissionLevel.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      const inGaia = DimensionSystem.isInGaia(player);
      const dimId = player.dimension.id;
      let dimensionName = "\xA77" + dimId;
      if (dimId === "gaiadimension:gaia_dimension") {
        dimensionName = "\xA76Gaia Dimension 1";
      } else if (dimId.startsWith("gaiadimension:realm_")) {
        const index = parseInt(dimId.replace("gaiadimension:realm_", ""));
        dimensionName = `\xA76Gaia Dimension ${index + 2}`;
      } else if (inGaia) {
        dimensionName = "\xA76Gaia Dimension";
      } else if (dimId === "minecraft:overworld") {
        dimensionName = "\xA7aOverworld";
      } else if (dimId === "minecraft:nether") {
        dimensionName = "\xA7cNether";
      } else if (dimId === "minecraft:the_end") {
        dimensionName = "\xA7dThe End";
      }
      player.sendMessage("\xA78[\xA76Gaia\xA78] \xA77Current Location: " + dimensionName);
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:gaiainfo",
    description: "Display technical status within the Gaia Dimension.",
    permissionLevel: CommandPermissionLevel.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      const inGaia = DimensionSystem.isInGaia(player);
      const dimId = player.dimension.id;
      let dimensionName = "\xA77" + dimId;
      if (dimId === "gaiadimension:gaia_dimension") {
        dimensionName = "\xA76Gaia Dimension 1";
      } else if (dimId.startsWith("gaiadimension:realm_")) {
        const index = parseInt(dimId.replace("gaiadimension:realm_", ""));
        dimensionName = `\xA76Gaia Dimension ${index + 2}`;
      } else if (inGaia) {
        dimensionName = "\xA76Gaia Dimension";
      } else if (dimId === "minecraft:overworld") {
        dimensionName = "\xA7aOverworld";
      } else if (dimId === "minecraft:nether") {
        dimensionName = "\xA7cNether";
      } else if (dimId === "minecraft:the_end") {
        dimensionName = "\xA7dThe End";
      }
      player.sendMessage("\xA78\xA7l========================================");
      player.sendMessage("\xA76\xA7lGAIA STATUS REPORT");
      player.sendMessage("\xA77Location: " + dimensionName);
      player.sendMessage("\xA77Synchronization: " + (inGaia ? "\xA7aStable" : "\xA7cExternal"));
      let coords = player.location;
      if (inGaia) {
        const biome = DimensionSystem.getBiome(player);
        player.sendMessage("\xA77Current Biome: \xA7e" + formatName(biome));
      }
      player.sendMessage("\xA77Coordinates: \xA7f" + Math.floor(coords.x) + ", " + Math.floor(coords.y) + ", " + Math.floor(coords.z));
      player.sendMessage("\xA78\xA7l========================================");
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:androsa",
    description: "The Architect.",
    permissionLevel: CommandPermissionLevel.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      player.sendMessage("\xA7d[Gaia Creator] \xA77She's the primordial architect who birthed the original Java realm. If you see crystals, thank her. If you see bugs, it's definitely the porter's fault.");
      player.sendMessage("\xA7b\u{1F517} https://www.curseforge.com/minecraft/mc-mods/gaia-dimension");
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:settings",
    description: "Configure Gaia Dimension settings.",
    permissionLevel: CommandPermissionLevel.GameDirectors
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      const currentConfig = ModConfig.getAll();
      const form = new ModalFormData2();
      form.title("\xA76Gaia Settings");
      form.toggle("Portal Biome Restriction\n\xA77(Only allowed biomes)", { defaultValue: currentConfig.portalBiomeRestriction });
      form.toggle("Allow All Biomes\n\xA77(Bypass restriction)", { defaultValue: currentConfig.allowAllBiomes });
      form.textField("Manually Add Biome ID", "Enter identifier...", { defaultValue: "" });
      const discovered = currentConfig.discoveredBiomes;
      const hotBiomes = new Set(currentConfig.hotBiomes);
      for (const biomeId of discovered) {
        const isAllowed = hotBiomes.has(biomeId);
        const label = isAllowed ? `\xA7aAllowed: \xA7f${biomeId}` : `\xA77Restricted: \xA7f${biomeId}`;
        form.toggle(label, { defaultValue: isAllowed });
      }
      form.show(player).then((response) => {
        if (response.canceled || !response.formValues) return;
        const [portalRestriction, allowAll, manualBiome, ...biomeToggles] = response.formValues;
        ModConfig.portalBiomeRestriction = portalRestriction;
        ModConfig.allowAllBiomes = allowAll;
        if (manualBiome && manualBiome.trim().length > 0) {
          ModConfig.addHotBiome(manualBiome.trim());
        }
        const newHotBiomes = [];
        for (let i = 0; i < discovered.length; i++) {
          if (biomeToggles[i]) {
            newHotBiomes.push(discovered[i]);
          }
        }
        ModConfig.hotBiomes = newHotBiomes;
        player.sendMessage(`\xA76[Gaia] \xA77Settings updated.`);
      }).catch((e) => {
        console.error("Failed to show settings form: " + (e instanceof Error ? e.message : String(e)));
      });
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:sen",
    description: "The Porter.",
    permissionLevel: CommandPermissionLevel.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player20)) return { status: 0 };
    system27.run(() => {
      player.sendMessage("\xA76[The Porter] \xA77Behold the one who dragged this entire dimension into Bedrock by its crystal ears.");
      player.sendMessage("\xA7eIt only took 4 years, three gray hairs, and a questionable amount of sanity. Don't ask why it took so long... those gray hairs are just Albite dust, I promise.");
    });
    return { status: 0 };
  });
}
function formatName(id) {
  return id.split(/[:_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// src/main/bedrock/ts/systems/SetBiomeCommand.ts
import { Player as Player21, system as system28, CommandPermissionLevel as CommandPermissionLevel2, CustomCommandParamType as CustomCommandParamType2 } from "@minecraft/server";

// src/main/bedrock/ts/config/biome_visuals.ts
var BIOME_VISUALS = {
  "mineral_river": {
    surface: "gaiadimension:salt",
    dirt: "gaiadimension:salt_rock",
    bedrock: "gaiadimension:bedrock_mineral_river",
    foliage: [],
    groundCover: []
  },
  "volcanic_lands": {
    surface: "gaiadimension:charred_grass",
    dirt: "gaiadimension:volcanic_rock",
    bedrock: "gaiadimension:bedrock_volcanic_lands",
    foliage: ["gaiadimension:burning_tree"],
    groundCover: []
  },
  "shining_grove": {
    surface: "gaiadimension:soft_grass",
    dirt: "gaiadimension:light_soil",
    bedrock: "gaiadimension:bedrock_shining_grove",
    foliage: ["gaiadimension:golden_tree"],
    groundCover: ["gaiadimension:gold_orb_tucher_patch"]
  },
  "smoldering_bog": {
    surface: "gaiadimension:murky_grass",
    dirt: "gaiadimension:boggy_soil",
    bedrock: "gaiadimension:bedrock_smoldering_bog",
    foliage: ["gaiadimension:burnt_tree"],
    groundCover: []
  },
  "static_wasteland": {
    surface: "gaiadimension:wasteland_stone",
    dirt: "gaiadimension:impure_rock",
    bedrock: "gaiadimension:bedrock_static_wasteland",
    foliage: [],
    groundCover: ["gaiadimension:static_stone_blob"]
  },
  "green_agate_jungle": {
    surface: "gaiadimension:green_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_green_agate_jungle",
    foliage: ["gaiadimension:green_agate_tree", "gaiadimension:green_bush"],
    groundCover: ["gaiadimension:agathum_patch", "gaiadimension:green_crystal_growth_patch"]
  },
  "crystal_plains": {
    surface: "gaiadimension:pink_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_crystal_plains",
    foliage: ["gaiadimension:pink_agate_tree"],
    groundCover: ["gaiadimension:pink_crystal_growth_patch"]
  },
  "mutant_agate_wildwood": {
    surface: "gaiadimension:orange_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_mutant_agate_wildwood",
    foliage: ["gaiadimension:pink_agate_tree_mutant"],
    groundCover: ["gaiadimension:mutant_crystal_growth_patch"]
  },
  "purple_agate_swamp": {
    surface: "gaiadimension:purple_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_purple_agate_swamp",
    foliage: ["gaiadimension:purple_tree_randomizer"],
    groundCover: ["gaiadimension:purple_crystal_growth_patch"]
  },
  "pink_agate_forest": {
    surface: "gaiadimension:peach_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_pink_agate_forest",
    foliage: ["gaiadimension:forest_pink_agate_tree"],
    groundCover: ["gaiadimension:peach_crystal_growth_patch"]
  },
  "blue_agate_taiga": {
    surface: "gaiadimension:blue_agate_taiga",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_blue_agate_taiga",
    foliage: ["gaiadimension:blue_agate_tree"],
    groundCover: ["gaiadimension:blue_crystal_growth_patch"]
  },
  "fossil_woodland": {
    surface: "gaiadimension:pale_green_glitter_grass",
    dirt: "gaiadimension:heavy_soil",
    bedrock: "gaiadimension:bedrock_fossil_woodland",
    foliage: ["gaiadimension:fossilized_tree"],
    groundCover: ["gaiadimension:agathum_patch"]
  },
  "goldstone_lands": {
    surface: "gaiadimension:corrupt_grass",
    dirt: "gaiadimension:corrupt_soil",
    bedrock: "gaiadimension:bedrock_goldstone_lands",
    foliage: ["gaiadimension:goldstone_tree"],
    groundCover: ["gaiadimension:corrupt_varloom_patch"]
  },
  "plains": {
    surface: "gaiadimension:vanilla_grass_plains",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "desert": {
    surface: "minecraft:sand",
    dirt: "minecraft:sand",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: ["minecraft:cactus_feature"]
  },
  "badlands": {
    surface: "minecraft:red_sand",
    dirt: "minecraft:hardened_clay",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "swamp": {
    surface: "gaiadimension:vanilla_grass_swamp",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "jungle": {
    surface: "gaiadimension:vanilla_grass_jungle",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "forest": {
    surface: "gaiadimension:vanilla_grass_forest",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "dark_forest": {
    surface: "gaiadimension:vanilla_grass_dark_forest",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "taiga": {
    surface: "gaiadimension:vanilla_grass_taiga",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "snowy_plains": {
    surface: "gaiadimension:vanilla_grass_snowy_plains",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "mushroom_fields": {
    surface: "minecraft:mycelium",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  },
  "cherry_grove": {
    surface: "gaiadimension:vanilla_grass_cherry_grove",
    dirt: "minecraft:dirt",
    bedrock: "minecraft:bedrock",
    foliage: [],
    groundCover: []
  }
};

// src/main/bedrock/ts/systems/SetBiomeCommand.ts
function formatName2(id) {
  return id.split(/[:_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function registerSetBiomeCommand(registry) {
  registry.registerCommand({
    name: "gaiadimension:setbiome",
    description: 'Transform the biome. Usage: /gaiadimension:setbiome "crystal_plains" "20" "circle" "true"',
    permissionLevel: CommandPermissionLevel2.GameDirectors,
    optionalParameters: [
      { name: "biome", type: CustomCommandParamType2.String },
      { name: "radius", type: CustomCommandParamType2.String },
      { name: "shape", type: CustomCommandParamType2.String },
      { name: "epic", type: CustomCommandParamType2.String }
    ]
  }, (origin, biome, radiusStr, shape, epic) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player21)) return;
    if (!biome || !radiusStr) {
      player.sendMessage('\xA7cUsage: /gaiadimension:setbiome "biome" "radius" ["shape"] ["epic"]');
      return { status: 0 };
    }
    const cleanBiome = biome.replace(/["']/g, "");
    const radius = Number(radiusStr.replace(/["']/g, ""));
    const cleanShape = (shape || "circle").replace(/["']/g, "");
    const isEpic = epic?.toLowerCase().replace(/["']/g, "") === "true" || epic?.toLowerCase().replace(/["']/g, "") === "epic";
    if (isNaN(radius)) {
      player.sendMessage("\xA7cInvalid radius. Please provide a number.");
      return { status: 0 };
    }
    const visuals = BIOME_VISUALS[cleanBiome];
    if (!visuals) {
      player.sendMessage(`\xA7cUnknown biome: ${cleanBiome}. Valid: ${Object.keys(BIOME_VISUALS).join(", ")}`);
      return { status: 0 };
    }
    const center = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    const dim = player.dimension;
    player.sendMessage(`\xA76[Gaia] \xA77Commencing transformation to \xA7e${formatName2(cleanBiome)}\xA77...`);
    const transformLocation = (loc) => {
      try {
        const metaBlock = dim.getBlock({ x: loc.x, y: 0, z: loc.z });
        if (metaBlock) metaBlock.setType(visuals.bedrock);
        let currentY = DimensionSystem.getTopBlock(dim, loc.x, loc.z, loc.y + 40);
        let surfaceBlock = null;
        while (currentY > dim.heightRange.min) {
          const b = dim.getBlock({ x: loc.x, y: currentY - 1, z: loc.z });
          if (!b || b.isAir) {
            currentY--;
            continue;
          }
          const tid = b.typeId;
          if (tid.includes("log") || tid.includes("wood") || tid.includes("leaves") || tid.includes("stem") || tid.includes("flower") || tid === "minecraft:tallgrass" || tid === "minecraft:grass" || tid === "minecraft:mycelium" || tid.includes("crystal_growth") || tid.includes("agathum") || tid.includes("tucher") || tid.includes("sapling") || tid.includes("bush")) {
            currentY--;
            continue;
          }
          surfaceBlock = b;
          break;
        }
        if (surfaceBlock && !surfaceBlock.isAir) {
          surfaceBlock.setType(visuals.surface);
          const dirtBlock = dim.getBlock({ x: loc.x, y: currentY - 2, z: loc.z });
          if (dirtBlock) dirtBlock.setType(visuals.dirt);
          const rand = Math.random();
          if (rand < 0.05 && visuals.foliage.length > 0) {
            const feature = visuals.foliage[Math.floor(Math.random() * visuals.foliage.length)];
            dim.runCommand(`execute positioned ${loc.x} ${currentY} ${loc.z} run feature place ${feature}`);
          } else if (rand < 0.15 && visuals.groundCover.length > 0) {
            const feature = visuals.groundCover[Math.floor(Math.random() * visuals.groundCover.length)];
            dim.runCommand(`execute positioned ${loc.x} ${currentY} ${loc.z} run feature place ${feature}`);
          } else if (rand < 0.25) {
            const flowers = ["gaiadimension:tilibl", "gaiadimension:tiligr", "gaiadimension:tilimy", "gaiadimension:tiliol", "gaiadimension:tiliou", "gaiadimension:tilipi", "gaiadimension:tilipu"];
            const flower = flowers[Math.floor(Math.random() * flowers.length)];
            const airBlock = dim.getBlock({ x: loc.x, y: currentY, z: loc.z });
            if (airBlock && airBlock.isAir) airBlock.setType(flower);
          }
        }
      } catch (e) {
      }
    };
    if (!isEpic) {
      system28.run(() => {
        for (let x = -radius; x <= radius; x++) {
          for (let z = -radius; z <= radius; z++) {
            const dist = Math.sqrt(x * x + z * z);
            if (cleanShape === "circle" && dist > radius) continue;
            transformLocation({ x: center.x + x, y: center.y, z: center.z + z });
          }
        }
        dim.spawnEntity("minecraft:lightning_bolt", center);
        dim.playSound("ambient.weather.thunder", center);
      });
    } else {
      let currentRadius = 0;
      const interval = system28.runInterval(() => {
        const r = currentRadius;
        for (let theta = 0; theta < 360; theta += 2) {
          const rad = theta * Math.PI / 180;
          const x = Math.round(r * Math.cos(rad));
          const z = Math.round(r * Math.sin(rad));
          transformLocation({ x: center.x + x, y: center.y, z: center.z + z });
        }
        if (r % 5 === 0) {
          const fxPos = { x: center.x + r, y: center.y, z: center.z };
          dim.playSound("item.trident.thunder", fxPos, { volume: 0.5 });
          if (Math.random() < 0.3) dim.spawnEntity("minecraft:lightning_bolt", { x: center.x + (Math.random() * r * 2 - r), y: center.y, z: center.z + (Math.random() * r * 2 - r) });
        }
        currentRadius++;
        if (currentRadius > radius) {
          system28.clearRun(interval);
          dim.playSound("ui.toast.challenge_complete", center);
          player.sendMessage("\xA76[Gaia] \xA7aTransformation Complete.");
        }
      }, 1);
    }
    return { status: 0 };
  });
}

// src/main/bedrock/ts/items/FireStarter.ts
import {
  Player as Player22,
  EquipmentSlot as EquipmentSlot5,
  Direction as Direction2
} from "@minecraft/server";
function registerFireStarterComponent({ itemComponentRegistry }) {
  itemComponentRegistry.registerCustomComponent("gaiadimension:fire_starter", {
    onUseOn: (event) => {
      const { source: player, block, blockFace, itemStack } = event;
      if (!(player instanceof Player22)) return;
      if (!itemStack) return;
      const targetLocation = block.location;
      const placeLocation = {
        x: targetLocation.x + (blockFace === Direction2.East ? 1 : blockFace === Direction2.West ? -1 : 0),
        y: targetLocation.y + (blockFace === Direction2.Up ? 1 : blockFace === Direction2.Down ? -1 : 0),
        z: targetLocation.z + (blockFace === Direction2.South ? 1 : blockFace === Direction2.North ? -1 : 0)
      };
      const targetBlock = player.dimension.getBlock(placeLocation);
      if (!targetBlock) return;
      if (targetBlock.typeId === "gaiadimension:glittering_fire") return;
      if (block.typeId === "gaiadimension:glittering_fire" && blockFace === Direction2.Up) return;
      if (targetBlock.isAir || targetBlock.typeId.includes("minecraft:light_block") || targetBlock.typeId === "minecraft:tallgrass" || targetBlock.typeId === "minecraft:yellow_flower" || targetBlock.typeId === "minecraft:red_flower") {
        const dimension = player.dimension;
        if (dimension.id === "minecraft:overworld" && ModConfig.portalBiomeRestriction && !ModConfig.allowAllBiomes) {
          const biome = dimension.getBiome(placeLocation);
          const hotBiomes = ModConfig.hotBiomes;
          if (!hotBiomes.includes(biome.id)) {
            dimension.playSound("random.fizz", placeLocation);
            return;
          }
        }
        targetBlock.setType("gaiadimension:glittering_fire");
        dimension.playSound("fire.ignite", placeLocation);
        PortalManager.tryIgnite(targetBlock);
        if (player.getGameMode() !== "creative") {
          const durability = itemStack.getComponent("minecraft:durability");
          if (durability) {
            const equippable = player.getComponent("minecraft:equippable");
            if (durability.damage + 1 >= durability.maxDurability) {
              equippable?.setEquipment(EquipmentSlot5.Mainhand, void 0);
              player.playSound("random.break");
            } else {
              durability.damage += 1;
              equippable?.setEquipment(EquipmentSlot5.Mainhand, itemStack);
            }
          }
        }
      }
    }
  });
}

// src/main/bedrock/ts/systems/DimensionDestruction.ts
import {
  world as world24,
  system as system29,
  Player as Player23,
  CommandPermissionLevel as CommandPermissionLevel3,
  CustomCommandParamType as CustomCommandParamType3,
  BlockVolume as BlockVolume4
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
var CORE_DIMENSIONS = [
  { id: "minecraft:overworld", name: "Overworld", lore: "The familiar realm of sun and earth.", color: "\xA7a" },
  { id: "minecraft:nether", name: "Nether", lore: "A hellscape of fire and brimstone.", color: "\xA7c" },
  { id: "minecraft:the_end", name: "The End", lore: "The void beyond the stars.", color: "\xA75" },
  { id: "gaiadimension:gaia_dimension", name: "Gaia Dimension 1", lore: "Crystalline paradise preserved in eternal sun.", color: "\xA76" }
];
var REALM_COUNT = 16;
var REALM_PREFIX = "gaiadimension:realm_";
function getRealmDims() {
  const realms = [];
  const themes = [
    { lore: "Another... crystal world. Sure. Why not.", color: "\xA7b" },
    { lore: "It's a crystal world... again. Yep. Another one.", color: "\xA7e" },
    { lore: "Yet ANOTHER Gaia dimension. Are you serious right now.", color: "\xA7d" },
    { lore: "Four. FOUR Gaia dimensions. Who approved this.", color: "\xA79" },
    { lore: "HOW MANY GAIA DIMENSIONS ARE THERE.", color: "\xA7c" },
    { lore: "I am begging you. Please. No more crystals. I have a family.", color: "\xA75" },
    { lore: "JESUS MARY THEY ARE ALL MINERALS.", color: "\xA74" },
    { lore: "By Androsa, that's A LOT of Gaia dimensions!", color: "\xA76" },
    { lore: "okay at this point i'm convinced the universe is just vibes and malachite.", color: "\xA73" },
    { lore: "The crystals... they're MULTIPLYING.", color: "\xA7c" },
    { lore: "Whoever designed this place needs to be evaluated by a professional.", color: "\xA72" },
    { lore: "I have counted twelve Gaia dimensions. I need to lie down.", color: "\xA79" },
    { lore: "Androsa WHY. ANDROSA. W H Y.", color: "\xA7d" },
    { lore: "At this point I think Gaia IS the universe and everything else is the anomaly.", color: "\xA75" },
    { lore: "SIXTEEN. There are SIXTEEN of these. I quit.", color: "\xA7c" },
    { lore: "This is the last one. It has to be. Please let it be the last one.", color: "\xA78" }
  ];
  for (let i = 0; i < REALM_COUNT; i++) {
    const t = themes[i];
    realms.push({
      id: `${REALM_PREFIX}${i}`,
      name: `Gaia Dimension ${i + 2}`,
      lore: t.lore,
      color: t.color
    });
  }
  return realms;
}
function getAllDimensions() {
  return [...CORE_DIMENSIONS, ...getRealmDims()];
}
function getAliveDimensions() {
  return getAllDimensions().filter((d) => !isDimensionDestroyed(d.id));
}
function isDimensionDestroyed(dimId) {
  return world24.getDynamicProperty(`destroyed:${dimId}`) === true;
}
function setDimensionDestroyed(dimId, destroyed) {
  world24.setDynamicProperty(`destroyed:${dimId}`, destroyed);
}
function findFallbackDimension(excludeId) {
  return getAliveDimensions().find((d) => d.id !== excludeId);
}
function showDimensionNavigator(player) {
  const alive = getAliveDimensions();
  if (alive.length === 0) {
    player.sendMessage("\xA7c\xA7lAll dimensions have been obliterated. There is nothing left.");
    return;
  }
  const currentDim = player.dimension.id;
  const form = new ActionFormData().title("\xA7l\xA78[ \xA7fDimensional Navigator \xA78]").body("\xA77Choose a dimension to traverse to:");
  const dimList = [];
  for (const dim of alive) {
    const isCurrent = dim.id === currentDim;
    const label = isCurrent ? `${dim.color}\xA7l${dim.name}
\xA7r\xA78(you are here)` : `${dim.color}${dim.name}
\xA78\xA7o${dim.lore}`;
    form.button(label);
    dimList.push(dim);
  }
  form.show(player).then((response) => {
    if (response.canceled || response.selection === void 0) return;
    const selected = dimList[response.selection];
    if (!selected) return;
    if (selected.id === currentDim) {
      player.sendMessage("\xA77You are already in this dimension.");
      return;
    }
    teleportToDimension(player, selected);
  }).catch(() => {
  });
}
function teleportToDimension(player, dim) {
  system29.run(() => {
    try {
      const targetDim = world24.getDimension(dim.id);
      player.sendMessage(`${dim.color}\xA7l\xBB \xA7r\xA77Traversing to ${dim.color}${dim.name}\xA77...`);
      player.teleport(
        { x: player.location.x, y: 100, z: player.location.z },
        { dimension: targetDim }
      );
      system29.runTimeout(() => {
        if (player.isValid) {
          player.sendMessage(`${dim.color}\xA7l\xBB \xA7r\xA77Arrived in ${dim.color}${dim.name}\xA77.`);
        }
      }, 20);
    } catch (e) {
      player.sendMessage(`\xA7cFailed to traverse: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}
var OMEN_LINES = [
  "\xA74\xA7lNow I am become Death, the destroyer of worlds.",
  "\xA77\xA7o\u2014 J. Robert Oppenheimer",
  "",
  "\xA7c\xA7lThe stars themselves shall weep.",
  "\xA78\xA7oThe dimensional fabric shudders...",
  "\xA74If the radiance of a thousand suns were to burst at once into the sky,",
  "\xA74that would be like the splendor of the mighty one.",
  "\xA77\xA7o\u2014 Bhagavad Gita, XI.12"
];
var FRACTURE_LINES = [
  "\xA7c\xA7l D E A T H",
  "\xA74\xA7l T H E",
  "\xA7c\xA7l D E S T R O Y E R",
  "\xA74\xA7l O F   W O R L D S",
  "",
  "\xA76\xA7lThe power of a god flows through your fingertips.",
  "\xA7e\xA7lRagnar\xF6k!",
  "\xA78\xA7oThe sky cracks. The earth splits. The void hungers.",
  "",
  "\xA75\xA7lFeel it. The weight of an entire reality... collapsing.",
  "\xA77\xA7oA trillion souls, silenced in an instant.",
  "\xA74\xA7lThis is what it means to unmake a world."
];
var DEVOURER_LINES = [
  "\xA78\xA7l\u2501\u2501\u2501\u2501\u2501\u2501 \xA74TRANSMISSIONS RECEIVED \xA78\xA7l\u2501\u2501\u2501\u2501\u2501\u2501",
  "",
  '\xA75\xA7l[UNICRON] \xA7f\xA7o"Magnificent. You destroy with the elegance of a true herald. I approve."',
  '\xA74\xA7l[GALACTUS] \xA7f\xA7o"Another world consumed. The cosmic balance shifts. Welcome to the hunger."',
  '\xA72\xA7l[ABELOTH] \xA7f\xA7o"Delicious. The chaos of an unraveling dimension... I can taste it from here."',
  '\xA7c\xA7l[THANOS] \xA7f\xA7o"You could not live with your own failure. So you erased the whole thing. Respect."',
  '\xA76\xA7l[SAURON] \xA7f\xA7o"One does not simply walk into a dimension that no longer exists."',
  `\xA7e\xA7l[Cyn] \xA7f\xA7o"Haha, you actually did it. \xA7e[giggle]\xA7f That's adorable. \xA7e[giggle] \xA7e[giggle]\xA7f"`,
  `\xA7b\xA7l[BILL CIPHER] \xA7f\xA7o"WOW! A FLAT CIRCLE WHERE A WORLD USED TO BE! NOW THAT'S MY KIND OF GEOMETRY!"`,
  `\xA7d\xA7l[DORMAMMU] \xA7f\xA7o"I've come to bargain\u2014 wait. There's nothing left to bargain for. Well played."`,
  '\xA73\xA7l[THE VOID] \xA7f\xA7o"..."',
  '\xA73\xA7l[THE VOID] \xA7f\xA7o"...thank you for the meal."',
  "",
  "\xA78\xA7l\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
];
var AFTERMATH_LINES = [
  "",
  "\xA77\xA7oIn the silence that follows...",
  "\xA77\xA7oyou realize the screaming was yours.",
  "",
  "\xA7f\xA7lA world unmade. A history erased.",
  "\xA7f\xA7lEvery mountain. Every ocean. Every sunset.",
  "\xA7f\xA7lGone.",
  "",
  '\xA74\xA7l"I have become death."',
  "\xA77\xA7oAnd you didn't even flinch.",
  "",
  "\xA78\xA7o[The dimensional navigator will open shortly...]"
];
function broadcast(msg) {
  for (const p of world24.getAllPlayers()) {
    if (p.isValid) p.sendMessage(msg);
  }
}
var DestructionSequencer = class {
  player;
  dimId;
  dimName;
  dimColor;
  tick = 0;
  interval = 0;
  affectedPlayers = [];
  constructor(player, dimId, dimName, dimColor) {
    this.player = player;
    this.dimId = dimId;
    this.dimName = dimName;
    this.dimColor = dimColor;
  }
  start() {
    this.affectedPlayers = world24.getAllPlayers().filter((p) => p.dimension.id === this.dimId);
    broadcast(`\xA74\xA7l\u26A0 ${this.dimColor}${this.dimName} \xA74\xA7lis being obliterated... \u26A0`);
    broadcast(`\xA78\xA7oDimensional collapse initiated by \xA7f${this.player.name}`);
    this.interval = system29.runInterval(() => {
      this.tick++;
      this.processTick();
    }, 1);
  }
  processTick() {
    this.affectedPlayers = this.affectedPlayers.filter((p) => p.isValid && p.dimension.id === this.dimId);
    if (this.tick === 1) {
      for (const p of this.affectedPlayers) {
        p.onScreenDisplay.setTitle("\xA74\xA7l\u26A0 DIMENSIONAL COLLAPSE \u26A0", {
          fadeInDuration: 10,
          stayDuration: 50,
          fadeOutDuration: 10
        });
        p.addEffect("darkness", 300, { amplifier: 0, showParticles: false });
        p.dimension.playSound("ambient.weather.thunder", p.location, { volume: 2, pitch: 0.3 });
      }
    }
    for (let i = 0; i < OMEN_LINES.length; i++) {
      if (this.tick === 5 + i * 3) broadcast(OMEN_LINES[i]);
    }
    if (this.tick > 5 && this.tick < 40 && this.tick % 6 === 0) {
      for (const p of this.affectedPlayers) {
        p.addEffect("night_vision", 5, { amplifier: 0, showParticles: false });
      }
    }
    if (this.tick === 40) {
      for (const p of this.affectedPlayers) {
        p.onScreenDisplay.setTitle("\xA7c\xA7lTHE GROUND TREMBLES", {
          fadeInDuration: 5,
          stayDuration: 30,
          fadeOutDuration: 5
        });
      }
    }
    if (this.tick >= 40 && this.tick < 80) {
      for (const p of this.affectedPlayers) {
        if (this.tick % 2 === 0) {
          const shake = 0.05 + (this.tick - 40) * 4e-3;
          p.teleport({
            x: p.location.x + (Math.random() - 0.5) * shake,
            y: p.location.y,
            z: p.location.z + (Math.random() - 0.5) * shake
          });
        }
        if (this.tick % 5 === 0) {
          try {
            p.dimension.spawnParticle("minecraft:huge_explosion_emitter", {
              x: p.location.x + (Math.random() - 0.5) * 20,
              y: p.location.y + Math.random() * 10,
              z: p.location.z + (Math.random() - 0.5) * 20
            });
          } catch {
          }
        }
        if (this.tick % 8 === 0) {
          p.dimension.playSound("random.explode", p.location, { volume: 1.5, pitch: 0.2 + Math.random() * 0.3 });
        }
      }
    }
    if (this.tick === 80) {
      for (const p of this.affectedPlayers) {
        p.onScreenDisplay.setTitle("\xA7c\xA7l\xA7kXX\xA7r \xA74\xA7lTHE FABRIC IS TEARING \xA7c\xA7l\xA7kXX", {
          fadeInDuration: 5,
          stayDuration: 50,
          fadeOutDuration: 5
        });
        p.dimension.playSound("mob.enderdragon.growl", p.location, { volume: 3, pitch: 0.5 });
      }
    }
    for (let i = 0; i < FRACTURE_LINES.length; i++) {
      if (this.tick === 82 + i * 3) broadcast(FRACTURE_LINES[i]);
    }
    if (this.tick >= 80 && this.tick < 130) {
      for (const p of this.affectedPlayers) {
        if (this.tick % 3 === 0) {
          const angle = (this.tick - 80) * 0.3;
          const radius = 3 + (this.tick - 80) * 0.1;
          try {
            p.dimension.spawnParticle("minecraft:dragon_breath_trail", {
              x: p.location.x + Math.cos(angle) * radius,
              y: p.location.y + 1 + (this.tick - 80) % 10 * 0.3,
              z: p.location.z + Math.sin(angle) * radius
            });
            p.dimension.spawnParticle("minecraft:end_chest", {
              x: p.location.x + Math.cos(angle + Math.PI) * radius,
              y: p.location.y + 2,
              z: p.location.z + Math.sin(angle + Math.PI) * radius
            });
          } catch {
          }
        }
        if (this.tick % 10 === 0) {
          const r = Math.floor((this.tick - 80) / 10) + 2;
          const px = Math.floor(p.location.x);
          const py = Math.floor(p.location.y);
          const pz = Math.floor(p.location.z);
          try {
            p.dimension.fillBlocks(
              new BlockVolume4(
                { x: px - r, y: py - 1, z: pz - r },
                { x: px + r, y: py + r, z: pz + r }
              ),
              "minecraft:air",
              { ignoreChunkBoundErrors: true }
            );
          } catch {
          }
        }
        const shake = 0.15 + (this.tick - 80) * 6e-3;
        p.teleport({
          x: p.location.x + (Math.random() - 0.5) * shake,
          y: p.location.y,
          z: p.location.z + (Math.random() - 0.5) * shake
        });
        if (this.tick % 6 === 0) {
          p.dimension.playSound("random.explode", p.location, { volume: 2, pitch: 0.1 + Math.random() * 0.2 });
          p.dimension.playSound("ambient.weather.thunder", p.location, { volume: 2.5, pitch: 0.2 });
        }
      }
    }
    for (let i = 0; i < DEVOURER_LINES.length; i++) {
      if (this.tick === 130 + i * 3) {
        broadcast(DEVOURER_LINES[i]);
        if (DEVOURER_LINES[i].includes("[") && this.tick % 2 === 0) {
          for (const p of this.affectedPlayers) {
            if (!p.isValid) continue;
            p.dimension.playSound("random.explode", p.location, { volume: 1, pitch: 0.5 + Math.random() * 0.5 });
            try {
              p.dimension.spawnParticle("minecraft:huge_explosion_emitter", {
                x: p.location.x + (Math.random() - 0.5) * 15,
                y: p.location.y + Math.random() * 8,
                z: p.location.z + (Math.random() - 0.5) * 15
              });
            } catch {
            }
          }
        }
      }
    }
    if (this.tick === 180) {
      for (const p of this.affectedPlayers) {
        p.onScreenDisplay.setTitle("\xA7f\xA7l.", {
          fadeInDuration: 2,
          stayDuration: 30,
          fadeOutDuration: 10
        });
        p.addEffect("blindness", 80, { amplifier: 255, showParticles: false });
        p.addEffect("nausea", 80, { amplifier: 3, showParticles: false });
        p.dimension.playSound("beacon.activate", p.location, { volume: 5, pitch: 2 });
      }
      broadcast(`\xA78\xA7l[\xA74\xA7l\u2726\xA78\xA7l] \xA7f${this.dimColor}${this.dimName} \xA7fhas been \xA74\xA7lerased from existence\xA7f.`);
    }
    if (this.tick === 200) {
      setDimensionDestroyed(this.dimId, true);
      const fallback = findFallbackDimension(this.dimId);
      for (const p of this.affectedPlayers) {
        if (!p.isValid) continue;
        try {
          if (fallback) {
            const targetDim = world24.getDimension(fallback.id);
            p.teleport({ x: 0, y: 100, z: 0 }, { dimension: targetDim });
          }
          p.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
          p.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
        } catch {
        }
      }
    }
    for (let i = 0; i < AFTERMATH_LINES.length; i++) {
      if (this.tick === 210 + i * 4) broadcast(AFTERMATH_LINES[i]);
    }
    if (this.tick === 215) {
      for (const p of world24.getAllPlayers()) {
        if (!p.isValid) continue;
        p.onScreenDisplay.setTitle("\xA77\xA7oThis world has been erased from existence.", {
          fadeInDuration: 20,
          stayDuration: 60,
          fadeOutDuration: 20
        });
        p.dimension.playSound("beacon.deactivate", p.location, { volume: 2, pitch: 0.5 });
      }
    }
    if (this.tick === 260) {
      for (const p of this.affectedPlayers) {
        if (p.isValid) {
          system29.runTimeout(() => {
            if (p.isValid) showDimensionNavigator(p);
          }, 20);
        }
      }
      system29.clearRun(this.interval);
    }
  }
};
function initDestroyedDimensionGuard() {
  system29.runInterval(() => {
    for (const player of world24.getAllPlayers()) {
      if (!player.isValid) continue;
      const dimId = player.dimension.id;
      if (isDimensionDestroyed(dimId)) {
        const fallback = findFallbackDimension(dimId);
        if (fallback) {
          try {
            const targetDim = world24.getDimension(fallback.id);
            player.teleport({ x: 0, y: 100, z: 0 }, { dimension: targetDim });
            player.sendMessage(`\xA74\xA7l\u26A0 \xA7c${dimId} \xA74no longer exists. \xA77You have been redirected.`);
            system29.runTimeout(() => {
              if (player.isValid) showDimensionNavigator(player);
            }, 40);
          } catch {
          }
        }
      }
    }
  }, 20);
}
function registerRealmDimensions(registry) {
  for (let i = 0; i < REALM_COUNT; i++) {
    try {
      registry.registerCustomDimension(`${REALM_PREFIX}${i}`);
    } catch {
    }
  }
}
function registerDestructionCommands(registry) {
  registry.registerCommand({
    name: "gaiadimension:obliterate",
    description: "Obliterate an entire dimension from existence.",
    permissionLevel: CommandPermissionLevel3.Any,
    mandatoryParameters: [
      { name: "dimension", type: CustomCommandParamType3.String }
    ]
  }, (origin, dimension) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player23)) return { status: 0 };
    system29.run(() => {
      if (!dimension) {
        player.sendMessage("\xA7cUsage: /gaiadimension:obliterate <overworld|nether|the_end|gaia>");
        return;
      }
      const dimMap = {};
      for (const d of CORE_DIMENSIONS) {
        const short = d.id.split(":")[1] || d.id;
        dimMap[short] = d;
        dimMap[d.id] = d;
      }
      dimMap["gaia"] = CORE_DIMENSIONS[3];
      dimMap["end"] = CORE_DIMENSIONS[2];
      const target = dimMap[dimension.toLowerCase()];
      if (!target) {
        player.sendMessage(`\xA7cUnknown dimension '${dimension}'. Valid: overworld, nether, the_end, gaia`);
        return;
      }
      if (isDimensionDestroyed(target.id)) {
        player.sendMessage(`\xA77${target.color}${target.name} \xA77has already been obliterated.`);
        return;
      }
      const aliveAfter = getAliveDimensions().filter((d) => d.id !== target.id);
      if (aliveAfter.length === 0) {
        player.sendMessage("\xA7c\xA7lCannot obliterate the last remaining dimension.");
        return;
      }
      player.sendMessage(`\xA74\xA7lInitiating dimensional collapse of ${target.color}${target.name}\xA74\xA7l...`);
      const sequencer = new DestructionSequencer(player, target.id, target.name, target.color);
      sequencer.start();
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:dimensions",
    description: "Open the Dimensional Navigator to traverse between worlds.",
    permissionLevel: CommandPermissionLevel3.Any
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player23)) return { status: 0 };
    system29.run(() => {
      showDimensionNavigator(player);
    });
    return { status: 0 };
  });
  registry.registerCommand({
    name: "gaiadimension:restore",
    description: "Restore a previously obliterated dimension.",
    permissionLevel: CommandPermissionLevel3.Any,
    mandatoryParameters: [
      { name: "dimension", type: CustomCommandParamType3.String }
    ]
  }, (origin, dimension) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player23)) return { status: 0 };
    system29.run(() => {
      if (!dimension) {
        player.sendMessage("\xA7cUsage: /gaiadimension:restore <overworld|nether|the_end|gaia>");
        return;
      }
      const dimMap = {};
      for (const d of CORE_DIMENSIONS) {
        const short = d.id.split(":")[1] || d.id;
        dimMap[short] = d;
        dimMap[d.id] = d;
      }
      dimMap["gaia"] = CORE_DIMENSIONS[3];
      dimMap["end"] = CORE_DIMENSIONS[2];
      const target = dimMap[dimension.toLowerCase()];
      if (!target) {
        player.sendMessage(`\xA7cUnknown dimension '${dimension}'.`);
        return;
      }
      if (!isDimensionDestroyed(target.id)) {
        player.sendMessage(`\xA77${target.color}${target.name} \xA77is not destroyed.`);
        return;
      }
      setDimensionDestroyed(target.id, false);
      for (const p of world24.getAllPlayers()) {
        p.sendMessage(`\xA7a\xA7l\u2726 ${target.color}${target.name} \xA7a\xA7lhas been restored!`);
        p.dimension.playSound("random.levelup", p.location, { volume: 1, pitch: 1.5 });
      }
    });
    return { status: 0 };
  });
}

// src/main/bedrock/ts/items/MagicStaff.ts
import { Player as Player25 } from "@minecraft/server";

// src/main/bedrock/ts/physics/ContraptionPhysics.ts
import { world as world25, system as system30, BlockPermutation as BlockPermutation15 } from "@minecraft/server";

// src/main/bedrock/ts/physics/ContraptionHitbox.ts
var PLAYER_HALF_W = 0.3;
var BLOCK_HALF = 0.5;
var PLAYER_H = 1.8;
function rotateRel(rel, pitch, yaw) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y1 = rel.y * cp - rel.z * sp;
  const z1 = rel.y * sp + rel.z * cp;
  return {
    x: rel.x * cy - z1 * sy,
    y: y1,
    z: rel.x * sy + z1 * cy
  };
}
function resolveContraptionCollision(player, body) {
  if (!player.isValid) return { x: 0, y: 0, z: 0 };
  const px = player.location.x;
  const py = player.location.y;
  const pz = player.location.z;
  let totalPushX = 0;
  let totalPushY = 0;
  let totalPushZ = 0;
  for (const child of body.children) {
    if (!child.entity.isValid) continue;
    const VISUAL_Y = 7 * 2.7 / 16;
    const rot = rotateRel(child.relPos, body.rotation.x, body.rotation.y);
    const bx = body.center.x + rot.x;
    const by = body.center.y + VISUAL_Y + rot.y;
    const bz = body.center.z + rot.z;
    const ox = PLAYER_HALF_W + BLOCK_HALF - Math.abs(px - bx);
    const oz = PLAYER_HALF_W + BLOCK_HALF - Math.abs(pz - bz);
    const oyBot = by + 1 - py;
    const oyTop = py + PLAYER_H - by;
    if (ox <= 0 || oz <= 0 || oyBot <= 0 || oyTop <= 0) continue;
    const penX = ox;
    const penY = Math.min(oyBot, oyTop);
    const penZ = oz;
    const minPen = Math.min(penX, penY, penZ);
    if (minPen === penY) {
      if (oyBot < oyTop) {
        totalPushY = Math.max(totalPushY, by + 1 - py);
      } else {
        totalPushY = Math.min(totalPushY, by - (py + PLAYER_H));
      }
    } else if (minPen === penX) {
      const dir = px > bx ? 1 : -1;
      const push = dir * penX;
      if (Math.abs(push) > Math.abs(totalPushX)) totalPushX = push;
    } else {
      const dir = pz > bz ? 1 : -1;
      const push = dir * penZ;
      if (Math.abs(push) > Math.abs(totalPushZ)) totalPushZ = push;
    }
  }
  if (totalPushX !== 0 || totalPushY !== 0 || totalPushZ !== 0) {
    try {
      player.teleport({
        x: px + totalPushX,
        y: py + totalPushY,
        z: pz + totalPushZ
      });
    } catch {
    }
  }
  return { x: totalPushX, y: totalPushY, z: totalPushZ };
}

// src/main/bedrock/ts/physics/ContraptionPhysics.ts
var PHANTOM_SLOPE_IDS = [
  "gaiadimension:phantom_slope_n",
  // dir 0: slope ascends toward +Z
  "gaiadimension:phantom_slope_e",
  // dir 1: slope ascends toward +X
  "gaiadimension:phantom_slope_s",
  // dir 2: slope ascends toward -Z
  "gaiadimension:phantom_slope_w"
  // dir 3: slope ascends toward -X
];
var PHANTOM_FULL = "gaiadimension:phantom_full";
var SLOPE_ANGLE_STEPS = 128;
var DEFAULT_CONFIG = {
  entityType: "gaiadimension:contraption",
  holdDistance: 4,
  throwForce: 1.8
};
var ContraptionScanner = class {
  static INVALID_BLOCKS = /* @__PURE__ */ new Set([
    "minecraft:air",
    "minecraft:water",
    "minecraft:lava",
    "minecraft:flowing_water",
    "minecraft:flowing_lava"
  ]);
  static scan(startBlock, dimension, maxBlocks = 1e5) {
    const queue = [startBlock];
    const visited = /* @__PURE__ */ new Set();
    const result = [];
    while (queue.length > 0 && result.length < maxBlocks) {
      const block = queue.shift();
      const key = `${block.location.x},${block.location.y},${block.location.z}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!this.isValidBlock(block)) continue;
      result.push(block);
      const { x, y, z } = block.location;
      const offsets = [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 }
      ];
      for (const off of offsets) {
        const neighbor = dimension.getBlock({ x: x + off.x, y: y + off.y, z: z + off.z });
        if (neighbor) {
          const nKey = `${neighbor.location.x},${neighbor.location.y},${neighbor.location.z}`;
          if (!visited.has(nKey)) queue.push(neighbor);
        }
      }
    }
    return result;
  }
  static isValidBlock(block) {
    if (block.isAir || block.isLiquid) return false;
    if (this.INVALID_BLOCKS.has(block.typeId)) return false;
    const id = block.typeId;
    if (id.includes("slab") || id.includes("stair") || id.includes("fence") || id.includes("wall") || id.includes("door") || id.includes("trapdoor") || id.includes("sign") || id.includes("button") || id.includes("pressure_plate") || id.includes("carpet") || id.includes("banner") || id.includes("torch") || id.includes("lantern") || id.includes("chain") || id.includes("candle") || id.includes("flower") || id.includes("sapling") || id.includes("mushroom") || id.includes("skull") || id.includes("head") || id.includes("pot") || id.includes("rail") || id.includes("lever") || id.includes("tripwire") || id.includes("anvil") || id.includes("bell") || id.includes("cake") || id.includes("bed") || id.includes("chest") || id.includes("barrel")) {
      return false;
    }
    return true;
  }
};
var PHANTOM_TYPES = /* @__PURE__ */ new Set([
  PHANTOM_FULL,
  ...PHANTOM_SLOPE_IDS
]);
function isSolid(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (!b || b.isAir || b.isLiquid) return false;
    if (PHANTOM_TYPES.has(b.typeId)) return false;
    return true;
  } catch {
    return false;
  }
}
function rotateRel2(rel, pitch, yaw) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y1 = rel.y * cp - rel.z * sp;
  const z1 = rel.y * sp + rel.z * cp;
  return {
    x: rel.x * cy - z1 * sy,
    y: y1,
    z: rel.x * sy + z1 * cy
  };
}
var GRAVITY = 0.04;
var LINEAR_DAMPING = 0.98;
var ANGULAR_DAMPING = 0.96;
var BOUNCE = 0.3;
var REST_THRESHOLD = 0.01;
var VISUAL_Y_OFFSET = 7 * 2.7 / 16;
var ContraptionBody = class _ContraptionBody {
  center;
  rotation;
  velocity;
  angularVelocity;
  children;
  dimension;
  state;
  holderId;
  tickCallback;
  config;
  // Perf: dirty tracking
  _lastPitchS = 0;
  _lastYawS = 0;
  _lastCenterX = 0;
  _lastCenterY = 0;
  _lastCenterZ = 0;
  _restTicks = 0;
  // Phantom slope collision tracking
  _barrierPositions = [];
  _barriersPlaced = false;
  constructor(center, children, dimension, config) {
    this.center = center;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.children = children;
    this.dimension = dimension;
    this.state = "held";
    this.holderId = "";
    this.tickCallback = 0;
    this.config = config;
  }
  static assemble(blocks, pivot, dimension, config) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const center = { x: pivot.x + 0.5, y: pivot.y, z: pivot.z + 0.5 };
    const children = [];
    const REL_SCALE = 1e3;
    for (const block of blocks) {
      const relPos = {
        x: block.location.x - pivot.x,
        y: block.location.y - pivot.y,
        z: block.location.z - pivot.z
      };
      const blockTypeId = block.typeId;
      const entity = dimension.spawnEntity(cfg.entityType, {
        x: center.x,
        y: center.y,
        z: center.z
      });
      entity.setDynamicProperty("blockType", blockTypeId);
      system30.run(() => {
        if (entity.isValid) {
          entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${blockTypeId}`);
        }
      });
      entity.setProperty("gaiadimension:rel_x", Math.round(relPos.x * REL_SCALE));
      entity.setProperty("gaiadimension:rel_y", Math.round(relPos.y * REL_SCALE));
      entity.setProperty("gaiadimension:rel_z", Math.round(relPos.z * REL_SCALE));
      children.push({ entity, relPos, blockTypeId });
      block.setType("minecraft:air");
    }
    return new _ContraptionBody(center, children, dimension, cfg);
  }
  hold(player) {
    this.removeBarriers();
    this.state = "held";
    this.holderId = player.id;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
  }
  throw(direction, force) {
    this.removeBarriers();
    const f = force ?? this.config.throwForce;
    this.state = "thrown";
    this.holderId = "";
    this._restTicks = 0;
    this.velocity = {
      x: direction.x * f,
      y: direction.y * f + 0.3,
      z: direction.z * f
    };
    this.angularVelocity = {
      x: direction.z * 0.15,
      y: 0,
      z: -direction.x * 0.15
    };
  }
  /**
   * Script-side physics tick:
   * - Gravity applied to velocity
   * - Position updated by velocity
   * - Ground collision checked per-block at rotated positions
   * - Angular velocity updates rotation
   * - Damping applied
   * - Player collision resolved via hitbox module
   */
  physicsTick() {
    if (this.state === "resting" && this._barriersPlaced) return;
    this.velocity.y -= GRAVITY;
    this.center.x += this.velocity.x;
    this.center.y += this.velocity.y;
    this.center.z += this.velocity.z;
    this.rotation.x += this.angularVelocity.x;
    this.rotation.y += this.angularVelocity.y;
    let grounded = false;
    for (const child of this.children) {
      if (!child.entity.isValid) continue;
      const rot = rotateRel2(child.relPos, this.rotation.x, this.rotation.y);
      const wx = this.center.x + rot.x;
      const wy = this.center.y + VISUAL_Y_OFFSET + rot.y;
      const wz = this.center.z + rot.z;
      if (isSolid(this.dimension, wx, wy, wz)) {
        grounded = true;
        const groundTop = Math.floor(wy) + 1;
        this.center.y += groundTop - wy;
        break;
      }
      if (isSolid(this.dimension, wx, wy - 1, wz)) {
        grounded = true;
        break;
      }
    }
    if (grounded) {
      if (Math.abs(this.velocity.y) > 0.05) {
        this.velocity.y = -this.velocity.y * BOUNCE;
      } else {
        this.velocity.y = 0;
      }
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      this.angularVelocity.x *= 0.85;
      this.angularVelocity.z *= 0.85;
    }
    this.velocity.x *= LINEAR_DAMPING;
    this.velocity.z *= LINEAR_DAMPING;
    this.angularVelocity.x *= ANGULAR_DAMPING;
    this.angularVelocity.y *= ANGULAR_DAMPING;
    this._syncProperties();
    if (!this._barriersPlaced) {
      for (const player of world25.getAllPlayers()) {
        if (!player.isValid) continue;
        if (player.dimension.id !== this.dimension.id) continue;
        const dx = player.location.x - this.center.x;
        const dy = player.location.y - this.center.y;
        const dz = player.location.z - this.center.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > this.children.length + 3) continue;
        resolveContraptionCollision(player, this);
      }
    }
    const speed = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) + Math.abs(this.velocity.z) + Math.abs(this.angularVelocity.x) + Math.abs(this.angularVelocity.y);
    if (speed < REST_THRESHOLD && grounded) {
      this._restTicks++;
      if (this._restTicks > 20) {
        this.state = "resting";
        this.velocity = { x: 0, y: 0, z: 0 };
        this.angularVelocity = { x: 0, y: 0, z: 0 };
        let lowestWy = Infinity;
        for (const child of this.children) {
          if (!child.entity.isValid) continue;
          const rot = rotateRel2(child.relPos, this.rotation.x, this.rotation.y);
          const wy = this.center.y + VISUAL_Y_OFFSET + rot.y;
          if (wy < lowestWy) lowestWy = wy;
        }
        if (isFinite(lowestWy)) {
          const snappedLowest = Math.round(lowestWy);
          this.center.y += snappedLowest - lowestWy;
        }
        if (!this._barriersPlaced) {
          this.placeBarriers();
        }
      }
    } else {
      this._restTicks = 0;
      if (this._barriersPlaced) {
        this.removeBarriers();
      }
    }
  }
  /**
   * Syncs rotation/position properties and teleports entities to CENTER.
   * Animation handles all visual offset via calibrated Molang.
   */
  _syncProperties() {
    const SCALE = 1e7;
    const toDeg = (rad) => {
      let d = rad * 180 / Math.PI % 360;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return d;
    };
    const pitchDeg = toDeg(this.rotation.x);
    const yawDeg = toDeg(this.rotation.y);
    const pitchS = Math.max(-18e8, Math.min(18e8, Math.round(pitchDeg * SCALE)));
    const yawS = Math.max(-18e8, Math.min(18e8, Math.round(yawDeg * SCALE)));
    const rotDirty = pitchS !== this._lastPitchS || yawS !== this._lastYawS;
    const posDirty = this.center.x !== this._lastCenterX || this.center.y !== this._lastCenterY || this.center.z !== this._lastCenterZ;
    if (!rotDirty && !posDirty) return;
    if (rotDirty) {
      this._lastPitchS = pitchS;
      this._lastYawS = yawS;
    }
    if (posDirty) {
      this._lastCenterX = this.center.x;
      this._lastCenterY = this.center.y;
      this._lastCenterZ = this.center.z;
    }
    for (const child of this.children) {
      if (!child.entity.isValid) continue;
      if (posDirty) {
        child.entity.teleport({
          x: this.center.x,
          y: this.center.y,
          z: this.center.z
        });
      }
      if (rotDirty) {
        child.entity.setProperty("gaiadimension:tumble_a", pitchS);
        child.entity.setProperty("gaiadimension:tumble_b", yawS);
      }
    }
  }
  destroy() {
    this.removeBarriers();
    for (const child of this.children) {
      if (child.entity.isValid) child.entity.triggerEvent("gaiadimension:despawn");
    }
    this.children = [];
  }
  // ══════════════════════════════════════════════════════════════════
  //  Phantom Slope Collision — Engine-native collision for resting
  //  contraptions using invisible blocks with multi-box collision.
  //
  //  COORDINATE SYSTEM: Bedrock uses LEFT-HANDED rotation.
  //  Ry (yaw): x2 = rx*cos(w) - z1*sin(w)   (MINUS sin)
  //            z2 = rx*sin(w) + z1*cos(w)   (PLUS sin)
  //  This matches rotateRel() above.
  // ══════════════════════════════════════════════════════════════════
  /**
   * Place invisible phantom slope blocks at each child's resting grid position.
   * The slope angle and direction are derived from the contraption's rotation.
   */
  placeBarriers() {
    if (this._barriersPlaced) return;
    const pitch = this.rotation.x;
    const yaw = this.rotation.y;
    const absPitchDeg = Math.abs(pitch * 180 / Math.PI) % 180;
    const clampedDeg = Math.min(absPitchDeg, 89.3);
    const slopeIdx = Math.round(clampedDeg / 89.3 * (SLOPE_ANGLE_STEPS - 1));
    let yawNorm = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const pitchSign = pitch >= 0 ? 0 : 2;
    const octant = Math.round(yawNorm / (Math.PI / 2)) % 4;
    const dirIdx = (octant + pitchSign) % 4;
    const useFullBlock = slopeIdx <= 1;
    const targets = [];
    for (const child of this.children) {
      if (!child.entity.isValid) continue;
      const rot = rotateRel2(child.relPos, pitch, yaw);
      const vx = this.center.x + rot.x;
      const vy = this.center.y + VISUAL_Y_OFFSET + rot.y;
      const vz = this.center.z + rot.z;
      const wx = Math.floor(vx);
      const wy = Math.floor(vy);
      const wz = Math.floor(vz);
      targets.push({ wx, wy, wz });
    }
    let maxPhantomY = -Infinity;
    for (const t of targets) {
      if (t.wy > maxPhantomY) maxPhantomY = t.wy;
    }
    const safeY = maxPhantomY + 1;
    for (const player of world25.getAllPlayers()) {
      if (!player.isValid) continue;
      if (player.dimension.id !== this.dimension.id) continue;
      const px = player.location.x;
      const py = player.location.y;
      const pz = player.location.z;
      for (const t of targets) {
        const overlapX = px + 0.3 > t.wx && px - 0.3 < t.wx + 1;
        const overlapZ = pz + 0.3 > t.wz && pz - 0.3 < t.wz + 1;
        const overlapY = py + 1.8 > t.wy && py < t.wy + 1;
        if (overlapX && overlapY && overlapZ) {
          try {
            player.teleport({ x: px, y: safeY, z: pz });
          } catch {
          }
          break;
        }
      }
    }
    for (const t of targets) {
      try {
        const block = this.dimension.getBlock({ x: t.wx, y: t.wy, z: t.wz });
        if (!block) continue;
        if (!block.isAir && !block.isLiquid) continue;
        if (useFullBlock) {
          block.setType(PHANTOM_FULL);
        } else {
          const slopeBlockId = PHANTOM_SLOPE_IDS[dirIdx];
          const slopeHi = Math.floor(slopeIdx / 16);
          const slopeLo = slopeIdx % 16;
          const perm = BlockPermutation15.resolve(slopeBlockId, {
            "gaiadimension:slope_hi": slopeHi,
            "gaiadimension:slope_lo": slopeLo
          });
          block.setPermutation(perm);
        }
        this._barrierPositions.push({ x: t.wx, y: t.wy, z: t.wz });
      } catch (e) {
        console.error(`[Contraption] placeBarriers ERROR at ${t.wx},${t.wy},${t.wz}: ${e}`);
      }
    }
    this._barriersPlaced = true;
  }
  /**
   * Remove all placed phantom collision blocks (set back to air).
   */
  removeBarriers() {
    if (!this._barriersPlaced || this._barrierPositions.length === 0) {
      this._barriersPlaced = false;
      return;
    }
    for (const pos of this._barrierPositions) {
      try {
        const block = this.dimension.getBlock(pos);
        if (!block) continue;
        const id = block.typeId;
        if (id === PHANTOM_FULL || id === PHANTOM_SLOPE_IDS[0] || id === PHANTOM_SLOPE_IDS[1] || id === PHANTOM_SLOPE_IDS[2] || id === PHANTOM_SLOPE_IDS[3]) {
          block.setType("minecraft:air");
        }
      } catch {
      }
    }
    console.log(`[Contraption] Removed ${this._barrierPositions.length} phantom collision blocks`);
    this._barrierPositions = [];
    this._barriersPlaced = false;
  }
  prune() {
    this.children = this.children.filter((ch) => ch.entity.isValid);
    return this.children.length > 0;
  }
};
var ContraptionManager = class {
  static active = /* @__PURE__ */ new Map();
  static get(id) {
    return this.active.get(id);
  }
  static has(id) {
    return this.active.has(id);
  }
  static delete(id) {
    this.active.delete(id);
  }
  static register(id, body) {
    this.active.set(id, body);
    const tickCallback = system30.runInterval(() => {
      if (!body.prune()) {
        system30.clearRun(body.tickCallback);
        body.destroy();
        for (const [k, v] of this.active) {
          if (v === body) this.active.delete(k);
        }
        return;
      }
      if (body.state === "held") {
        const p = world25.getAllPlayers().find((pl) => pl.id === body.holderId);
        if (!p) {
          body.state = "thrown";
          this.active.delete(body.holderId);
          this.active.set("thrown_" + Date.now(), body);
          return;
        }
        const headLoc = p.getHeadLocation();
        const viewDir = p.getViewDirection();
        const targetX = headLoc.x + viewDir.x * body.config.holdDistance;
        const targetY = headLoc.y + viewDir.y * body.config.holdDistance;
        const targetZ = headLoc.z + viewDir.z * body.config.holdDistance;
        body.center = { x: targetX, y: targetY, z: targetZ };
        body.rotation = { x: 0, y: 0, z: 0 };
        body._syncProperties();
      } else if (body.state === "thrown" || body.state === "resting") {
        body.physicsTick();
      }
    }, 1);
    body.tickCallback = tickCallback;
  }
  static findNearby(position, maxDistance = 8) {
    for (const [key, body] of this.active) {
      if (body.state !== "thrown" && body.state !== "resting") continue;
      const dx = position.x - body.center.x;
      const dy = position.y - body.center.y;
      const dz = position.z - body.center.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < maxDistance) {
        return { key, body };
      }
    }
    return void 0;
  }
};

// src/main/bedrock/ts/items/MagicStaff.ts
function registerMagicStaffComponent({ itemComponentRegistry }) {
  itemComponentRegistry.registerCustomComponent("gaiadimension:magic_staff", {
    onUse: (event) => {
      const { source: player, itemStack } = event;
      if (!(player instanceof Player25) || !itemStack) return;
      const idParts = itemStack.typeId.split("_");
      if (idParts.length < 4) return;
      const elementStr = idParts[2];
      const behaviorStr = idParts[3];
      const elementMap = {
        "physical": 0 /* PHYSICAL */,
        "fire": 1 /* FIRE */,
        "electric": 2 /* ELECTRIC */,
        "poison": 3 /* POISON */,
        "frost": 4 /* FROST */,
        "magic": 5 /* MAGIC */,
        "energy": 6 /* ENERGY */
      };
      const behaviorMap = {
        "basic": 0 /* BASIC */,
        "blast": 1 /* BLAST */,
        "burst": 2 /* BURST */,
        "linger": 3 /* LINGER */,
        "ricochet": 4 /* RICOCHET */,
        "scatter": 5 /* SCATTER */
      };
      const element = elementMap[elementStr] ?? 0 /* PHYSICAL */;
      const behavior = behaviorMap[behaviorStr] ?? 0 /* BASIC */;
      const stat = idParts[4];
      if (stat === "force") {
        if (player.isSneaking) {
          handleForceGrab(player);
          return;
        } else if (ContraptionManager.has(player.id)) {
          handleForceThrow(player);
          return;
        }
      }
      const viewDir = player.getViewDirection();
      const spawnLoc = {
        x: player.location.x + viewDir.x * 1.5,
        y: player.getHeadLocation().y + viewDir.y * 1.5,
        z: player.location.z + viewDir.z * 1.5
      };
      if (behavior === 5 /* SCATTER */) {
        for (let i = -1; i <= 1; i++) {
          const angle = i * 0.2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const scatterDir = {
            x: viewDir.x * cos - viewDir.z * sin,
            y: viewDir.y,
            z: viewDir.x * sin + viewDir.z * cos
          };
          spawnProjectile(player, spawnLoc, scatterDir, element, behavior);
        }
      } else {
        spawnProjectile(player, spawnLoc, viewDir, element, behavior);
      }
      player.dimension.playSound("random.bow", player.location, { pitch: 0.5 });
    }
  });
}
function spawnProjectile(player, location, direction, element, behavior) {
  const projectile = player.dimension.spawnEntity("gaiadimension:staff_projectile", location);
  projectile.setProperty("gaiadimension:element", element);
  projectile.setProperty("gaiadimension:behavior", behavior);
  const projectileComp = projectile.getComponent("minecraft:projectile");
  if (projectileComp) {
    projectileComp.shoot(direction);
  }
}
function handleForceGrab(player) {
  if (ContraptionManager.has(player.id)) return;
  const nearby = ContraptionManager.findNearby(player.location);
  if (nearby) {
    ContraptionManager.delete(nearby.key);
    nearby.body.hold(player);
    ContraptionManager.register(player.id, nearby.body);
    player.dimension.playSound("random.orb", player.location);
    return;
  }
  const blockHit = player.getBlockFromViewDirection({ maxDistance: 10 });
  if (!blockHit) return;
  const origin = blockHit.block.location;
  const dim = player.dimension;
  const RADIUS = 1;
  const blocks = [];
  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const b = dim.getBlock({ x: origin.x + dx, y: origin.y + dy, z: origin.z + dz });
        if (b && ContraptionScanner.isValidBlock(b)) {
          blocks.push(b);
        }
      }
    }
  }
  if (blocks.length === 0) return;
  const body = ContraptionBody.assemble(
    blocks,
    blockHit.block.location,
    dim
  );
  body.hold(player);
  ContraptionManager.register(player.id, body);
  player.dimension.playSound("random.orb", player.location);
}
function handleForceThrow(player) {
  const body = ContraptionManager.get(player.id);
  if (!body) return;
  ContraptionManager.delete(player.id);
  body.throw(player.getViewDirection());
  ContraptionManager.register("thrown_" + Date.now(), body);
  player.dimension.playSound("random.explode", player.location, { volume: 0.3 });
}

// src/main/bedrock/ts/items/GemstonePouch.ts
import { world as world28, system as system33, ItemStack as ItemStack16, EquipmentSlot as EquipmentSlot6 } from "@minecraft/server";

// src/main/bedrock/ts/API/lib/QIDB.ts
import { world as world27, system as system32 } from "@minecraft/server";
function date() {
  const date2 = new Date(Date.now());
  const ms = date2.getMilliseconds().toString().padStart(3, "0");
  return `${date2.toLocaleString().replace(" AM", `.${ms} AM`).replace(" PM", `.${ms} PM`)}`;
}
var QIDB = class {
  /**
   * @param {string} namespace The unique namespace for the database keys.
   * @param {number} cacheSize Quick the max amount of keys to keep quickly accessible. A small size can couse lag on frequent iterated usage, a large number can cause high hardware RAM usage.
   * @param {number} saveRate the background saves per tick, (high performance impact) saveRate1 is 20 keys per second
   */
  constructor(namespace = "", cacheSize = 50, saveRate = 1) {
    system32.run(() => {
      const self = this;
      this.#settings = {
        namespace
      };
      this.#queuedKeys = [];
      this.#queuedValues = [];
      this.#quickAccess = /* @__PURE__ */ new Map();
      this.#validNamespace = /^[A-Za-z0-9_]*$/.test(this.#settings.namespace);
      this.#dimension = world27.getDimension("overworld");
      this.logs;
      function startLog() {
        console.log(
          `\xA7qQIDB > is initialized successfully.\xA7r namespace: ${self.#settings.namespace} \xA7r${date()} `
        );
        if (saveRate > 1) {
          console.warn(
            `\xA7c\xA7lWARNING! 
\xA7r\xA7cQIDB > using a saveRate bigger than 1 can cause slower game ticks and extreme lag while saving 1024 size keys. at <${self.#settings.namespace}> \xA7r${date()} `
          );
          world27.getPlayers().forEach((player2) => {
            if (player2.isOp) {
              player2.sendMessage(
                `\xA7c\xA7lWARNING! 
\xA7r\xA7cQIDB > using a saveRate bigger than 1 can cause slower game ticks and extreme lag while saving 1024 size keys. at <${self.#settings.namespace}> \xA7r${date()} `
              );
            }
          });
        }
      }
      const VALID_NAMESPACE_ERROR = new Error(`\xA7cQIDB > ${namespace} isn't a valid namespace. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
      let sl = world27.scoreboard.getObjective("qidb");
      this.#sL;
      const player = world27.getPlayers()[0];
      if (!this.#validNamespace) throw VALID_NAMESPACE_ERROR;
      if (player)
        if (!sl || sl?.hasParticipant("x") === false) {
          if (!sl) sl = world27.scoreboard.addObjective("qidb");
          sl.setScore("x", player.location.x);
          sl.setScore("z", player.location.z);
          this.#sL = { x: sl.getScore("x"), y: 318, z: sl.getScore("z") };
          this.#dimension.runCommand(`/tickingarea add ${this.#sL.x} 319 ${this.#sL.z} ${this.#sL.x} 318 ${this.#sL.z} storagearea`);
          startLog();
        } else {
          this.#sL = { x: sl.getScore("x"), y: 318, z: sl.getScore("z") };
          startLog();
        }
      world27.afterEvents.playerSpawn.subscribe(({ player: player2, initialSpawn }) => {
        if (!this.#validNamespace) throw VALID_NAMESPACE_ERROR;
        if (!initialSpawn) return;
        if (!sl || sl?.hasParticipant("x") === false) {
          if (!sl) sl = world27.scoreboard.addObjective("qidb");
          sl.setScore("x", player2.location.x);
          sl.setScore("z", player2.location.z);
          this.#sL = { x: sl.getScore("x"), y: 318, z: sl.getScore("z") };
          this.#dimension.runCommand(`/tickingarea add ${this.#sL.x} 319 ${this.#sL.z} ${this.#sL.x} 318 ${this.#sL.z} storagearea`);
          startLog();
        } else {
          this.#sL = { x: sl.getScore("x"), y: 318, z: sl.getScore("z") };
          startLog();
        }
      });
      let show = true;
      let runId;
      let lastam;
      system32.runInterval(() => {
        const diff = self.#quickAccess.size - cacheSize;
        if (diff > 0) {
          for (let i = 0; i < diff; i++) {
            self.#quickAccess.delete(self.#quickAccess.keys().next()?.value);
          }
        }
        if (self.#queuedKeys.length) {
          if (!runId) {
            log();
            runId = system32.runInterval(() => {
              log();
            }, 120);
          }
          show = false;
          const k = Math.min(saveRate, this.#queuedKeys.length);
          for (let i = 0; i < k; i++) {
            this.#romSave(this.#queuedKeys[0], this.#queuedValues[0]);
            this.#queuedKeys.shift();
            this.#queuedValues.shift();
          }
        } else if (runId) {
          system32.clearRun(runId);
          runId = void 0;
          show == false && this.logs.save == true && console.log(`\xA7aQIDB >Saved, You can now close the world safely. \xA7r${date()}`);
          show = true;
          return;
        } else return;
      }, 1);
      function log() {
        const abc = (-(self.#queuedKeys.length - lastam) / 6).toFixed(0) || "//";
        self.logs.save == true && console.log(`\xA7eQIDB > Saving, Dont close the world.
\xA7r[Stats]-\xA7eRemaining: ${self.#queuedKeys.length} keys | speed: ${abc} keys/s \xA7r${date()}`);
        lastam = self.#queuedKeys.length;
      }
      system32.beforeEvents.shutdown.subscribe(() => {
        if (this.#queuedKeys.length) {
          console.error(
            `



\xA7c\xA7lQIDB > Fatal Error >\xA7r\xA7c World closed too early, items not saved correctly.  

Namespace: ${this.#settings.namespace}
Lost Keys amount: ${this.#queuedKeys.length} \xA7r${date()}



`
          );
        }
      });
    });
  }
  logs = {
    startUp: true,
    save: true,
    load: true,
    set: true,
    get: true,
    has: true,
    delete: true,
    clear: true,
    values: true,
    keys: true
  };
  #validNamespace;
  #queuedKeys;
  #settings;
  #quickAccess;
  #queuedValues;
  #dimension;
  #sL;
  #load(key, length) {
    if (key.length > 30) throw new Error(`\xA7cQIDB > Out of range: <${key}> has more than 30 characters \xA7r${date()}`);
    let canStr = false;
    try {
      world27.structureManager.place(key, this.#dimension, this.#sL, { includeEntities: true });
      canStr = true;
    } catch {
      console.log(length);
      for (let i = 0; i < length; i++)
        this.#dimension.spawnEntity("qidb:storage", this.#sL);
    }
    const entities = this.#dimension.getEntities({ location: this.#sL, type: "qidb:storage" });
    if (entities.length < length) {
      for (let i = entities.length; i < length; i++)
        entities.push(this.#dimension.spawnEntity("qidb:storage", this.#sL));
    }
    if (entities.length > length) {
      console.log("entities.length > length: ", entities.length, ">", length, entities.length > length);
      for (let i = entities.length; i > length; i--) {
        console.log("removed", i);
        entities[i - 1].remove();
        entities.pop();
      }
    }
    const invs = [];
    entities.forEach((entity) => {
      invs.push(entity.getComponent("inventory").container);
    });
    this.logs.load == true && console.log(`\xA7aQIDB > Loaded ${entities.length} entities <${key}> \xA7r${date()}`);
    return { canStr, invs };
  }
  async #save(key, canStr) {
    if (canStr) world27.structureManager.delete(key);
    world27.structureManager.createFromWorld(key, this.#dimension, this.#sL, this.#sL, { saveMode: "World", includeEntities: true });
    const entities = this.#dimension.getEntities({ location: this.#sL, type: "qidb:storage" });
    entities.forEach((e) => e.remove());
  }
  async #queueSaving(key, value) {
    this.#queuedKeys.push(key);
    this.#queuedValues.push(value);
  }
  async #romSave(key, value) {
    const { canStr, invs } = this.#load(key, Math.floor((value?.length - 1) / 256) + 1 || 1);
    invs.forEach((inv, index) => {
      if (!value) for (let i = 256 * index; i < 256 * index + 256; i++) inv.setItem(i - 256 * index, void 0), world27.setDynamicProperty(key, null);
      if (Array.isArray(value)) {
        try {
          for (let i = 256 * index; i < 256 * index + 256; i++) inv.setItem(i - 256 * index, value[i] || void 0);
        } catch {
          throw new Error(`\xA7cQIDB > Invalid value type. supported: ItemStack | ItemStack[] | undefined \xA7r${date()}`);
        }
        world27.setDynamicProperty(key, Math.floor((value?.length - 1) / 256) + 1 || 1);
      } else {
        try {
          inv.setItem(0, value), world27.setDynamicProperty(key, false);
        } catch {
          throw new Error(`\xA7cQIDB > Invalid value type. supported: ItemStack | ItemStack[] | undefined \xA7r${date()}`);
        }
      }
    });
    this.#save(key, canStr);
  }
  /**
   * Sets a value as a key in the item database.
   * @param {string} key The unique identifier of the value.
   * @param {ItemStack[] | ItemStack} value The `ItemStack[]` or `itemStack` value to set.
   * @throws Throws if `value` is an array that has more than 512 items.
   */
  set(key, value) {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`\xA7cQIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    key = this.#settings.namespace + ":" + key;
    if (Array.isArray(value)) {
      if (value.length > 1024) throw new Error(`\xA7cQIDB > Out of range: <${key}> has more than 1024 ItemStacks \xA7r${date()}`);
      world27.setDynamicProperty(key, Math.floor((value?.length - 1) / 256) + 1 || 1);
    } else {
      world27.setDynamicProperty(key, false);
    }
    this.#quickAccess.set(key, value);
    if (this.#queuedKeys.includes(key)) {
      const i = this.#queuedKeys.indexOf(key);
      this.#queuedValues.splice(i, 1);
      this.#queuedKeys.splice(i, 1);
    }
    this.#queueSaving(key, value);
    this.logs.set == true && console.log(`\xA7aQIDB > Set key <${key}> succesfully. ${Date.now() - time}ms \xA7r${date()}`);
  }
  /**
   * Gets the value of a key from the item database.
   * @param {string} key The identifier of the value.
   * @returns {ItemStack | ItemStack[]} The `ItemStack` | `ItemStack[]` saved as `key`
   * @throws Throws if the key doesn't exist.
   */
  get(key) {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`\xA7cQIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    key = this.#settings.namespace + ":" + key;
    if (this.#quickAccess.has(key)) {
      this.logs.get == true && console.log(`\xA7aQIDB > Got key <${key}> succesfully. ${Date.now() - time}ms \xA7r${date()}`);
      return this.#quickAccess.get(key);
    }
    const structure = world27.structureManager.get(key);
    if (!structure) throw new Error(`\xA7cQIDB > The key < ${key} > doesn't exist.`);
    const { canStr, invs } = this.#load(key);
    const items = [];
    invs.forEach((inv, index) => {
      for (let i = 256 * index; i < 256 * index + 256; i++) items.push(inv.getItem(i - 256 * index));
      for (let i = 256 * index + 255; i >= 0; i--) if (!items[i]) items.pop();
      else break;
    });
    this.#save(key, canStr);
    this.logs.get == true && console.log(`\xA7aQIDB > Got items from <${key}> succesfully. ${Date.now() - time}ms \xA7r${date()}`);
    if (world27.getDynamicProperty(key)) {
      this.#quickAccess.set(key, items);
      return items;
    } else {
      this.#quickAccess.set(key, items[0]);
      return items[0];
    }
  }
  /**
   * Checks if a key exists in the item database.
   * @param {string} key The identifier of the value.
   * @returns {boolean}`true` if the key exists, `false` if the key doesn't exist.
   */
  has(key) {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`\xA7cQIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    key = this.#settings.namespace + ":" + key;
    const exist = this.#quickAccess.has(key) || world27.structureManager.get(key);
    this.logs.has == true && console.log(`\xA7aQIDB > Found key <${key}> succesfully. ${Date.now() - time}ms \xA7r${date()}`);
    if (exist) return true;
    else return false;
  }
  /**
   * Deletes a key from the item database.
   * @param {string} key The identifier of the value.
                  * @throws Throws if the key doesn't exist.
                  */
  delete(key) {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    if (!/^[A-Za-z0-9_]*$/.test(key)) throw new Error(`\xA7cQIDB > Invalid name: <${key}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    key = this.#settings.namespace + ":" + key;
    if (this.#quickAccess.has(key)) this.#quickAccess.delete(key);
    const structure = world27.structureManager.get(key);
    if (structure) world27.structureManager.delete(key), world27.setDynamicProperty(key, null);
    else throw new Error(`\xA7cQIDB > The key <${key}> doesn't exist. \xA7r${date()}`);
    this.logs.delete == true && console.log(`\xA7aQIDB > Deleted key <${key}> succesfully. ${Date.now() - time}ms \xA7r${date()}`);
  }
  /**
   * Gets all the keys of your namespace from item database.
   * @return {string[]} All the keys as an array of strings.
                      */
  keys() {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const allIds = world27.getDynamicPropertyIds();
    const ids = [];
    allIds.filter((id) => id.startsWith(this.#settings.namespace + ":")).forEach((id) => ids.push(id.replace(this.#settings.namespace + ":", "")));
    this.logs.keys == true && console.log(`\xA7aQIDB > Got the list of all the ${ids.length} keys. \xA7r${date()}`);
    return ids;
  }
  /**
   * Gets all the keys of your namespace from item database (takes some time if values aren't alredy loaded in quickAccess).
   * @return {ItemStack[][]} All the values as an array of ItemStack or ItemStack[].
                          */
  values() {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    const allIds = world27.getDynamicPropertyIds();
    const values = [];
    const filtered = allIds.filter((id) => id.startsWith(this.#settings.namespace + ":")).map((id) => id.replace(this.#settings.namespace + ":", ""));
    for (const key of filtered) {
      values.push(this.get(key));
    }
    this.logs.values == true && console.log(`\xA7aQIDB > Got the list of all the ${values.length} values. ${Date.now() - time}ms \xA7r${date()}`);
    return values;
  }
  /**
   * Clears all, CAN NOT REWIND.
   */
  clear() {
    if (!this.#validNamespace) throw new Error(`\xA7cQIDB > Invalid name: <${this.#settings.namespace}>. accepted char: A-Z a-z 0-9 _ \xA7r${date()}`);
    const time = Date.now();
    const allIds = world27.getDynamicPropertyIds();
    const filtered = allIds.filter((id) => id.startsWith(this.#settings.namespace + ":")).map((id) => id.replace(this.#settings.namespace + ":", ""));
    for (const key of filtered) {
      this.delete(key);
    }
    this.logs.clear == true && console.log(`\xA7aQIDB > Cleared, deleted ${filtered.length} values. ${Date.now() - time}ms \xA7r${date()}`);
  }
};

// src/main/bedrock/ts/items/GemstonePouch.ts
var UI_ROUTING_NAME = `\xA7${"gem_pouch".split("").join("\xA7")}`;
var ALLOWED_GEMS = /* @__PURE__ */ new Set([
  "gaiadimension:sugilite",
  "gaiadimension:hematite",
  "gaiadimension:cinnabar",
  "gaiadimension:labradorite",
  "gaiadimension:moonstone",
  "gaiadimension:red_opal",
  "gaiadimension:blue_opal",
  "gaiadimension:green_opal",
  "gaiadimension:white_opal",
  "gaiadimension:stibnite",
  "gaiadimension:proustite",
  "gaiadimension:euclase",
  "gaiadimension:albite",
  "gaiadimension:carnelian",
  "gaiadimension:benitoite",
  "gaiadimension:diopside",
  "gaiadimension:goshenite",
  "gaiadimension:pyrite",
  "gaiadimension:tektite",
  "gaiadimension:goldstone",
  "gaiadimension:aura_cluster",
  "gaiadimension:bismuth_crystal",
  "gaiadimension:opalite",
  "gaiadimension:celestine"
]);
var MAX_STACK_PER_SLOT = 16;
var POUCH_ENTITY_ID = "gaiadimension:gem_pouch_container";
var pouchDB = new QIDB("g_pouch", 50, 1);
var activePouches = /* @__PURE__ */ new Map();
function getPouchId(itemStack) {
  const lore = itemStack.getLore();
  let existingId = null;
  let loreIndex = -1;
  for (let i = 0; i < lore.length; i++) {
    if (lore[i].startsWith("\xA7r\xA70pouch:")) {
      existingId = lore[i].substring("\xA7r\xA70pouch:".length);
      loreIndex = i;
      break;
    }
  }
  if (existingId && existingId.length <= 12) {
    return existingId;
  }
  const id = Math.random().toString(36).substring(2, 10);
  const newLore = [...lore];
  if (loreIndex >= 0) {
    newLore[loreIndex] = `\xA7r\xA70pouch:${id}`;
  } else {
    newLore.push(`\xA7r\xA70pouch:${id}`);
  }
  itemStack.setLore(newLore);
  return id;
}
function savePouchContents(pouchId, container) {
  const items = [];
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item) {
      items[i] = item;
    }
  }
  try {
    pouchDB.set(pouchId, items);
  } catch (e) {
    console.warn(`[GemPouch] Failed to save QIDB for ${pouchId}: ${e}`);
  }
}
function loadPouchContents(pouchId, container) {
  if (!pouchDB.has(pouchId)) return;
  try {
    const items = pouchDB.get(pouchId);
    if (Array.isArray(items)) {
      for (let i = 0; i < container.size; i++) {
        if (items[i]) {
          container.setItem(i, items[i]);
        }
      }
    }
  } catch (e) {
    console.warn(`[GemPouch] Failed to load QIDB for ${pouchId}: ${e}`);
  }
}
function cleanupPouch(playerId) {
  const pouch = activePouches.get(playerId);
  if (!pouch) return;
  try {
    if (pouch.entity.isValid) {
      const invComp = pouch.entity.getComponent("minecraft:inventory");
      if (invComp && invComp.container) {
        savePouchContents(pouch.pouchId, invComp.container);
      }
      pouch.entity.remove();
    }
  } catch (e) {
    console.warn(`[GemPouch] Error cleaning up pouch entity: ${e}`);
  }
  activePouches.delete(playerId);
}
var spawnCooldown = /* @__PURE__ */ new Map();
world28.beforeEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (itemStack.typeId !== "gaiadimension:gem_pouch") return;
  const pid = player.id;
  const currentTick = system33.currentTick || 0;
  const lastSpawn = spawnCooldown.get(pid) || 0;
  if (currentTick - lastSpawn < 10) return;
  spawnCooldown.set(pid, currentTick);
  system33.run(() => {
    const pouch = activePouches.get(pid);
    if (pouch) cleanupPouch(pid);
    const pouchId = getPouchId(itemStack);
    const headLoc = player.getHeadLocation();
    const view = player.getViewDirection();
    const entity = player.dimension.spawnEntity(POUCH_ENTITY_ID, {
      x: headLoc.x + view.x * 1.5,
      y: headLoc.y + view.y * 1.5 - 1.25,
      z: headLoc.z + view.z * 1.5
    });
    entity.nameTag = UI_ROUTING_NAME;
    entity.setDynamicProperty("pouchId", pouchId);
    entity.setDynamicProperty("ownerId", pid);
    entity.addEffect("invisibility", 999999, { showParticles: false });
    const invComp = entity.getComponent("minecraft:inventory");
    if (invComp && invComp.container) {
      loadPouchContents(pouchId, invComp.container);
    }
    activePouches.set(pid, { entity, pouchId });
  });
});
system33.runInterval(() => {
  for (const player of world28.getAllPlayers()) {
    try {
      const pid = player.id;
      const equippable = player.getComponent("minecraft:equippable");
      if (!equippable) continue;
      const mainhand = equippable.getEquipment(EquipmentSlot6.Mainhand);
      const isHoldingPouch = mainhand && mainhand.typeId === "gaiadimension:gem_pouch";
      const pouch = activePouches.get(pid);
      if (isHoldingPouch) {
        const pouchId = getPouchId(mainhand);
        const currentLore = mainhand.getLore();
        if (!currentLore.some((l) => l.startsWith("A rA 0pouch:"))) {
          equippable.setEquipment(EquipmentSlot6.Mainhand, mainhand);
        }
        if (pouch && pouch.pouchId !== pouchId) {
          cleanupPouch(pid);
        }
        if (pouch && pouch.entity.isValid) {
          const dx = player.location.x - pouch.entity.location.x;
          const dy = player.location.y - pouch.entity.location.y;
          const dz = player.location.z - pouch.entity.location.z;
          if (dx * dx + dy * dy + dz * dz > 64) {
            cleanupPouch(pid);
          }
        }
      } else {
        if (pouch) {
          cleanupPouch(pid);
        }
      }
    } catch (e) {
      console.warn(`[GemPouch] Error in tracker for ${player.name}: ${e}`);
    }
  }
}, 2);
system33.runInterval(() => {
  for (const [playerId, pouch] of activePouches) {
    const { entity } = pouch;
    if (!entity || !entity.isValid) continue;
    try {
      const invComp = entity.getComponent("minecraft:inventory");
      if (!invComp || !invComp.container) continue;
      const container = invComp.container;
      for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item) continue;
        if (!ALLOWED_GEMS.has(item.typeId)) {
          container.setItem(i, void 0);
          try {
            for (const player of world28.getAllPlayers()) {
              if (player.id === playerId) {
                const pInv = player.getComponent("minecraft:inventory")?.container;
                if (pInv) {
                  for (let j = 0; j < pInv.size; j++) {
                    if (!pInv.getItem(j)) {
                      pInv.setItem(j, item);
                      break;
                    }
                  }
                }
                break;
              }
            }
          } catch (e) {
          }
        }
        if (item.amount > MAX_STACK_PER_SLOT) {
          const overflow = item.amount - MAX_STACK_PER_SLOT;
          container.setItem(i, new ItemStack16(item.typeId, MAX_STACK_PER_SLOT));
          try {
            const overflowItem = new ItemStack16(item.typeId, overflow);
            for (const player of world28.getAllPlayers()) {
              if (player.id === playerId) {
                const pInv = player.getComponent("minecraft:inventory")?.container;
                if (pInv) {
                  for (let j = 0; j < pInv.size; j++) {
                    if (!pInv.getItem(j)) {
                      pInv.setItem(j, overflowItem);
                      break;
                    }
                  }
                }
                break;
              }
            }
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
  }
}, 5);
world28.afterEvents.playerLeave?.subscribe((event) => {
  cleanupPouch(event.playerId);
});

// src/main/bedrock/ts/systems/MagicStaffBehaviors.ts
import { world as world29, system as system34, MolangVariableMap, Direction as Direction3 } from "@minecraft/server";
var projectileCache = /* @__PURE__ */ new Map();
var activeProjectiles = /* @__PURE__ */ new Set();
var ELEMENT_COLORS = {
  [0 /* PHYSICAL */]: { r: 1, g: 1, b: 1 },
  [1 /* FIRE */]: { r: 1, g: 0.4, b: 0.4 },
  [2 /* ELECTRIC */]: { r: 1, g: 1, b: 0.4 },
  [3 /* POISON */]: { r: 0.6, g: 1, b: 0.2 },
  [4 /* FROST */]: { r: 0.4, g: 0.8, b: 1 },
  [5 /* MAGIC */]: { r: 1, g: 0.6, b: 1 },
  [6 /* ENERGY */]: { r: 0.6, g: 0.4, b: 0.8 }
};
function initializeMagicStaffBehaviors() {
  world29.afterEvents.entitySpawn.subscribe((event) => {
    if (event.entity.typeId === "gaiadimension:staff_projectile") {
      activeProjectiles.add(event.entity.id);
    }
  });
  system34.runInterval(() => {
    if (activeProjectiles.size === 0) return;
    for (const id of activeProjectiles) {
      const entity = world29.getEntity(id);
      if (!entity || !entity.isValid) {
        activeProjectiles.delete(id);
        continue;
      }
      try {
        const vel = entity.getVelocity();
        if (vel.x !== 0 || vel.y !== 0 || vel.z !== 0 || !projectileCache.has(id)) {
          projectileCache.set(id, {
            velocity: vel,
            element: entity.getProperty("gaiadimension:element") ?? 0,
            behavior: entity.getProperty("gaiadimension:behavior") ?? 0,
            bounceCount: entity.getProperty("gaiadimension:bounce_count") ?? 0,
            dimensionId: entity.dimension.id
          });
        }
      } catch (e) {
        activeProjectiles.delete(id);
      }
    }
    if (system34.currentTick % 200 === 0) {
      for (const id of projectileCache.keys()) {
        if (!activeProjectiles.has(id) && !world29.getEntity(id)) {
          projectileCache.delete(id);
        }
      }
    }
  }, 1);
  world29.afterEvents.projectileHitBlock.subscribe((event) => {
    if (event.projectile.typeId !== "gaiadimension:staff_projectile") return;
    const data = projectileCache.get(event.projectile.id);
    if (data) {
      handleHit(event.projectile, data, event.location, event.face);
      activeProjectiles.delete(event.projectile.id);
      projectileCache.delete(event.projectile.id);
    }
  });
  world29.afterEvents.projectileHitEntity.subscribe((event) => {
    if (event.projectile.typeId !== "gaiadimension:staff_projectile") return;
    const data = projectileCache.get(event.projectile.id);
    if (data) {
      handleHit(event.projectile, data, event.location);
      activeProjectiles.delete(event.projectile.id);
      projectileCache.delete(event.projectile.id);
    }
  });
}
function handleHit(projectile, data, location, face) {
  const { element, behavior, bounceCount, velocity } = data;
  if (behavior === 4 /* RICOCHET */ && face && bounceCount > 0) {
    const newVel = { x: velocity.x, y: velocity.y, z: velocity.z };
    if (face === Direction3.North || face === Direction3.South) newVel.z *= -1;
    if (face === Direction3.East || face === Direction3.West) newVel.x *= -1;
    if (face === Direction3.Up || face === Direction3.Down) newVel.y *= -1;
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
    const currentSpeed = Math.sqrt(newVel.x ** 2 + newVel.y ** 2 + newVel.z ** 2);
    if (currentSpeed > 0) {
      const ratio = speed / currentSpeed;
      newVel.x *= ratio;
      newVel.y *= ratio;
      newVel.z *= ratio;
    }
    const offsetLoc = {
      x: location.x + (face === Direction3.East ? 0.1 : face === Direction3.West ? -0.1 : 0),
      y: location.y + (face === Direction3.Up ? 0.1 : face === Direction3.Down ? -0.1 : 0),
      z: location.z + (face === Direction3.South ? 0.1 : face === Direction3.North ? -0.1 : 0)
    };
    try {
      const newProj = projectile.dimension.spawnEntity("gaiadimension:staff_projectile", offsetLoc);
      newProj.setProperty("gaiadimension:element", element);
      newProj.setProperty("gaiadimension:behavior", 4 /* RICOCHET */);
      newProj.setProperty("gaiadimension:bounce_count", bounceCount - 1);
      const projComp = newProj.getComponent("minecraft:projectile");
      if (projComp) projComp.shoot(newVel);
      projectile.dimension.playSound("random.bowhit", location, { pitch: 1.2 });
    } catch (e) {
    }
    return;
  }
  try {
    projectile.dimension.playSound("random.glass", location, { pitch: 1.5, volume: 0.5 });
    const color = ELEMENT_COLORS[element] || ELEMENT_COLORS[0 /* PHYSICAL */];
    const vars = new MolangVariableMap();
    vars.setFloat("variable.color_r", color.r);
    vars.setFloat("variable.color_g", color.g);
    vars.setFloat("variable.color_b", color.b);
    projectile.dimension.spawnParticle("gaiadimension:staff_shatter_particle", location, vars);
  } catch (e) {
  }
  switch (behavior) {
    case 1 /* BLAST */:
      try {
        projectile.dimension.createExplosion(location, 2, { breaksBlocks: false, causesFire: false });
      } catch (e) {
      }
      break;
    case 2 /* BURST */:
      const dirs = [{ x: 1, y: 0.5, z: 0 }, { x: -1, y: 0.5, z: 0 }, { x: 0, y: 0.5, z: 1 }, { x: 0, y: 0.5, z: -1 }];
      for (const d of dirs) {
        try {
          const sub = projectile.dimension.spawnEntity("gaiadimension:staff_projectile", location);
          sub.setProperty("gaiadimension:element", element);
          sub.setProperty("gaiadimension:behavior", 0 /* BASIC */);
          const projComp = sub.getComponent("minecraft:projectile");
          if (projComp) projComp.shoot(d);
        } catch (e) {
        }
      }
      break;
    case 3 /* LINGER */:
      try {
        projectile.dimension.spawnEntity("minecraft:area_effect_cloud", location);
      } catch (e) {
      }
      break;
  }
}

// src/main/bedrock/ts/blocks/GlitterGrassSync.ts
import { world as world30, system as system35, ItemStack as ItemStack17 } from "@minecraft/server";
var GLITTER_GRASS_TYPES = [
  "gaiadimension:green_glitter_grass",
  "gaiadimension:pink_glitter_grass",
  "gaiadimension:orange_glitter_grass",
  "gaiadimension:purple_glitter_grass",
  "gaiadimension:peach_glitter_grass",
  "gaiadimension:blue_glitter_grass",
  "gaiadimension:pale_green_glitter_grass"
];
var BIOME_TO_GRASS = {
  "green_agate_jungle": "gaiadimension:green_glitter_grass",
  "crystal_plains": "gaiadimension:pink_glitter_grass",
  "mutant_agate_wildwood": "gaiadimension:orange_glitter_grass",
  "purple_agate_swamp": "gaiadimension:purple_glitter_grass",
  "pink_agate_forest": "gaiadimension:peach_glitter_grass",
  "blue_agate_taiga": "gaiadimension:blue_glitter_grass",
  "fossil_woodland": "gaiadimension:pale_green_glitter_grass"
};
function syncInventory(player) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return;
  const biome = DimensionSystem.getBiome(player);
  const targetGrassId = BIOME_TO_GRASS[biome];
  if (!targetGrassId) return;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && GLITTER_GRASS_TYPES.includes(item.typeId) && item.typeId !== targetGrassId) {
      const newItem = new ItemStack17(targetGrassId, item.amount);
      inventory.setItem(i, newItem);
    }
  }
}
function initializeGlitterGrassSync() {
  world30.afterEvents.playerPlaceBlock.subscribe((event) => {
    const { block } = event;
    if (GLITTER_GRASS_TYPES.includes(block.typeId)) {
      const biome = DimensionSystem.getBiomeAt(block.dimension, block.location);
      const targetGrassId = BIOME_TO_GRASS[biome];
      if (targetGrassId && block.typeId !== targetGrassId) {
        system35.run(() => {
          if (block.isValid) {
            block.setType(targetGrassId);
          }
        });
      }
    }
  });
  system35.runInterval(() => {
    for (const player of world30.getAllPlayers()) {
      if (DimensionSystem.isInGaia(player)) {
        syncInventory(player);
      }
    }
  }, 40);
  world30.afterEvents.playerInventoryItemChange.subscribe((event) => {
    const { player } = event;
    if (DimensionSystem.isInGaia(player)) {
      syncInventory(player);
    }
  });
}

// src/main/bedrock/ts/API/lib/EnchantmentLib.ts
import { world as world31, system as system36, EquipmentSlot as EquipmentSlot7, GameMode as GameMode5 } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
var ScoreboardBitPack = class {
  static CATEGORY_BITS = {
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
    armor: 1 << 3 | 1 << 4 | 1 << 5 | 1 << 6,
    tools: 1 << 7 | 1 << 8 | 1 << 9 | 1 << 10,
    weapons: 1 << 0 | 1 << 1 | 1 << 2 | 1 << 11,
    all: 4095
  };
  static categoriesToMask(categories) {
    if (!categories || !Array.isArray(categories) || categories.length === 0) return 4095;
    let mask = 0;
    for (const cat of categories) {
      const clean = (cat || "").toLowerCase().trim();
      if (clean === "armor") {
        mask |= this.CATEGORY_BITS.armor;
      } else if (clean === "tool" || clean === "tools") {
        mask |= this.CATEGORY_BITS.tools;
      } else if (clean === "weapon" || clean === "weapons") {
        mask |= this.CATEGORY_BITS.weapons;
      } else if (this.CATEGORY_BITS[clean] !== void 0) {
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
    return mask || 4095;
  }
  static maskToCategories(mask) {
    const result = [];
    if ((mask & 4095) === 4095) return ["all"];
    const bitMap = [
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
  static packEnchant(maxLevel = 1, costMultiplier = 3, appliesTo = [], flags = 0) {
    const clampedLvl = Math.max(1, Math.min(15, maxLevel || 1));
    const clampedCost = Math.max(1, Math.min(63, costMultiplier || 3));
    const catMask = this.categoriesToMask(appliesTo);
    const clampedFlags = Math.max(0, Math.min(255, flags || 0));
    return clampedLvl & 15 | (clampedCost & 63) << 4 | (catMask & 4095) << 10 | (clampedFlags & 255) << 22;
  }
  static unpackEnchant(score) {
    if (typeof score !== "number" || isNaN(score)) {
      return { maxLevel: 1, costMultiplier: 3, appliesTo: ["all"], flags: 0 };
    }
    const maxLevel = score & 15 || 1;
    const costMultiplier = score >> 4 & 63 || 3;
    const catMask = score >> 10 & 4095;
    const flags = score >> 22 & 255;
    const appliesTo = this.maskToCategories(catMask);
    return { maxLevel, costMultiplier, appliesTo, flags };
  }
  static packChars(chars) {
    let packed = 0;
    for (let i = 0; i < Math.min(4, chars.length); i++) {
      const code = chars.charCodeAt(i) & 127;
      packed |= code << i * 7;
    }
    return packed;
  }
  static unpackChars(score) {
    let result = "";
    for (let i = 0; i < 4; i++) {
      const code = score >> i * 7 & 127;
      if (code > 0) result += String.fromCharCode(code);
    }
    return result;
  }
  static setScoreboardData(key, value, objective = "ench_data") {
    const cleanKey = key.startsWith("#") ? key : `#${key}`;
    try {
      let obj = world31.scoreboard.getObjective(objective);
      if (!obj) {
        try {
          obj = world31.scoreboard.addObjective(objective, objective);
        } catch (e) {
          try {
            const dim2 = world31.getDimension("overworld");
            dim2?.runCommand?.(`scoreboard objectives add ${objective} dummy`);
            obj = world31.scoreboard.getObjective(objective);
          } catch (e2) {
          }
        }
      }
      if (obj) {
        try {
          obj.setScore(cleanKey, value);
        } catch (e) {
        }
      }
      const dim = world31.getDimension("overworld");
      dim?.runCommand?.(`scoreboard players set ${cleanKey} ${objective} ${value}`);
    } catch (err) {
    }
  }
  static getScoreboardData(key, objective = "ench_data") {
    const cleanKey = key.startsWith("#") ? key : `#${key}`;
    try {
      const obj = world31.scoreboard.getObjective(objective);
      if (obj) {
        const score = obj.getScore(cleanKey);
        if (typeof score === "number") return score;
      }
    } catch (err) {
    }
    return null;
  }
};
var EnchantmentManager = class {
  constructor() {
    this.registry = /* @__PURE__ */ new Map();
    this.uiCooldowns = /* @__PURE__ */ new Map();
    this.playerActiveEnchants = /* @__PURE__ */ new Map();
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
    if (!this.namespace && id.includes(":")) {
      this.namespace = id.split(":")[0];
    }
    const clean = this.cleanId(id);
    const maxLevel = typeof config.maxLevel === "number" && config.maxLevel > 0 ? config.maxLevel : 1;
    const costMultiplier = typeof config.costMultiplier === "number" && config.costMultiplier > 0 ? config.costMultiplier : typeof config.costPerLevel === "function" ? config.costPerLevel(1) : 3;
    const appliesTo = Array.isArray(config.appliesTo) ? config.appliesTo : [];
    const costPerLevel = typeof config.costPerLevel === "function" ? config.costPerLevel : ((lvl) => lvl * costMultiplier);
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
    this.registry.set(clean, entry);
    if (id !== clean) {
      this.registry.set(id, entry);
    }
    system36.run(() => {
      try {
        const packedScore = ScoreboardBitPack.packEnchant(
          maxLevel,
          costMultiplier,
          appliesTo,
          0
        );
        const fakePlayer = `#${clean}`;
        let metaObj = world31.scoreboard.getObjective("ench_meta");
        if (!metaObj) {
          try {
            metaObj = world31.scoreboard.addObjective("ench_meta", "Enchantment Metadata");
          } catch (e) {
            try {
              const dim = world31.getDimension("overworld");
              dim?.runCommand?.("scoreboard objectives add ench_meta dummy");
              metaObj = world31.scoreboard.getObjective("ench_meta");
            } catch (e2) {
            }
          }
        }
        if (metaObj) {
          try {
            metaObj.setScore(fakePlayer, packedScore);
          } catch (e) {
          }
        }
        try {
          const dim = world31.getDimension("overworld");
          dim?.runCommand?.(`scoreboard players set ${fakePlayer} ench_meta ${packedScore}`);
        } catch (e) {
        }
        let reg = world31.scoreboard.getObjective("ench_reg");
        if (!reg) {
          try {
            reg = world31.scoreboard.addObjective("ench_reg", "Enchantment Registry");
          } catch (e) {
            try {
              const dim = world31.getDimension("overworld");
              dim?.runCommand?.("scoreboard objectives add ench_reg dummy");
              reg = world31.scoreboard.getObjective("ench_reg");
            } catch (e2) {
            }
          }
        }
        if (reg) {
          const costSample = typeof config.costPerLevel === "function" ? config.costPerLevel(1) : costMultiplier;
          const typesStr = appliesTo.join(",");
          const regKey = `#${clean}:${config.name}:${typesStr}:${maxLevel}:${costSample}`;
          try {
            reg.setScore(regKey, 1);
          } catch (e) {
            const dim = world31.getDimension("overworld");
            dim?.runCommand?.(`scoreboard players set "${regKey}" ench_reg 1`);
          }
        }
      } catch (err) {
      }
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
    const merged = /* @__PURE__ */ new Map();
    for (const [id, config] of this.registry) {
      const clean = this.cleanId(id);
      if (!merged.has(clean)) {
        merged.set(clean, { ...config, id: clean });
      }
    }
    try {
      const metaObj = world31.scoreboard.getObjective("ench_meta");
      if (metaObj) {
        for (const participant of metaObj.getParticipants()) {
          const rawName = typeof participant === "string" ? participant : participant?.displayName;
          if (!rawName || !rawName.startsWith("#")) continue;
          const id = this.cleanId(rawName.substring(1));
          if (!id || merged.has(id)) continue;
          const score = metaObj.getScore(participant);
          if (typeof score === "number") {
            const unpacked = ScoreboardBitPack.unpackEnchant(score);
            const prettyName = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    } catch (e) {
    }
    try {
      const reg = world31.scoreboard.getObjective("ench_reg");
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
    } catch (e) {
    }
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
      if (typeof GameMode5 !== "undefined" && mode === GameMode5.creative) {
        return true;
      }
    } catch (e) {
    }
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
    return appliesTo.some((type2) => {
      const t = (type2 || "").toLowerCase().trim();
      if (!t) return false;
      if (cleanType.includes(t)) return true;
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
    const enchants = this.getEnchantments(itemStack);
    const keys = Object.keys(enchants);
    if (keys.length > 0) {
      return this.cleanId(keys[0]);
    }
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
          return { blocked: true, reason: `\xA7cPersonal limit reached (${playerCrafts}/${playerLimit})` };
        }
        if (globalLimit > -1 && globalCrafts >= globalLimit) {
          return { blocked: true, reason: `\xA7cGlobal limit reached (${globalCrafts}/${globalLimit})` };
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
      let bus = world31.scoreboard.getObjective("ench_bus");
      if (!bus) {
        try {
          const dim = world31.getDimension("overworld");
          dim?.runCommand?.("scoreboard objectives add ench_bus dummy");
          bus = world31.scoreboard.getObjective("ench_bus");
        } catch (e) {
          try {
            bus = world31.scoreboard.addObjective("ench_bus", "Enchantment Bus");
          } catch (e2) {
          }
        }
      }
      const currentTick = typeof system36?.currentTick === "number" ? system36.currentTick : Math.floor(Date.now() / 50);
      const lastClaimedTick = bus?.getScore(mutexKey) ?? -999;
      if (currentTick - lastClaimedTick < debounceTicks) {
        return false;
      }
      try {
        bus?.setScore(mutexKey, currentTick);
      } catch (e) {
        const dim = world31.getDimension("overworld");
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
    if (typeof world31 === "undefined" || !world31.scoreboard || !world31.getAllPlayers) return;
    for (const player of world31.getAllPlayers()) {
      if (!player || !player.isValid) continue;
      const equip = player.getComponent("minecraft:equippable");
      if (!equip) continue;
      const activeEnchants = /* @__PURE__ */ new Map();
      const slots = [
        EquipmentSlot7.Mainhand,
        EquipmentSlot7.Offhand,
        EquipmentSlot7.Head,
        EquipmentSlot7.Chest,
        EquipmentSlot7.Legs,
        EquipmentSlot7.Feet
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
        trackedSet = /* @__PURE__ */ new Set();
        this.playerActiveEnchants.set(player.id, trackedSet);
      }
      for (const [id, level] of activeEnchants) {
        const objName = `ench_${id}`;
        let obj = world31.scoreboard.getObjective(objName);
        if (!obj) {
          try {
            obj = world31.scoreboard.addObjective(objName, `Ench: ${id}`);
          } catch (e1) {
            try {
              const dim = world31.getDimension("overworld");
              dim?.runCommand?.(`scoreboard objectives add "${objName}" dummy`);
              obj = world31.scoreboard.getObjective(objName);
            } catch (e2) {
            }
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
              const dim = world31.getDimension("overworld");
              dim?.runCommand?.(`scoreboard players set @a[name="${player.name}"] "${objName}" ${level}`);
            } catch (e2) {
            }
          }
        }
        trackedSet.add(id);
      }
      for (const oldId of trackedSet) {
        if (!activeEnchants.has(oldId)) {
          const objName = `ench_${oldId}`;
          const obj = world31.scoreboard.getObjective(objName);
          if (obj) {
            try {
              const score = obj.getScore(player);
              if (score !== 0 && typeof score === "number") {
                obj.setScore(player, 0);
              }
            } catch (e) {
              try {
                const dim = world31.getDimension("overworld");
                dim?.runCommand?.(`scoreboard players set @a[name="${player.name}"] "${objName}" 0`);
              } catch (e2) {
              }
            }
          }
          trackedSet.delete(oldId);
        }
      }
    }
  }
  initEvents() {
    system36.runInterval?.(() => this.manageVisuals(), 5);
    system36.runInterval?.(() => this.mirrorPlayerScoreboards(), 2);
    world31.afterEvents?.playerLeave?.subscribe?.((ev) => {
      if (ev?.playerId) {
        this.playerActiveEnchants.delete(ev.playerId);
        this.uiCooldowns.delete(ev.playerId);
      }
    });
    world31.afterEvents?.playerPlaceBlock?.subscribe?.((ev) => {
      const { block, player } = ev;
      if (!block || !player || !player.isValid) return;
      if (block.typeId === "minecraft:enchanting_table") {
        player.sendMessage?.("\xA7d[Enchantment] \xA7eSneak + Interact to access Custom Enchantments!");
        player.onScreenDisplay?.setActionBar?.("\xA7dSneak + Interact to access Custom Enchantments!");
      } else if (block.typeId.includes("anvil")) {
        player.sendMessage?.("\xA7d[Anvil] \xA7eSneak + Interact with a Custom Book to combine!");
        player.onScreenDisplay?.setActionBar?.("\xA7dSneak + Interact with a Custom Book to combine!");
      }
    });
    world31.beforeEvents?.playerInteractWithBlock?.subscribe?.((ev) => {
      const { block, player } = ev;
      if (!player || !player.isValid) return;
      if (block.typeId === "minecraft:enchanting_table") {
        if (!player.isSneaking) return;
        ev.cancel = true;
        system36.run(() => {
          if (!player.isValid) return;
          if (!this.claimScoreboardMutex("#ui_lock", 20)) {
            return;
          }
          const now = Date.now();
          if (this.uiCooldowns.has(player.id) && now - this.uiCooldowns.get(player.id) < 500) return;
          this.uiCooldowns.set(player.id, now);
          this.openEnchantmentUI(player);
        });
      } else if (block.typeId.includes("anvil")) {
        const equippable = player.getComponent("minecraft:equippable");
        const itemStack = equippable?.getEquipment(EquipmentSlot7.Mainhand);
        const enchantId = this.getEnchantFromBook(itemStack);
        if (enchantId) {
          ev.cancel = true;
          system36.run(() => {
            if (!player.isValid) return;
            if (!this.claimScoreboardMutex("#anvil_lock", 20)) {
              return;
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
    world31.afterEvents?.entityHitEntity?.subscribe?.((ev) => {
      const { damagingEntity } = ev;
      if (!damagingEntity || !damagingEntity.isValid) return;
      const equippable = damagingEntity.getComponent("minecraft:equippable");
      const mainHand = equippable?.getEquipment(EquipmentSlot7.Mainhand);
      if (mainHand) {
        this.triggerEnchants(mainHand, "entityHitEntity", ev);
      }
    });
    world31.afterEvents?.playerBreakBlock?.subscribe?.((ev) => {
      const { itemStack } = ev;
      if (itemStack) {
        this.triggerEnchants(itemStack, "playerBreakBlock", ev);
      }
    });
    world31.afterEvents?.entityHurt?.subscribe?.((ev) => {
      const { hurtEntity } = ev;
      if (!hurtEntity || !hurtEntity.isValid) return;
      const equippable = hurtEntity.getComponent("minecraft:equippable");
      if (!equippable) return;
      const armorSlots = [EquipmentSlot7.Head, EquipmentSlot7.Chest, EquipmentSlot7.Legs, EquipmentSlot7.Feet];
      for (const slot of armorSlots) {
        const item = equippable.getEquipment(slot);
        if (item) this.triggerEnchants(item, "onHurt", ev);
      }
    });
    world31.afterEvents?.projectileHitBlock?.subscribe?.((ev) => {
      const { source } = ev;
      if (!source || !source.isValid) return;
      const equippable = source.getComponent("minecraft:equippable");
      const mainHand = equippable?.getEquipment(EquipmentSlot7.Mainhand);
      if (mainHand) this.triggerEnchants(mainHand, "projectileHitBlock", ev);
    });
    world31.afterEvents?.projectileHitEntity?.subscribe?.((ev) => {
      const { source } = ev;
      if (!source || !source.isValid) return;
      const equippable = source.getComponent("minecraft:equippable");
      const mainHand = equippable?.getEquipment(EquipmentSlot7.Mainhand);
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
    const candidates = [];
    for (let i = 0; i < inventory.size; i++) {
      const item = inventory.getItem(i);
      if (!item) continue;
      if (this.hasAnyApplicableEnchant(item, player)) {
        candidates.push({ slot: i, item });
      }
    }
    const chosen = await new Promise((resolve) => {
      const itemForm = new CustomForm(player, "\xA75\xA7lCustom Enchanting").header("\xA7d\xA7lSelect an Item to Enchant").spacer().label("\xA77Current Experience: \xA7e" + (player.level ?? 0) + " \xA77Levels").spacer().divider().spacer();
      if (candidates.length === 0) {
        itemForm.label("\xA7cNo enchantable items in your inventory.");
        itemForm.label("\xA77Carry weapons, tools, or armor to apply custom enchantments.");
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
      const validEnchants = [];
      const currentEnchants = this.getEnchantments(chosen.item);
      for (const [id, config] of this.getAllAvailableEnchantments()) {
        const isCompatible = this.isItemCompatible(chosen.item, config.appliesTo);
        if (!isCreative && !isCompatible) continue;
        const currentLevel = currentEnchants[id] || 0;
        if (currentLevel >= config.maxLevel && !isCreative) continue;
        if (!isCreative) {
          const limitCheck = this.checkEnchantLimit(id, player);
          if (limitCheck.blocked) continue;
        }
        const nextLevel = isCreative ? currentLevel >= config.maxLevel ? config.maxLevel : currentLevel + 1 : currentLevel + 1;
        const cost = isCreative ? 0 : typeof config.costPerLevel === "function" ? config.costPerLevel(nextLevel) : config._costMultiplier ? nextLevel * config._costMultiplier : nextLevel * 3;
        validEnchants.push({ config, nextLevel, cost, enchantId: id });
      }
      if (validEnchants.length === 0) {
        player.sendMessage("\xA7cNo available enchantments for this item (maxed out or limit reached).");
        return;
      }
      const chosenRawName = chosen.item.nameTag || chosen.item.typeId.replace("minecraft:", "").replace(/_/g, " ");
      const chosenName = chosenRawName.charAt(0).toUpperCase() + chosenRawName.slice(1);
      const selected = await new Promise((resolve) => {
        const enchForm = new CustomForm(player, "\xA75\xA7lSelect Enchantment").header("\xA7d\xA7lItem: \xA7f" + chosenName).spacer().label("\xA77Current Experience: \xA7e" + (player.level ?? 0) + " \xA77Levels").spacer().divider().spacer();
        const eco2 = this.getEconomy(player);
        validEnchants.forEach((entry) => {
          const { config, nextLevel, cost } = entry;
          const costText = isCreative ? "Free" : eco2.type === "scoreboard" ? `${cost} ${eco2.objective}` : `${cost} Levels`;
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
      const currentInv = player.getComponent("minecraft:inventory")?.container;
      if (!currentInv) return;
      const targetItem = currentInv.getItem(chosen.slot);
      if (!targetItem || targetItem.typeId !== chosen.item.typeId) {
        player.sendMessage("\xA7cInventory changed. Transaction cancelled.");
        return;
      }
      const eco = this.getEconomy(player);
      let pScore = 0;
      if (eco.type === "scoreboard" && !isCreative) {
        try {
          pScore = world31.scoreboard.getObjective(eco.objective)?.getScore(player) || 0;
        } catch (e) {
        }
        if (pScore < selected.cost) {
          player.sendMessage(`\xA7cNot enough ${eco.objective}! Need ${selected.cost}.`);
          player.playSound("note.bass");
          return;
        }
      } else if (eco.type !== "scoreboard" && !isCreative) {
        if ((player.level ?? 0) < selected.cost) {
          player.sendMessage(`\xA7cNot enough XP! Need ${selected.cost} levels.`);
          player.playSound("note.bass");
          return;
        }
      }
      if (!isCreative) {
        const finalCheck = this.checkEnchantLimit(selected.enchantId, player);
        if (finalCheck.blocked) {
          player.sendMessage(finalCheck.reason);
          player.playSound("note.bass");
          return;
        }
      }
      let newItem;
      if (targetItem.amount > 1) {
        const singleItem = targetItem.clone();
        singleItem.amount = 1;
        newItem = this.applyEnchantment(singleItem, selected.config.id, selected.nextLevel);
        targetItem.amount--;
        currentInv.setItem(chosen.slot, targetItem);
        const added = currentInv.addItem(newItem);
        if (added) {
          player.dimension.spawnItem(newItem, player.location);
        }
      } else {
        newItem = this.applyEnchantment(targetItem, selected.config.id, selected.nextLevel);
        currentInv.setItem(chosen.slot, newItem);
        const equip = player.getComponent("minecraft:equippable");
        const currentMainHand = equip?.getEquipment(EquipmentSlot7.Mainhand);
        if (currentMainHand && currentMainHand.typeId === newItem.typeId) {
          equip.setEquipment(EquipmentSlot7.Mainhand, newItem);
        }
      }
      if (!isCreative) {
        if (eco.type === "scoreboard") {
          try {
            world31.scoreboard.getObjective(eco.objective)?.addScore(player, -selected.cost);
          } catch (e) {
          }
        } else {
          player.addLevels(-selected.cost);
        }
        this.incrementEnchantCount(selected.enchantId, player);
      }
      player.dimension.spawnParticle("minecraft:enchanting_table_particle", player.location);
      player.playSound("random.levelup");
      player.sendMessage(`\xA7aSuccessfully enchanted with ${selected.config.name} ${this.toRoman(selected.nextLevel)}!`);
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
      if (isCreative || isCompatible && currentLevel < config.maxLevel) {
        validTargets.push({
          slot: i,
          item,
          nextLevel: isCreative ? currentLevel >= config.maxLevel ? config.maxLevel : currentLevel + 1 : currentLevel + 1,
          cost: isCreative ? 0 : typeof config.costPerLevel === "function" ? config.costPerLevel(currentLevel + 1) : config._costMultiplier ? (currentLevel + 1) * config._costMultiplier : 3
        });
      }
    }
    if (validTargets.length === 0) {
      player.sendMessage(`\xA7cNo compatible items for ${config.name} found in your inventory.`);
      return;
    }
    const eco = this.getEconomy(player);
    const selection = await new Promise((resolve) => {
      const form = new CustomForm(player, "\xA76\xA7lAnvil: \xA7f" + config.name).header("\xA7e\xA7lSelect Target Item").spacer().label("\xA77Select an item to combine with \xA7d" + config.name + "\xA77.\n\xA77Current Experience: \xA7e" + (player.level ?? 0) + " \xA77Levels").spacer().divider().spacer();
      validTargets.forEach((t) => {
        const rawName = t.item.nameTag || t.item.typeId.replace("minecraft:", "").replace(/_/g, " ");
        const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        const costText = isCreative ? "Free" : eco.type === "scoreboard" ? `${t.cost} ${eco.objective}` : `${t.cost} Levels`;
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
    const currentHandItem = equipComp?.getEquipment(EquipmentSlot7.Mainhand);
    if (!currentHandItem || currentHandItem.typeId !== bookStack.typeId || !currentInvItem || currentInvItem.typeId !== selection.item.typeId) {
      player.sendMessage("\xA7cInventory changed. Transaction cancelled.");
      return;
    }
    let pScore = 0;
    if (eco.type === "scoreboard" && !isCreative) {
      try {
        pScore = world31.scoreboard.getObjective(eco.objective)?.getScore(player) || 0;
      } catch (e) {
      }
      if (pScore < selection.cost) {
        player.sendMessage(`\xA7cNot enough ${eco.objective}! Need ${selection.cost}.`);
        player.playSound("note.bass");
        return;
      }
    } else if (eco.type !== "scoreboard" && !isCreative) {
      if ((player.level ?? 0) < selection.cost) {
        player.sendMessage(`\xA7cNot enough XP! Need ${selection.cost} levels.`);
        player.playSound("note.bass");
        return;
      }
    }
    const newItem = this.applyEnchantment(currentInvItem, config.id, selection.nextLevel);
    inventory.setItem(selection.slot, newItem);
    if (currentHandItem.amount > 1) {
      currentHandItem.amount--;
      equipComp.setEquipment(EquipmentSlot7.Mainhand, currentHandItem);
    } else {
      equipComp.setEquipment(EquipmentSlot7.Mainhand, void 0);
    }
    if (!isCreative) {
      if (eco.type === "scoreboard") {
        try {
          world31.scoreboard.getObjective(eco.objective)?.addScore(player, -selection.cost);
        } catch (e) {
        }
      } else {
        player.addLevels(-selection.cost);
      }
      this.incrementEnchantCount(cleanId, player);
    }
    player.playSound("random.anvil_use");
    player.dimension.spawnParticle("minecraft:villager_happy", player.location);
    player.sendMessage(`\xA7aSuccessfully combined ${config.name} with your item!`);
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
    try {
      const serialized = JSON.stringify(enchants);
      itemStack.setDynamicProperty("mirage:enchants", serialized);
      itemStack.setDynamicProperty("luminiae:enchants", serialized);
      itemStack.setDynamicProperty("tme:enchants", serialized);
      itemStack.setDynamicProperty("ench:enchants", serialized);
    } catch (e) {
    }
    const currentLore = itemStack.getLore ? itemStack.getLore() || [] : [];
    const newLoreLine = `\xA77${config.name} ${this.toRoman(level)}`;
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
    const hasDummy = itemStack.getDynamicProperty("mirage:dummy_glint") || itemStack.getDynamicProperty("luminiae:dummy_glint") || itemStack.getDynamicProperty("tme:dummy_glint") || itemStack.getDynamicProperty("ench:dummy_glint");
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
          } catch (e2) {
          }
        }
      }
    } else {
      if (hasDummy) {
        const unbreaking = enchantable.getEnchantment("unbreaking");
        if (unbreaking && currentVanillas.length === 1) {
          enchantable.removeAllEnchantments();
          this.setDummyGlintProperty(itemStack, void 0);
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
    } catch (e) {
    }
  }
  hasDummyGlint(itemStack) {
    if (!itemStack || !itemStack.getDynamicProperty) return false;
    try {
      return !!(itemStack.getDynamicProperty("mirage:dummy_glint") || itemStack.getDynamicProperty("luminiae:dummy_glint") || itemStack.getDynamicProperty("tme:dummy_glint") || itemStack.getDynamicProperty("ench:dummy_glint"));
    } catch (e) {
      return false;
    }
  }
  /**
   * Scans players every 5 ticks to suppress glint in cursor slots and maintain glint in inventory.
   */
  manageVisuals() {
    for (const player of world31.getAllPlayers()) {
      if (!player.isValid) continue;
      const cursorComp = player.getComponent("minecraft:cursor_inventory");
      if (cursorComp?.item && this.hasCustomEnchants(cursorComp.item)) {
        if (this.hasDummyGlint(cursorComp.item)) {
          this.updateGlint(cursorComp.item, false);
          cursorComp.item = cursorComp.item;
        }
      }
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
          EquipmentSlot7.Mainhand,
          EquipmentSlot7.Offhand,
          EquipmentSlot7.Head,
          EquipmentSlot7.Chest,
          EquipmentSlot7.Legs,
          EquipmentSlot7.Feet
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
    const lore = item.getLore ? item.getLore() : [];
    if (lore && lore.length > 0) {
      return lore.some((line) => typeof line === "string" && (line.startsWith("\xA77") || line.includes("\xA77")));
    }
    const type2 = (item.typeId || "").toLowerCase();
    if (type2.includes("enchanted_book_")) return true;
    try {
      if (item.getDynamicProperty && (item.getDynamicProperty("mirage:enchants") || item.getDynamicProperty("luminiae:enchants") || item.getDynamicProperty("tme:enchants") || item.getDynamicProperty("ench:enchants"))) {
        return true;
      }
    } catch (e) {
    }
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
            if (suffix !== "" && !/^[IVXLCDM]+$/i.test(suffix)) {
              continue;
            }
            const level = suffix === "" ? 1 : this.fromRoman(suffix) || 1;
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
    try {
      if (itemStack.getDynamicProperty) {
        const data = itemStack.getDynamicProperty("mirage:enchants") || itemStack.getDynamicProperty("luminiae:enchants") || itemStack.getDynamicProperty("tme:enchants") || itemStack.getDynamicProperty("ench:enchants");
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
    } catch (e) {
    }
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
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1e3 };
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
    const roman = { M: 1e3, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let remaining = n;
    let str = "";
    for (const [r, val] of Object.entries(roman)) {
      const q = Math.floor(remaining / val);
      remaining -= q * val;
      str += r.repeat(q);
    }
    return str || "I";
  }
};
var enchantmentManager = new EnchantmentManager();

// src/main/bedrock/ts/systems/enchantments.ts
enchantmentManager.register("gaia:life_steal", {
  name: "Life Steal",
  maxLevel: 3,
  appliesTo: ["sword", "axe"],
  costPerLevel: (lvl) => lvl * 5,
  onHit: (event, level) => {
    const { damagingEntity } = event;
    if (!damagingEntity) return;
    const health = damagingEntity.getComponent("minecraft:health");
    if (health) {
      health.setCurrentValue(Math.min(health.currentValue + level, health.effectiveMax));
    }
  }
});
enchantmentManager.register("gaia:thunder_strike", {
  name: "Thunder Strike",
  maxLevel: 1,
  appliesTo: ["sword", "trident"],
  costPerLevel: 10,
  onHit: (event, level) => {
    const { hitEntity, damagingEntity } = event;
    if (!damagingEntity || !hitEntity) return;
    const dim = damagingEntity.dimension;
    if (Math.random() < 0.2) {
      dim.spawnEntity("minecraft:lightning_bolt", hitEntity.location);
    }
  }
});

// src/main/bedrock/ts/entities/MalachiteGuard.ts
import { world as world32, system as system37, EquipmentSlot as EquipmentSlot8, GameMode as GameMode6, EntityComponentTypes, EntityDamageCause } from "@minecraft/server";
var GUARD_ID = "gaiadimension:malachite_guard";
var DRONE_ID = "gaiadimension:malachite_drone";
var BATON_ID = "gaiadimension:malachite_guard_baton";
var STOMP_WINDUP_TICKS = 20;
var STOMP_COOLDOWN = 120;
var CHARGE_DURATION = 100;
var CHARGE_COOLDOWN = 60;
var BLAST_LINGER = 20;
var DRONE_OFFSETS = [
  { x: 2, z: 1 },
  { x: 2, z: -1 },
  { x: -2, z: 1 },
  { x: -2, z: -1 }
];
var P = {
  GUARD_ID: "gd:guard_id",
  PHASE: "gd:phase",
  STOMP_COOLDOWN: "gd:stomp_cd",
  CHARGE_COOLDOWN: "gd:charge_cd",
  STOMP_TIMER: "gd:stomp_t",
  CHARGE_TIMER: "gd:charge_t",
  BLAST_TIMER: "gd:blast_t",
  BIDE_DAMAGE: "gd:bide_dmg",
  HAS_DRONES: "gd:has_drones",
  DRONES_SPAWNED: "gd:drones_spawned",
  PARENT_ID: "gd:parent_id"
};
function getNum(e, key, def = 0) {
  return e.getDynamicProperty(key) ?? def;
}
function setNum(e, key, v) {
  e.setDynamicProperty(key, v);
}
function getBool(e, key, def = false) {
  return e.getDynamicProperty(key) ?? def;
}
function setBool(e, key, v) {
  e.setDynamicProperty(key, v);
}
function getStr(e, key, def = "") {
  return e.getDynamicProperty(key) ?? def;
}
function setAnimState(guard, state) {
  try {
    guard.setProperty("minecraft:mark_variant", state);
  } catch {
  }
}
function distSq(a, b) {
  const al = a.location, bl = b.location;
  const dx = al.x - bl.x, dy = al.y - bl.y, dz = al.z - bl.z;
  return dx * dx + dy * dy + dz * dz;
}
function isValidPlayer(e) {
  if (e.typeId !== "minecraft:player") return false;
  try {
    const gm = e.getGameMode();
    return gm !== GameMode6.Creative && gm !== GameMode6.Spectator;
  } catch {
    return false;
  }
}
function getPlayerSource(damageSource) {
  const direct = damageSource.damagingEntity;
  if (direct && isValidPlayer(direct)) return direct;
  const owner = damageSource.projectileOwner ?? damageSource.cause === "projectile" ? void 0 : void 0;
  if (owner && isValidPlayer(owner)) return owner;
  return void 0;
}
function getDamageMultiplier(baseDmg) {
  if (baseDmg > 100) return 0;
  if (baseDmg > 50) return 0.125;
  if (baseDmg > 25) return 0.25;
  if (baseDmg > 10) return 0.5;
  return 1;
}
var MalachiteGuardSystem = class {
  constructor() {
    this.init();
  }
  init() {
    world32.afterEvents.entitySpawn.subscribe((event) => {
      const { entity } = event;
      if (entity.typeId === GUARD_ID) {
        this.setupGuard(entity);
      }
    });
    system37.runInterval(() => {
      for (const dimension of getDimensions()) {
        const guards = dimension.getEntities({ type: GUARD_ID });
        for (const guard of guards) {
          if (!guard.isValid) continue;
          try {
            this.tickGuard(guard);
          } catch {
          }
        }
      }
    }, 1);
    world32.afterEvents.entityHurt.subscribe((event) => {
      const { hurtEntity, damage, damageSource } = event;
      if (hurtEntity.typeId !== GUARD_ID || !hurtEntity.isValid) return;
      const phase = getNum(hurtEntity, P.PHASE, 0 /* Defence */);
      const health = hurtEntity.getComponent(EntityComponentTypes.Health);
      if (!health) return;
      const maxHp = health.effectiveMax;
      const curHp = health.currentValue;
      const playerAttacker = getPlayerSource(damageSource);
      const chargeTimer = getNum(hurtEntity, P.CHARGE_TIMER, 0);
      if (chargeTimer > 0 && playerAttacker) {
        const bide = getNum(hurtEntity, P.BIDE_DAMAGE, 0);
        setNum(hurtEntity, P.BIDE_DAMAGE, bide + damage * 0.5);
      }
      if (phase === 0 /* Defence */) {
        if (damage > 0) {
          system37.run(() => {
            try {
              if (hurtEntity.isValid && health) {
                health.setCurrentValue(Math.min(curHp + damage, maxHp));
              }
            } catch {
            }
          });
        }
        return;
      }
      if (phase === 1 /* Attack */) {
        const threshold = maxHp / 2 - 2;
        if (curHp < threshold) {
          system37.run(() => {
            try {
              if (hurtEntity.isValid && health) {
                health.setCurrentValue(threshold);
              }
            } catch {
            }
          });
        }
        return;
      }
      if (phase === 2 /* Resist */) {
        if (!playerAttacker) {
          if (hurtEntity.location.y > -64) {
            system37.run(() => {
              try {
                if (hurtEntity.isValid && health) {
                  health.setCurrentValue(Math.min(curHp + damage, maxHp));
                }
              } catch {
              }
            });
          }
          return;
        }
        const mult = getDamageMultiplier(damage);
        if (mult < 1) {
          const reduction = damage * (1 - mult);
          system37.run(() => {
            try {
              if (hurtEntity.isValid && health) {
                health.setCurrentValue(Math.min(curHp + reduction, maxHp));
              }
            } catch {
            }
          });
        }
      }
    });
    world32.afterEvents.entityHitEntity.subscribe((event) => {
      const { damagingEntity, hitEntity } = event;
      if (isValidPlayer(damagingEntity) && hitEntity.isValid) {
        try {
          const equip = damagingEntity.getComponent(EntityComponentTypes.Equippable);
          const mainhand = equip?.getEquipment(EquipmentSlot8.Mainhand);
          if (mainhand?.typeId === BATON_ID) {
            const yaw = damagingEntity.getRotation().y;
            const rad = yaw * (Math.PI / 180);
            const kbX = -Math.sin(rad) * 1.5;
            const kbZ = Math.cos(rad) * 1.5;
            hitEntity.applyKnockback(kbX, kbZ, 1.5, 0.4);
          }
        } catch {
        }
      }
      if (damagingEntity.typeId === GUARD_ID && isValidPlayer(hitEntity)) {
        if (!hitEntity.isValid) return;
        if (Math.random() > 1 / 12) return;
        try {
          const equip = hitEntity.getComponent(EntityComponentTypes.Equippable);
          if (!equip) return;
          const slots = [EquipmentSlot8.Head, EquipmentSlot8.Chest, EquipmentSlot8.Legs, EquipmentSlot8.Feet];
          const slot = slots[Math.floor(Math.random() * slots.length)];
          const item = equip.getEquipment(slot);
          if (item) {
            const dim = hitEntity.dimension;
            const loc = hitEntity.location;
            system37.run(() => {
              try {
                dim.spawnItem(item, { x: loc.x, y: loc.y + 0.5, z: loc.z });
                equip.setEquipment(slot, void 0);
                hitEntity.playSound("random.break");
              } catch {
              }
            });
          }
        } catch {
        }
      }
    });
    world32.afterEvents.entityDie.subscribe((event) => {
      const { deadEntity } = event;
      if (deadEntity.typeId !== DRONE_ID) return;
      const parentId = getStr(deadEntity, P.PARENT_ID);
      if (!parentId) return;
    });
  }
  // ────────────────────────────────────────────────────────────────────
  // Setup
  // ────────────────────────────────────────────────────────────────────
  setupGuard(guard) {
    const guardId = `mg_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
    guard.setDynamicProperty(P.GUARD_ID, guardId);
    setNum(guard, P.PHASE, 0 /* Defence */);
    setNum(guard, P.STOMP_COOLDOWN, 0);
    setNum(guard, P.CHARGE_COOLDOWN, 0);
    setNum(guard, P.STOMP_TIMER, 0);
    setNum(guard, P.CHARGE_TIMER, 0);
    setNum(guard, P.BLAST_TIMER, 0);
    setNum(guard, P.BIDE_DAMAGE, 0);
    setBool(guard, P.HAS_DRONES, true);
    setBool(guard, P.DRONES_SPAWNED, false);
    system37.run(() => {
      if (!guard.isValid) return;
      try {
        guard.triggerEvent("mg_defend");
        setAnimState(guard, 0 /* Default */);
      } catch {
      }
    });
  }
  // ────────────────────────────────────────────────────────────────────
  // Per-tick guard logic
  // ────────────────────────────────────────────────────────────────────
  tickGuard(guard) {
    const phase = getNum(guard, P.PHASE, 0 /* Defence */);
    const guardId = getStr(guard, P.GUARD_ID);
    if (!guardId) return;
    const health = guard.getComponent(EntityComponentTypes.Health);
    if (!health) return;
    const maxHp = health.effectiveMax;
    const curHp = health.currentValue;
    switch (phase) {
      case 0 /* Defence */:
        this.tickDefencePhase(guard, guardId, curHp, maxHp);
        break;
      case 1 /* Attack */:
        this.tickAttackPhase(guard, guardId, curHp, maxHp);
        break;
      case 2 /* Resist */:
        this.tickResistPhase(guard, guardId, curHp, maxHp);
        break;
    }
    const stompCd = getNum(guard, P.STOMP_COOLDOWN, 0);
    if (stompCd > 0) setNum(guard, P.STOMP_COOLDOWN, stompCd - 1);
    const chargeCd = getNum(guard, P.CHARGE_COOLDOWN, 0);
    if (chargeCd > 0) setNum(guard, P.CHARGE_COOLDOWN, chargeCd - 1);
    this.tickStomp(guard);
    this.tickBlast(guard);
  }
  // ────────────────────────────────────────────────────────────────────
  // DEFENCE phase: immobile, spawn drones, wait for drones to die
  // ────────────────────────────────────────────────────────────────────
  tickDefencePhase(guard, guardId, curHp, maxHp) {
    if (!getBool(guard, P.DRONES_SPAWNED, false)) {
      this.spawnDrones(guard, guardId);
      setBool(guard, P.DRONES_SPAWNED, true);
    }
    const drones = guard.dimension.getEntities({
      type: DRONE_ID,
      tags: [`mg_parent:${guardId}`],
      location: guard.location,
      maxDistance: 200
    });
    if (drones.length <= 0 && getBool(guard, P.DRONES_SPAWNED, false)) {
      setNum(guard, P.PHASE, 1 /* Attack */);
      setBool(guard, P.HAS_DRONES, false);
      guard.triggerEvent("no_mg_defend");
      setAnimState(guard, 0 /* Default */);
    }
  }
  // ────────────────────────────────────────────────────────────────────
  // ATTACK phase: normal combat, transition to RESIST at <= 50% HP
  // ────────────────────────────────────────────────────────────────────
  tickAttackPhase(guard, guardId, curHp, maxHp) {
    if (curHp <= maxHp / 2) {
      setNum(guard, P.PHASE, 2 /* Resist */);
      guard.triggerEvent("mg_resist");
    }
    this.checkAttackOpportunities(guard);
  }
  // ────────────────────────────────────────────────────────────────────
  // RESIST phase: enraged, restricted damage, slower. Revert to ATTACK if healed > 50%
  // ────────────────────────────────────────────────────────────────────
  tickResistPhase(guard, guardId, curHp, maxHp) {
    if (curHp > maxHp / 2) {
      setNum(guard, P.PHASE, 1 /* Attack */);
      guard.triggerEvent("no_mg_resist");
    }
    this.checkAttackOpportunities(guard);
  }
  // ────────────────────────────────────────────────────────────────────
  // Drone spawning
  // ────────────────────────────────────────────────────────────────────
  spawnDrones(guard, guardId) {
    const dim = guard.dimension;
    const loc = guard.location;
    for (const offset of DRONE_OFFSETS) {
      try {
        const drone = dim.spawnEntity(DRONE_ID, {
          x: loc.x + offset.x,
          y: loc.y + 1,
          z: loc.z + offset.z
        });
        drone.addTag(`mg_parent:${guardId}`);
        drone.setDynamicProperty(P.PARENT_ID, guardId);
      } catch {
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────
  // Opportunity detection for stomp and blast attacks
  // ────────────────────────────────────────────────────────────────────
  checkAttackOpportunities(guard) {
    const phase = getNum(guard, P.PHASE);
    if (phase === 0 /* Defence */) return;
    const stompTimer = getNum(guard, P.STOMP_TIMER, 0);
    const chargeTimer = getNum(guard, P.CHARGE_TIMER, 0);
    const blastTimer = getNum(guard, P.BLAST_TIMER, 0);
    if (stompTimer > 0 || chargeTimer > 0 || blastTimer > 0) return;
    const gl = guard.location;
    const nearbyPlayers = guard.dimension.getEntities({
      type: "minecraft:player",
      location: gl,
      maxDistance: 6
    }).filter((e) => isValidPlayer(e));
    if (nearbyPlayers.length === 0) return;
    const chargeCd = getNum(guard, P.CHARGE_COOLDOWN, 0);
    const stompCd = getNum(guard, P.STOMP_COOLDOWN, 0);
    if (chargeCd <= 0) {
      for (const player of nearbyPlayers) {
        const yDiff = player.location.y - gl.y;
        if (Math.abs(yDiff) > 1) {
          this.startBlastAttack(guard);
          return;
        }
      }
    }
    if (stompCd <= 0) {
      for (const player of nearbyPlayers) {
        const dSq = distSq(guard, player);
        if (dSq > 1 && dSq < 16 && player.isOnGround) {
          this.startStompAttack(guard);
          return;
        }
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────
  // STOMP ATTACK — Java StompAttackGoal port
  // ────────────────────────────────────────────────────────────────────
  startStompAttack(guard) {
    setNum(guard, P.STOMP_TIMER, STOMP_WINDUP_TICKS);
    guard.triggerEvent("mg_stomp_start");
    setAnimState(guard, 1 /* StompWindup */);
  }
  tickStomp(guard) {
    const timer = getNum(guard, P.STOMP_TIMER, 0);
    if (timer <= 0) return;
    const newTimer = timer - 1;
    setNum(guard, P.STOMP_TIMER, newTimer);
    if (newTimer <= 0) {
      setAnimState(guard, 3 /* StompExecute */);
      const gl = guard.location;
      const dim = guard.dimension;
      const targets = dim.getEntities({
        location: gl,
        maxDistance: 3.5
      }).filter((e) => e.id !== guard.id && e.typeId !== DRONE_ID && e.typeId !== GUARD_ID);
      try {
        dim.playSound("mob.ravager.stomp", gl);
      } catch {
      }
      for (const target of targets) {
        try {
          target.applyDamage(5, { cause: EntityDamageCause.EntityAttack, damagingEntity: guard });
          target.applyKnockback(0, 0, 0, 0.6);
        } catch {
        }
      }
      try {
        dim.runCommand(`particle minecraft:terrain_explosion ${gl.x} ${gl.y} ${gl.z}`);
      } catch {
      }
      system37.runTimeout(() => {
        if (!guard.isValid) return;
        setNum(guard, P.STOMP_COOLDOWN, STOMP_COOLDOWN);
        guard.triggerEvent("mg_stomp_end");
        setAnimState(guard, 0 /* Default */);
      }, 10);
    }
  }
  // ────────────────────────────────────────────────────────────────────
  // BLAST ATTACK (BIDE) — Java BlastAttackGoal port
  // ────────────────────────────────────────────────────────────────────
  startBlastAttack(guard) {
    setNum(guard, P.CHARGE_TIMER, CHARGE_DURATION);
    setNum(guard, P.BIDE_DAMAGE, 0);
    guard.triggerEvent("mg_charge_start");
    setAnimState(guard, 2 /* ChargeCrouch */);
  }
  tickBlast(guard) {
    const chargeTimer = getNum(guard, P.CHARGE_TIMER, 0);
    const blastTimer = getNum(guard, P.BLAST_TIMER, 0);
    if (chargeTimer > 0) {
      const newCharge = chargeTimer - 1;
      setNum(guard, P.CHARGE_TIMER, newCharge);
      if (newCharge % 3 === 0) {
        try {
          const gl = guard.location;
          guard.dimension.spawnParticle("gaiadimension:malachite_magic", {
            x: gl.x + (Math.random() - 0.5) * 6,
            y: gl.y + Math.random() * 0.25,
            z: gl.z + (Math.random() - 0.5) * 6
          });
        } catch {
        }
      }
      if (newCharge <= 0) {
        setAnimState(guard, 4 /* BlastExecute */);
        setNum(guard, P.BLAST_TIMER, BLAST_LINGER);
        const gl = guard.location;
        const dim = guard.dimension;
        const bideDmg = getNum(guard, P.BIDE_DAMAGE, 0);
        const targets = dim.getEntities({
          location: gl,
          maxDistance: 4.5
        }).filter((e) => e.id !== guard.id && e.typeId !== DRONE_ID && e.typeId !== GUARD_ID);
        try {
          dim.playSound("random.explode", gl, { volume: 1.5, pitch: 0.7 });
        } catch {
        }
        for (const target of targets) {
          try {
            target.applyDamage(8 + bideDmg, { cause: EntityDamageCause.EntityAttack, damagingEntity: guard });
            const dx = target.location.x - gl.x;
            const dz = target.location.z - gl.z;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            target.applyKnockback(dx / dist, dz / dist, 2, 0.3);
          } catch {
          }
        }
      }
      return;
    }
    if (blastTimer > 0) {
      const newBlast = blastTimer - 1;
      setNum(guard, P.BLAST_TIMER, newBlast);
      if (newBlast % 2 === 0) {
        try {
          const gl = guard.location;
          for (let i = 0; i < 5; i++) {
            guard.dimension.spawnParticle("gaiadimension:malachite_magic", {
              x: gl.x + (Math.random() - 0.5) * 2,
              y: gl.y + Math.random() * 3,
              z: gl.z + (Math.random() - 0.5) * 2
            });
          }
        } catch {
        }
      }
      if (newBlast <= 0) {
        setNum(guard, P.CHARGE_COOLDOWN, CHARGE_COOLDOWN);
        setNum(guard, P.BIDE_DAMAGE, 0);
        guard.triggerEvent("mg_charge_end");
        setAnimState(guard, 0 /* Default */);
      }
    }
  }
};
var malachiteGuardSystem = new MalachiteGuardSystem();

// src/main/bedrock/ts/GaiaDimensionAddon.ts
initializeDestructionHandlers();
initializeEventManager();
system38.beforeEvents?.shutdown?.subscribe((event) => event.cancel = true);
initializeScriptEvents();
initializeGeyser();
initializeLightMixin();
initializeGlitterGrassSync();
initializeMagicStaffBehaviors();
registerCustomTool();
initDestroyedDimensionGuard();
initializeGaiaChunkCoordinator();
system38.beforeEvents.startup.subscribe((event) => {
  const { blockComponentRegistry, customCommandRegistry, itemComponentRegistry, dimensionRegistry } = event;
  const gaiaDimId = "gaiadimension:gaia_dimension";
  dimensionRegistry.registerCustomDimension(gaiaDimId);
  registerDimension(gaiaDimId);
  initializeGaiaChunkCoordinator();
  registerRealmDimensions(dimensionRegistry);
  for (let i = 0; i < REALM_COUNT; i++) {
    registerDimension(`${REALM_PREFIX}${i}`);
  }
  registerLeavesComponent({ blockComponentRegistry });
  registerInvisibleComponent({ blockComponentRegistry });
  registerCurtainComponent({ blockComponentRegistry });
  registerWoodComponent({ blockComponentRegistry });
  registerSaplingComponent({ blockComponentRegistry });
  registerButtonComponent({ blockComponentRegistry });
  registerPressurePlateComponent({ blockComponentRegistry });
  registerStairsComponent({ blockComponentRegistry });
  registerSignComponent({ blockComponentRegistry });
  registerGeyserComponent({ blockComponentRegistry });
  registerGaiaFurnaceComponent({ blockComponentRegistry });
  registerRestructurerComponent({ blockComponentRegistry });
  registerPurifierComponent({ blockComponentRegistry });
  registerAugmenterComponent({ blockComponentRegistry });
  registerGlitteringFireComponent();
  registerCrudeStorageCrateComponent({ blockComponentRegistry });
  registerMegaStorageCrateComponent({ blockComponentRegistry });
  registerAuraShootComponent({ blockComponentRegistry });
  registerFluidComponent({ blockComponentRegistry });
  registerFireStarterComponent({ itemComponentRegistry });
  registerMagicStaffComponent({ itemComponentRegistry });
  registerGaiaCommands(customCommandRegistry);
  registerSetBiomeCommand(customCommandRegistry);
  registerDestructionCommands(customCommandRegistry);
});
//# sourceMappingURL=GaiaDimensionAddon.js.map
