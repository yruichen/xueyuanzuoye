#!/usr/bin/env python3
"""Quick fix to create app.js from git history"""
import subprocess
import os
import sys

print("=" * 60)
print("Creating app.js from git history...")
print("=" * 60)

try:
    # Get old HTML from git
    result = subprocess.run(
        ['git', 'show', 'HEAD~1:homework.html'],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )

    if result.returncode != 0:
        print(f"✗ Git error: {result.stderr}")
        sys.exit(1)

    content = result.stdout
    print(f"✓ Retrieved old HTML ({len(content)} chars)")

    # Extract JavaScript
    start = content.find('<script>')
    end = content.find('</script>', start)

    if start == -1 or end == -1:
        print("✗ Could not find <script> tags")
        sys.exit(1)

    js_content = content[start+8:end].strip()
    print(f"✓ Extracted JavaScript ({len(js_content)} chars, {len(js_content.splitlines())} lines)")

    # Write to file
    output_file = 'static/js/app.js'
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(js_content)

    # Verify
    if os.path.exists(output_file):
        size = os.path.getsize(output_file)
        print(f"✓ Created {output_file} ({size} bytes)")

        # Check if it's readable
        with open(output_file, 'r', encoding='utf-8') as f:
            first_line = f.readline().strip()
        print(f"✓ First line: {first_line[:60]}...")

        print("\n" + "=" * 60)
        print("SUCCESS! Now:")
        print("1. Refresh your browser (http://localhost:5001)")
        print("2. Open browser console (F12) to check for errors")
        print("3. Students should now load automatically")
        print("=" * 60)
    else:
        print("✗ File was not created")
        sys.exit(1)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
