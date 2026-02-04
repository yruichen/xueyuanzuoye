#!/usr/bin/env python3
"""
快速测试脚本 - 验证主页和 API 是否正常工作
"""

import sys
import json
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent / "src"))

def test_imports():
    """测试所有必要的导入"""
    print("🔍 测试 1: 检查模块导入...")
    try:
        from xueyuanzuoye import stu_homework
        print("✅ 模块导入成功")
        return True
    except Exception as e:
        print(f"❌ 模块导入失败: {e}")
        return False

def test_functions():
    """测试关键函数是否存在"""
    print("\n🔍 测试 2: 检查关键函数...")
    try:
        from xueyuanzuoye import stu_homework

        required_functions = [
            'get_cached_response',
            'set_cached_response',
            'invalidate_cache',
            'get_avatar_url',
            'calculate_badges',
            'extract_github_username'
        ]

        for func_name in required_functions:
            if not hasattr(stu_homework, func_name):
                print(f"❌ 缺少函数: {func_name}")
                return False
            print(f"✅ 找到函数: {func_name}")

        return True
    except Exception as e:
        print(f"❌ 函数检查失败: {e}")
        return False

def test_avatar_url():
    """测试头像 URL 生成"""
    print("\n🔍 测试 3: 测试头像 URL 生成...")
    try:
        from xueyuanzuoye import stu_homework

        test_cases = [
            ("https://github.com/octocat/Hello-World", "https://github.com/octocat.png?size=80"),
            ("https://github.com/torvalds/linux", "https://github.com/torvalds.png?size=80"),
        ]

        for repo_url, expected in test_cases:
            result = stu_homework.get_avatar_url(repo_url)
            if result == expected:
                print(f"✅ {repo_url} -> {result}")
            else:
                print(f"❌ {repo_url} -> 预期: {expected}, 实际: {result}")
                return False

        return True
    except Exception as e:
        print(f"❌ 头像测试失败: {e}")
        return False

def test_badges():
    """测试徽章计算"""
    print("\n🔍 测试 4: 测试徽章计算...")
    try:
        from xueyuanzuoye import stu_homework

        # 测试完美主义者
        student1 = {"scores": [100, 100, 100, 100, 100]}
        state1 = {"commits_count": 0}
        badges1 = stu_homework.calculate_badges(student1, state1)

        has_perfect = any(b['name'] == '完美主义者' for b in badges1)
        if has_perfect:
            print(f"✅ 完美主义者徽章: {badges1[0]}")
        else:
            print(f"❌ 未找到完美主义者徽章")
            return False

        # 测试超级肝帝
        student2 = {"scores": [80, 80, 80, 80, 80]}
        state2 = {"commits_count": 150}
        badges2 = stu_homework.calculate_badges(student2, state2)

        has_super = any(b['name'] == '超级肝帝' for b in badges2)
        if has_super:
            print(f"✅ 超级肝帝徽章: {[b for b in badges2 if b['name'] == '超级肝帝'][0]}")
        else:
            print(f"❌ 未找到超级肝帝徽章")
            return False

        return True
    except Exception as e:
        print(f"❌ 徽章测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_cache():
    """测试缓存功能"""
    print("\n🔍 测试 5: 测试缓存功能...")
    try:
        from xueyuanzuoye import stu_homework

        # 设置缓存
        test_data = {"test": "data"}
        stu_homework.set_cached_response('test_key', test_data)
        print("✅ 缓存设置成功")

        # 获取缓存
        cached = stu_homework.get_cached_response('test_key')
        if cached == test_data:
            print(f"✅ 缓存读取成功: {cached}")
        else:
            print(f"❌ 缓存数据不匹配: 预期 {test_data}, 实际 {cached}")
            return False

        # 清除缓存
        stu_homework.invalidate_cache()
        cached_after = stu_homework.get_cached_response('test_key')
        if cached_after is None:
            print("✅ 缓存清除成功")
        else:
            print(f"❌ 缓存未清除: {cached_after}")
            return False

        return True
    except Exception as e:
        print(f"❌ 缓存测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """运行所有测试"""
    print("=" * 60)
    print("🚀 开始测试 QG AI 训练营作业管理系统")
    print("=" * 60)

    tests = [
        test_imports,
        test_functions,
        test_avatar_url,
        test_badges,
        test_cache
    ]

    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ 测试异常: {e}")
            results.append(False)

    print("\n" + "=" * 60)
    print("📊 测试结果汇总")
    print("=" * 60)

    passed = sum(results)
    total = len(results)

    print(f"通过: {passed}/{total}")
    print(f"失败: {total - passed}/{total}")

    if all(results):
        print("\n🎉 所有测试通过！系统已就绪！")
        print("\n💡 下一步:")
        print("   1. 启动服务器: python -m src.xueyuanzuoye.stu_homework")
        print("   2. 访问主页: http://localhost:5000")
        print("   3. 访问排行榜: http://localhost:5000/leaderboard")
        return 0
    else:
        print("\n⚠️  部分测试失败，请检查上面的错误信息")
        return 1

if __name__ == "__main__":
    sys.exit(main())
