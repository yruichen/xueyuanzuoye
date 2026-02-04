#!/usr/bin/env python3
import re
import os

# Read the old HTML file from git
with open('/tmp/old_homework.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract JavaScript between <script> and </script> tags
match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
if match:
    js_content = match.group(1).strip()

    # Ensure directory exists
    os.makedirs('static/js', exist_ok=True)

    # Write to app.js
    with open('static/js/app.js', 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f'✓ JavaScript extracted successfully')
    print(f'Lines written: {len(js_content.splitlines())}')
    print(f'File size: {len(js_content)} bytes')

    # Verify
    if os.path.exists('static/js/app.js'):
        size = os.path.getsize('static/js/app.js')
        print(f'File created: static/js/app.js ({size} bytes)')
    else:
        print('✗ File not found after writing')
else:
    print('✗ Could not find JavaScript in HTML')
