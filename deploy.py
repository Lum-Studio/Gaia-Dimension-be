import os
import shutil
import sys

# SYSTEM UPDATE SCRIPT EHEHEHHEE

# Get the absolute path of the directory where the script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Source Project Folders
BP_PATH = os.path.join("src", "main", "bedrock", "data")
RP_PATH = os.path.join("src", "main", "bedrock", "resources")

# Updated Mojang Folder Configuration
APPDATA = os.environ.get("APPDATA", r"C:\Users\OS\AppData\Roaming")
MOJANG_DIR = os.path.join(APPDATA, "Minecraft Bedrock", "Users", "Shared", "games", "com.mojang")

DEV_BP_DIR = os.path.join(MOJANG_DIR, 'development_behavior_packs', 'GaiaDimensions_BP')
DEV_RP_DIR = os.path.join(MOJANG_DIR, 'development_resource_packs', 'GaiaDimension_RP')

def deploy():
    print("--- Starting Gaia Dimension Deployment Script ---")
    print(f"Found Minecraft folder: {MOJANG_DIR}")

    # Helper function for copying
    def copy_pack(src, dst, pack_name):
        if os.path.exists(dst):
            print(f"Deleting old {pack_name} at: {dst}")
            try:
                shutil.rmtree(dst)
            except Exception as e:
                print(f"ERROR deleting folder {dst}: {e}")
                return False
        
        print(f"Copying {pack_name} to: {dst}")
        try:
            shutil.copytree(src, dst)
            return True
        except Exception as e:
            print(f"ERROR copying {pack_name}: {e}")
            return False

    if not copy_pack(BP_PATH, DEV_BP_DIR, "Behavior Pack"):
        sys.exit(1)
        
    if not copy_pack(RP_PATH, DEV_RP_DIR, "Resource Pack"):
        sys.exit(1)

    print("\n--- Deployment Complete! ---")
    print("You can now launch Minecraft.")

if __name__ == "__main__":
    deploy()
