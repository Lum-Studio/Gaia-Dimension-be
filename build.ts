import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import * as esbuild from 'esbuild';
import AdmZip from 'adm-zip';

const appData = process.env.APPDATA || '';
const bedrockBase = path.join(appData, 'Minecraft Bedrock/Users');
const extraPaths: string[] = [];
if (fs.existsSync(bedrockBase)) {
    for (const d of fs.readdirSync(bedrockBase)) {
        extraPaths.push(path.join(bedrockBase, d, 'games/com.mojang'));
    }
}
const bedrockPreviewBase = path.join(appData, 'Minecraft Bedrock Preview/Users');
if (fs.existsSync(bedrockPreviewBase)) {
    for (const d of fs.readdirSync(bedrockPreviewBase)) {
        extraPaths.push(path.join(bedrockPreviewBase, d, 'games/com.mojang'));
    }
}

const MOJANG_PATHS = [
    ...extraPaths
].filter(p => fs.existsSync(p));

const ROOT = process.cwd();
const SRC_BEDROCK = path.join(ROOT, 'src/main/bedrock');
const SRC_DATA = path.join(SRC_BEDROCK, 'data');
const SRC_RESOURCES = path.join(SRC_BEDROCK, 'resources');
const SRC_TS = path.join(SRC_BEDROCK, 'ts');
const BUILD_PATH = path.join(ROOT, 'build');

const TSX_CLI = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs');

async function runCommand(cmd: string, description?: string) {
    if (description) console.log(`[INFO] ${description}...`);
    const formattedCmd = cmd.replace(/^npx tsx /, `"${process.execPath}" "${TSX_CLI}" `);
    execSync(formattedCmd, { stdio: 'inherit', cwd: ROOT });
}

async function build() {
    const startTime = Date.now();
    console.log('\x1b[32m> Task :compileJava\x1b[0m');
    console.log('[INFO] Scanning for projects...');
    console.log('[INFO] ------------------------------------------------------------------------');
    console.log('[INFO] Building Gaia Dimension Addon 1.0.0-SNAPSHOT');
    console.log('[INFO] ------------------------------------------------------------------------');

    // 1. Run Registries/Resources
    console.log('\x1b[32m> Task :processResources\x1b[0m');
    await runCommand('npx tsx src/main/bedrock/datagen/ItemGenerator.ts');
    await runCommand('npx tsx src/main/bedrock/datagen/MagicStaffGenerator.ts');
    await runCommand('npx tsx src/main/bedrock/datagen/ProjectileGenerator.ts');
    await runCommand('npx tsx src/main/bedrock/datagen/GrassGenerator.ts');
    await runCommand('npx tsx src/main/bedrock/datagen/GaiaGrassGenerator.ts');
    await runCommand('npx tsx src/main/bedrock/datagen/AuraShootGenerator.ts');

    // 2. Bundle Scripts
    console.log('\x1b[32m> Task :compileScripts\x1b[0m');
    console.log('[INFO] Compiling TypeScript sources...');
    const entryPoint = path.join(SRC_TS, 'GaiaDimensionAddon.ts');
    const outfile = path.join(SRC_DATA, 'scripts/GaiaDimensionAddon.js');

    await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        format: 'esm',
        minify: false,
        sourcemap: true,
        external: [
            '@minecraft/server',
            '@minecraft/server-ui',
            '@minecraft/server-gametest',
            '@minecraft/server-admin',
            '@minecraft/server-editor',
            '@minecraft/server-net'
        ],
        outfile: outfile,
    });
    console.log(`[INFO] Bundled artifact to: ${outfile}`);

    // 3. Package mcaddon
    console.log('\x1b[32m> Task :packagemcaddon\x1b[0m');
    await fs.ensureDir(BUILD_PATH);
    const addonFile = path.join(BUILD_PATH, 'GaiaDimension.mcaddon');
    
    const zip = new AdmZip();
    
    // Add BP
    const bpZip = new AdmZip();
    bpZip.addLocalFolder(SRC_DATA, undefined, (src) => {
        const rel = path.relative(SRC_DATA, src);
        return !rel.split(path.sep).includes('src');
    });
    zip.addFile('GaiaDimension_BP.mcpack', bpZip.toBuffer());

    // Add RP
    const rpZip = new AdmZip();
    rpZip.addLocalFolder(SRC_RESOURCES);
    zip.addFile('GaiaDimension_RP.mcpack', rpZip.toBuffer());

    zip.writeZip(addonFile);
    console.log(`[INFO] Generated mcaddon at: ${addonFile}`);

    // 4. Deploy
    console.log('\x1b[32m> Task :compileAddon\x1b[0m');
    
    for (const mojangPath of MOJANG_PATHS) {
        const targetBP = path.join(mojangPath, 'development_behavior_packs/GaiaDimensions_BP');
        const targetRP = path.join(mojangPath, 'development_resource_packs/GaiaDimension_RP');

        console.log(`[INFO] Syncing to: ${mojangPath}`);
        
        // Clean and ensure directories
        await fs.emptyDir(targetBP);
        await fs.emptyDir(targetRP);

        // Sync BP (excluding src folder if it exists in data)
        await fs.copy(SRC_DATA, targetBP, {
            overwrite: true,
            filter: (src) => {
                const rel = path.relative(SRC_DATA, src);
                return !rel.split(path.sep).includes('src');
            }
        });

        // Sync RP
        await fs.copy(SRC_RESOURCES, targetRP, { overwrite: true });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);
    console.log('[INFO] ------------------------------------------------------------------------');
    console.log('\x1b[32mBUILD SUCCESSFUL\x1b[0m in ' + duration + 's');
    console.log('[INFO] ------------------------------------------------------------------------');
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
