#!/usr/bin/env python3
import subprocess
import os

print("Starting JavaScript extraction...")

# Run git show command
proc = subprocess.Popen(
    ['git', 'show', 'HEAD~1:homework.html'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

stdout, stderr = proc.communicate()

if proc.returncode != 0:
    print(f"Git error: {stderr}")
    exit(1)

print(f"Git output length: {len(stdout)} chars")

# Find script section
in_script = False
js_lines = []
for line in stdout.split('\n'):
    if '<script>' in line and not 'src=' in line:
        in_script = True
        continue
    elif '</script>' in line and in_script:
        break
    elif in_script:
        js_lines.append(line)

js_content = '\n'.join(js_lines)

print(f"Extracted {len(js_lines)} lines of JavaScript")
print(f"Content length: {len(js_content)} chars")

# Write to file
output_path = 'static/js/app.js'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

# Verify
if os.path.exists(output_path):
    size = os.path.getsize(output_path)
    print(f"✓ File written: {output_path}")
    print(f"✓ File size: {size} bytes")

    # Read back first few lines to verify
    with open(output_path, 'r', encoding='utf-8') as f:
        first_lines = f.read(500)
    print(f"✓ First 500 chars: {first_lines[:100]}...")
else:
    print(f"✗ File not found after writing!")
