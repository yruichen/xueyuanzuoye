#!/usr/bin/env python3
"""
Test script to verify the homework monitoring system setup
"""
import os
import sys
import requests
import json

def check_file_exists(path, description):
    """Check if a file exists"""
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"✓ {description}: EXISTS ({size} bytes)")
        return True
    else:
        print(f"✗ {description}: NOT FOUND")
        return False

def check_server_running(url="http://localhost:5001"):
    """Check if server is running"""
    try:
        response = requests.get(url, timeout=2)
        print(f"✓ Server is running at {url}")
        print(f"  Status: {response.status_code}")
        return True
    except requests.exceptions.ConnectionError:
        print(f"✗ Server is NOT running at {url}")
        return False
    except Exception as e:
        print(f"✗ Error checking server: {e}")
        return False

def check_api_endpoint(url="http://localhost:5001/api/list"):
    """Check if API endpoint works"""
    try:
        response = requests.get(url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ API endpoint working")
            print(f"  Students count: {len(data)}")
            return True
        else:
            print(f"✗ API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ API error: {e}")
        return False

def check_static_files(base_url="http://localhost:5001"):
    """Check if static files are accessible"""
    files = {
        "/static/css/styles.css": "CSS file",
        "/static/js/app.js": "JavaScript file"
    }

    results = {}
    for path, desc in files.items():
        try:
            response = requests.get(f"{base_url}{path}", timeout=2)
            if response.status_code == 200:
                print(f"✓ {desc}: ACCESSIBLE ({len(response.content)} bytes)")
                results[path] = True
            else:
                print(f"✗ {desc}: STATUS {response.status_code}")
                results[path] = False
        except Exception as e:
            print(f"✗ {desc}: ERROR {e}")
            results[path] = False

    return all(results.values())

def main():
    print("=" * 60)
    print("Homework Monitoring System - Setup Verification")
    print("=" * 60)
    print()

    # Check files
    print("1. Checking files...")
    print("-" * 60)
    files_ok = all([
        check_file_exists("static/homework.html", "HTML file"),
        check_file_exists("static/css/styles.css", "CSS file"),
        check_file_exists("static/js/app.js", "JavaScript file"),
        check_file_exists("stu_homework.py", "Backend file"),
        check_file_exists("students.json", "Students data")
    ])
    print()

    # Check server
    print("2. Checking server...")
    print("-" * 60)
    server_ok = check_server_running()
    print()

    if not server_ok:
        print("⚠ Server is not running. Please start it with:")
        print("  python3 run_server.py")
        print()
        sys.exit(1)

    # Check API
    print("3. Checking API...")
    print("-" * 60)
    api_ok = check_api_endpoint()
    print()

    # Check static files
    print("4. Checking static files...")
    print("-" * 60)
    static_ok = check_static_files()
    print()

    # Summary
    print("=" * 60)
    print("Summary:")
    print("=" * 60)
    print(f"Files: {'✓ OK' if files_ok else '✗ FAILED'}")
    print(f"Server: {'✓ OK' if server_ok else '✗ FAILED'}")
    print(f"API: {'✓ OK' if api_ok else '✗ FAILED'}")
    print(f"Static Files: {'✓ OK' if static_ok else '✗ FAILED'}")
    print()

    if all([files_ok, server_ok, api_ok, static_ok]):
        print("✓ All checks passed! Your system is ready.")
        print(f"  Open http://localhost:5001 in your browser")
    else:
        print("✗ Some checks failed. Please review the errors above.")

    print("=" * 60)

if __name__ == "__main__":
    main()
