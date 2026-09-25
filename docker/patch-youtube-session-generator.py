from pathlib import Path
import sys

path = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "/opt/yt-session/potoken_generator/extractor.py"
)

source = path.read_text()

if "sandbox=False" in source:
    print(f"{path}: sandbox workaround already present")
    raise SystemExit(0)

needle = """browser = await nodriver.start(headless=False,
                                               browser_executable_path=self.browser_path,
                                               user_data_dir=self.profile_path)"""

replacement = """browser = await nodriver.start(headless=False,
                                               sandbox=False,
                                               browser_executable_path=self.browser_path,
                                               user_data_dir=self.profile_path)"""

count = source.count(needle)
if count != 1:
    raise SystemExit(
        f"{path}: expected exactly one nodriver.start call shape, found {count}; "
        "upstream changed and the sandbox workaround must be reviewed"
    )

path.write_text(source.replace(needle, replacement, 1))
print(f"{path}: disabled Chromium sandbox for containerized root execution")
