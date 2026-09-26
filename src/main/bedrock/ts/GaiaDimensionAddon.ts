import { 
    world, 
    system, 
    StartupEvent, 
    CommandPermissionLevel, 
    Player, 
    CustomCommandStatus, 
    BlockComponentRegistry, 
    ItemComponentRegistry,
    CustomCommandRegistry,
    DimensionRegistry,
    SystemBeforeEvents,
    SystemBeforeEventSignal
} from "@minecraft/server";
import { registerLeavesComponent } from "./blocks/leaves.js";
import { registerInvisibleComponent } from "./blocks/invisible.js";
import { registerCurtainComponent } from "./blocks/curtain.js";
import { registerWoodComponent } from "./blocks/wood.js";
import { registerFenceComponent } from "./blocks/fence.js";
import { registerSaplingComponent } from "./blocks/sapling.js";
import { registerWallComponent } from "./blocks/wall.js";
import { registerButtonComponent } from "./blocks/button.js";
import { registerPressurePlateComponent } from "./blocks/pressure_plate.js";
import { registerStairsComponent } from "./blocks/stairs.js";
import { registerSignComponent } from "./blocks/sign.js";
import { registerGeyserComponent, initializeGeyser } from "./blocks/geyser.js";
import { registerSandstoneComponent } from "./blocks/sandstone_slab.js";
import { registerStoneSlabComponent } from "./blocks/stone_slab.js";
import { registerGaiaFurnaceComponent } from "./blocks/furnaces/GaiaFurnace.js";
import { registerRestructurerComponent } from "./blocks/furnaces/Restructurer.js";
import { registerPurifierComponent } from "./blocks/furnaces/Purifier.js";
import { registerAugmenterComponent } from "./blocks/augmenter/Augmenter.js";
import { registerGlitteringFireComponent } from "./blocks/glittering_fire.js";
import { registerCrudeStorageCrateComponent } from "./blocks/crates/crude_storage_crate.js";
import { registerMegaStorageCrateComponent } from "./blocks/crates/mega_storage_crate.js";
import { registerAuraShootComponent } from "./blocks/flora/AuraShoot.js";
import { initializeLightMixin } from "./mixins/LightMixin.js";
import { initializeDestructionHandlers } from "./systems/destruction_handler.js";
import { initializeEventManager } from "./systems/event_manager.js";
import { initializeScriptEvents } from "./systems/scriptevents.js";
import { registerFluidComponent } from "./fluids/fluids.js";
import { registerCustomTool } from "./durability.js";
import { registerGaiaCommands } from "./systems/Commands.js";
import { registerSetBiomeCommand } from "./systems/SetBiomeCommand.js";
import { registerFireStarterComponent } from "./items/FireStarter.js";
import { registerDestructionCommands, registerRealmDimensions, initDestroyedDimensionGuard, REALM_COUNT, REALM_PREFIX } from "./systems/DimensionDestruction.js";
import { registerDimension } from "./utils.js";
import { registerMagicStaffComponent } from "./items/MagicStaff.js";
import "./items/GemstonePouch.js";
import { initializeMagicStaffBehaviors } from "./systems/MagicStaffBehaviors.js";
import { initializeGlitterGrassSync } from "./blocks/GlitterGrassSync.js";
import "./systems/enchantments.js";
import "./entities/MalachiteGuard.js";
import { initializeGaiaChunkCoordinator } from "./world/GaiaChunkCoordinator.js";

interface SystemShutdownBeforeEvent {
    cancel: boolean;
}

declare module "@minecraft/server" {
    interface StartupEvent {
        readonly blockComponentRegistry: BlockComponentRegistry;
        readonly customCommandRegistry: CustomCommandRegistry;
        readonly itemComponentRegistry: ItemComponentRegistry;
        readonly dimensionRegistry: DimensionRegistry;
    }
}

// Initialize systems
initializeDestructionHandlers();
initializeEventManager();

// @ts-ignore
system.beforeEvents?.shutdown?.subscribe((event: SystemShutdownBeforeEvent) => event.cancel = true);
initializeScriptEvents();
initializeGeyser();
initializeLightMixin();
initializeGlitterGrassSync();
initializeMagicStaffBehaviors();
registerCustomTool();
initDestroyedDimensionGuard();
initializeGaiaChunkCoordinator();

system.beforeEvents.startup.subscribe((event: StartupEvent) => {
    const { blockComponentRegistry, customCommandRegistry, itemComponentRegistry, dimensionRegistry } = event;
    
    // Register Native Gaia Dimension
    const gaiaDimId = "gaiadimension:gaia_dimension";
    dimensionRegistry.registerCustomDimension(gaiaDimId);
    registerDimension(gaiaDimId);
    initializeGaiaChunkCoordinator();

    // Register dynamic realm pool (16 void dimensions)
    registerRealmDimensions(dimensionRegistry);
    // Mirror realm registrations into the shared dimension registry
    for (let i = 0; i < REALM_COUNT; i++) {
        registerDimension(`${REALM_PREFIX}${i}`);
    }

    registerLeavesComponent({ blockComponentRegistry });
    registerInvisibleComponent({ blockComponentRegistry });
    registerCurtainComponent({ blockComponentRegistry });
    registerWoodComponent({ blockComponentRegistry });
    // registerFenceComponent({ blockComponentRegistry }); // TODO: No blocks use this component yet
    registerSaplingComponent({ blockComponentRegistry });
    // registerWallComponent({ blockComponentRegistry }); // TODO: No blocks use this component yet
    registerButtonComponent({ blockComponentRegistry });
    registerPressurePlateComponent({ blockComponentRegistry });
    registerStairsComponent({ blockComponentRegistry });
    registerSignComponent({ blockComponentRegistry });
    registerGeyserComponent({ blockComponentRegistry });
    // registerSandstoneComponent({ blockComponentRegistry }); // TODO: No blocks use this component yet
    // registerStoneSlabComponent({ blockComponentRegistry }); // TODO: No blocks use this component yet
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

