---
title: "从 GameObject 到物理组件：Unity L03 学习笔记"
date: 2026-08-04
category: tech
tags: [Unity, C#, 游戏开发, L03, 学习笔记]
summary: "记录目前学到的 Unity 与 C# 基础：脚本生命周期、GameObject 与 Component、输入移动、类的职责，以及 L03 作业中的物理系统预习。"
draft: false
---

这是一篇给未来自己的 Unity 学习记录。目标不是把概念写得像官方文档，而是把目前真正见过、写过、困惑过的东西放在同一张地图上。

## 先说结论：现在学到哪里了

我还没有学会“开发所有类型的游戏”，但已经走过了 Unity 入门最重要的一段：能够创建一个 GameObject，把脚本挂上去，在 `Start` 和 `Update` 中控制它，并开始理解输入、移动、组件和类之间的关系。

目前的练习重点是 2D 小游戏。一个合理的短期目标是：让玩家移动、检测碰撞、收集物品、记录分数，再处理失败或胜利。

## Unity 的基本心智模型

Unity 场景里的对象通常可以这样理解：

```text
GameObject
├── Transform       位置、旋转、缩放
├── SpriteRenderer  显示图片和颜色
├── Collider2D      碰撞形状
├── Rigidbody2D     物理运动
└── MonoBehaviour   自己写的脚本功能
```

`GameObject` 更像一个容器。真正让它拥有“显示”“碰撞”“移动”等能力的，是挂在它身上的 Component。

所以脚本里经常会出现：

```csharp
GetComponent<SpriteRenderer>()
```

意思不是创建一个新的 SpriteRenderer，而是从当前 GameObject 身上找到已经挂载的这个组件。

## `MonoBehaviour` 和生命周期

可以挂到 GameObject 上的普通 Unity 脚本通常继承自 `MonoBehaviour`：

```csharp
public class PlayerMovement : MonoBehaviour
{
}
```

Unity 会在合适的时间调用特殊方法：

```csharp
private void Start()
{
    // 初始化，通常只执行一次
}

private void Update()
{
    // 每帧执行，适合读取输入和处理实时逻辑
}
```

可以先这样记：

- `Start`：游戏开始时准备东西。
- `Update`：游戏运行中反复检查和执行。

## 输入：按下和按住不是一回事

教程里的旧版输入写法可能是：

```csharp
Input.GetKey(KeyCode.W)
```

`GetKey` 只要按键保持按下，每一帧都可能返回 `true`，适合持续移动。

```csharp
Input.GetKeyDown(KeyCode.Space)
```

`GetKeyDown` 只在刚刚按下的那一帧返回 `true`，适合跳跃、打开菜单、触发一次攻击等动作。

这个项目启用了新版 Input System，因此实际练习中也会见到：

```csharp
Keyboard.current.wKey.isPressed
```

它和 `GetKey` 的使用意图相近：都是检查一个键当前是否被按住。旧版 Input Manager 和新版 Input System 是两套 API，不能只看代码长得像不像，还要看项目启用了哪一套输入设置。

## WASD、方向向量和移动

输入本身不会移动玩家。输入只是先被转换成一个方向：

```text
W → (0, 1)
S → (0, -1)
A → (-1, 0)
D → (1, 0)
```

然后把这个方向交给 Transform：

```text
键盘输入 → input 方向 → movement 位移 → transform.Translate
```

截图教程使用 `else if`，意味着一次只选一个方向，因此更容易理解，但不能同时处理 W+D 这样的斜向移动。使用多个独立的 `if`，水平和垂直输入可以叠加，就能产生斜向量。

斜向移动有一个常见问题：`(1, 1)` 的长度比 `(1, 0)` 更长，所以角色会斜着走得更快。`normalized` 可以把方向长度限制为 1：

```csharp
input = input.normalized;
```

移动时还要乘上：

```csharp
Time.deltaTime
```

如果不乘它，物体每帧移动固定距离，帧率越高的电脑移动越快。乘上 `deltaTime` 后，速度更接近“每秒移动多少单位”。

## Transform 怎样变得更可控

最基础的 Transform 移动是直接修改位置，或者调用：

```csharp
transform.Translate(...)
```

它适合现在的入门练习：输入简单、对象没有复杂物理交互时很直观。

想要更丝滑，可以让当前速度逐渐接近目标速度，而不是按下按键就瞬间达到最高速度，松开就瞬间停止。这就是加速和减速的思路。

如果对象带有 `Rigidbody2D`，并且需要墙壁、地面、重力或真实碰撞，后面应该学习通过 Rigidbody2D 来移动，而不是一边使用物理组件、一边直接改 Transform。直接改 Transform 可能让物理系统来不及正确处理碰撞。

## 类应该各自负责什么

这次最重要的不是记住某个 API，而是开始区分代码的职责。

```text
PlayerMovement.cs   玩家输入和移动
PlayerHealth.cs     玩家生命值和受伤
Enemy.cs            敌人的行为
Coin.cs             金币被收集时发生什么
GameManager.cs      分数、胜负和整体游戏状态
UIManager.cs        文本、按钮和面板显示
```

判断一段代码应该放在哪个类，可以问：

> 这段代码描述的是谁的行为？

描述玩家移动，就放进玩家移动类；描述金币被收集，就放进金币类；描述整个游戏何时结束，就交给游戏管理器。

一个类尽量只负责一件事，不是为了让文件变多，而是为了让修改时不至于牵一发动全身。

## `public`、`private` 和 `[SerializeField]`

`public` 表示其他脚本也可以访问这个变量，Unity Inspector 通常也能显示它。

`private` 表示变量只属于当前类，其他脚本不能直接访问。

`[SerializeField] private` 是 Unity 中常见的折中方式：变量仍然由当前类保护，但可以显示在 Inspector 中手动调整。它不是现在必须背下来的语法，只是以后学习封装时会越来越有用。

## `static` 到底是什么意思

`static` 可以先理解成：这个东西属于“类本身”，而不是属于某一个具体对象。

普通变量属于对象：

```csharp
Player playerA;
Player playerB;
```

如果每个玩家对象都有自己的生命值，那么生命值不是静态的。`playerA` 和 `playerB` 可以有不同生命值。

静态变量属于整个类，所有对象共享同一份：

```csharp
public static int score;
```

这通常适合表达全局共享的数据，例如当前分数、游戏是否结束、唯一的游戏管理器实例。

但 `static` 不能随便滥用。它的代价是依赖关系变得隐蔽、测试和重置更麻烦。初学阶段先记住：

- 只属于某个对象的状态，不要急着写 `static`。
- 整个游戏共享的一份状态，才考虑 `static`。
- Unity 中常见的 `GameManager.Instance` 是一种单例写法，后面需要专门学习它的优缺点。

## L03 作业正在练什么

这次作业看起来只是控制三个圆，实际是在练习 Unity 的核心连接：

1. 修改 GameObject 的 Component，例如 SpriteRenderer 的颜色。
2. 修改 Transform，例如位置和缩放。
3. 让一个对象移动到另一个对象的位置。
4. 从一个对象读取组件，再把结果交给另一个对象。
5. 克隆 GameObject，也就是 Instantiate。
6. 监听键盘输入，再删除对象，也就是 Destroy。
7. 按住按键时，每帧执行逻辑，并使用随机颜色。

建议严格按照 Task 1 到 Task 7 完成，每完成一个就运行一次场景。不要一口气把七个任务全部写完，否则出错时很难判断是哪一步出了问题。

## 当前的学习路线

目前已经接触到：

- C# 类和继承
- `MonoBehaviour`
- `Start` 与 `Update`
- GameObject 和 Component
- Transform、Vector2、Vector3
- SpriteRenderer 和颜色
- 新旧输入系统的区别
- `GetKey` 与 `GetKeyDown`
- 多个 `if` 与 `else if`
- `Time.deltaTime`
- `normalized`
- 类的职责划分
- `public`、`private` 和 `[SerializeField]`
- `static` 的基本概念
- L03 作业中的 Instantiate、Destroy、Collider、Rigidbody、Trigger、Raycast 等后续主题

下一步不需要继续堆概念。最有效的练习是完成 L03，然后做一个很小的 2D 原型：玩家移动、收集金币、分数增加、碰到敌人失败。只要这个闭环能运行，就说明这些基础知识已经开始真正连起来了。
