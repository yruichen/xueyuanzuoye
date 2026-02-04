#!/usr/bin/env python3
"""
Safe repository restructure script.
- Dry-run mode (--dry-run) prints planned operations.
- Default mode prompts and then applies moves, creating a timestamped backup of touched files.
- Use --yes to skip confirmation.

Designed for this repository structure. It is conservative: it only moves existing files and skips missing ones.
"""
import argparse
import shutil
from pathlib import Path
from datetime import datetime


def timestamp():
    return datetime.now().strftime('%Y%m%d-%H%M%S')


REPO_ROOT = Path(__file__).resolve().parents[1]

# Planned moves: (source_relative, dest_relative)
PLANNED_MOVES = [
    ("stu_homework.py", "src/xueyuanzuoye/stu_homework.py"),
    ("static", "src/xueyuanzuoye/static"),
    ("templates", "src/xueyuanzuoye/templates"),
    ("run_server.py", "scripts/run_server.py"),
    ("fix_app_js.py", "tools/fix_app_js.py"),
    ("extract_js.py", "tools/extract_js.py"),
    ("write_js.py", "tools/write_js.py"),
    ("verify_fixes.py", "tools/verify_fixes.py"),
    ("test_setup.py", "tools/test_setup.py"),
    ("smoke_check.py", "tools/smoke_check.py"),
    ("FIX_SUMMARY.txt", "docs/archives/FIX_SUMMARY.txt"),
    ("FIXES_README.md", "docs/archives/FIXES_README.md"),
    ("uv.lock", "locks/uv.lock"),
    ("students.json", "data/students.json"),
    ("state.json", "data/state.json"),
]


def gather_operations(root: Path):
    ops = []
    for src_rel, dst_rel in PLANNED_MOVES:
        src = root / src_rel
        dst = root / dst_rel
        ops.append((src, dst))
    return ops


def make_dirs_for(dst: Path):
    p = dst.parent
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)


def backup_and_move(src: Path, dst: Path, backup_root: Path, dry_run=False):
    if not src.exists():
        return False, 'missing'
    # Compute backup path
    rel = src.relative_to(REPO_ROOT)
    backup_path = backup_root / rel
    if dry_run:
        return True, f"would_backup:{backup_path} -> would_move:{dst}"
    # Ensure backup parent exists
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    # Copy file/dir to backup
    if src.is_dir():
        shutil.copytree(src, backup_path)
    else:
        shutil.copy2(src, backup_path)
    # Ensure destination parent exists
    make_dirs_for(dst)
    # Move (preserve) -- use shutil.move
    shutil.move(str(src), str(dst))
    return True, f"moved to {dst} (backup at {backup_path})"


def print_plan(ops):
    print("Planned operations:")
    for src, dst in ops:
        status = "exists" if src.exists() else "missing"
        print(f" - {src.relative_to(REPO_ROOT)} -> {dst.relative_to(REPO_ROOT)} [{status}]")


def main():
    parser = argparse.ArgumentParser(description='Safe restructure script for repository')
    parser.add_argument('--dry-run', '-n', action='store_true', help='Show planned operations without making changes')
    parser.add_argument('--yes', '-y', action='store_true', help='Apply changes without confirmation')
    parser.add_argument('--apply-pyproject', action='store_true', help='(Optional) apply suggested pyproject.toml changes (not implemented)')
    args = parser.parse_args()

    ops = gather_operations(REPO_ROOT)
    print_plan(ops)

    if args.dry_run:
        print('\nDry-run mode: no files will be modified.')
        return

    # Confirm
    if not args.yes:
        ans = input('\nProceed with the above operations? [y/N]: ').strip().lower()
        if ans not in ('y', 'yes'):
            print('Aborted by user.')
            return

    ts = timestamp()
    backup_root = REPO_ROOT / 'backups' / ts
    backup_root.mkdir(parents=True, exist_ok=True)
    log_lines = []

    for src, dst in ops:
        ok, msg = backup_and_move(src, dst, backup_root, dry_run=False)
        line = f"{src.relative_to(REPO_ROOT)} -> {dst.relative_to(REPO_ROOT)} : {msg}"
        log_lines.append(line)
        print(line)

    # Write log
    log_file = backup_root / 'restructure-log.txt'
    with open(log_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(log_lines))

    print(f"\nDone. Backup of moved files is in: {backup_root}")
    print("To restore, copy files from the backup directory back to the repository root.")


if __name__ == '__main__':
    main()
