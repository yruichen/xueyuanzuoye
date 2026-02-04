#!/usr/bin/env python3
"""
验证视图切换和主题切换功能
"""
import os
import sys

print("=" * 60)
print("验证修复...")
print("=" * 60)

# 检查 app.js 文件
app_js = 'static/js/app.js'
if not os.path.exists(app_js):
    print(f"✗ {app_js} 不存在")
    sys.exit(1)

with open(app_js, 'r', encoding='utf-8') as f:
    content = f.read()

# 检查关键函数是否存在
checks = {
    'initThemeToggle': '主题切换初始化函数',
    'updateThemeToggleButton': '主题切换按钮更新函数',
    'initViewSwitcher': '视图切换初始化函数',
    'initEventListeners': '事件监听器初始化函数',
    'DOMContentLoaded': 'DOM 加载完成监听',
}

print("\n检查关键功能:")
print("-" * 60)
all_ok = True
for key, desc in checks.items():
    if key in content:
        print(f"✓ {desc}")
    else:
        print(f"✗ {desc} - 缺失")
        all_ok = False

# 检查主题切换逻辑
print("\n检查主题切换逻辑:")
print("-" * 60)
if "localStorage.getItem('theme')" in content:
    print("✓ 主题状态保存到 localStorage")
else:
    print("✗ 缺少主题状态保存")
    all_ok = False

if "document.documentElement.setAttribute('data-theme'" in content:
    print("✓ 设置 data-theme 属性")
else:
    print("✗ 缺少 data-theme 设置")
    all_ok = False

# 检查视图切换逻辑
print("\n检查视图切换逻辑:")
print("-" * 60)
if "viewWrapper" in content and "flipping" in content:
    print("✓ 视图包装器和翻转类")
else:
    print("✗ 缺少视图翻转逻辑")
    all_ok = False

if "currentView === view" in content:
    print("✓ 防止重复切换")
else:
    print("⚠ 建议添加防止重复切换")

print("\n" + "=" * 60)
if all_ok:
    print("✓ 所有检查通过！")
    print("\n请执行以下操作:")
    print("1. 刷新浏览器页面 (Cmd+Shift+R 强制刷新)")
    print("2. 测试主题切换按钮 (右上角)")
    print("3. 测试视图切换按钮 (卡片/表格)")
    print("4. 打开浏览器控制台 (F12) 查看是否有错误")
else:
    print("✗ 部分检查失败，请检查上述问题")

print("=" * 60)
