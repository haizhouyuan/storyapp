# PWA Icons Directory

此目录包含PWA所需的各种尺寸图标。

## 图标规格要求

### 必需图标
- icon-192x192.png - 最小推荐尺寸，支持maskable
- icon-512x512.png - 推荐启动图标，支持maskable

### 其他尺寸
- icon-72x72.png - 小屏设备
- icon-96x96.png - 标准尺寸
- icon-128x128.png - 中等尺寸
- icon-144x144.png - 高密度屏幕
- icon-152x152.png - iOS设备
- icon-384x384.png - 大尺寸

### 快捷方式图标
- shortcut-new-story.png - "创建新故事"快捷方式图标
- shortcut-my-stories.png - "我的故事"快捷方式图标

## 图标设计
所有图标基于 `icon-base.svg` 设计，包含：
- 儿童友好的睡前故事主题
- 主题色 #A8E6CF (柔和绿色)
- 可爱的睡觉小熊和开放的故事书
- 月亮、星星和魔法棒装饰元素

## Maskable Icons
192x192和512x512图标支持maskable purpose，确保在不同平台的安装界面中正确显示。

## 生成图标
使用以下命令重新生成所有尺寸的图标：
```bash
npm run generate:icons
```

该命令会从 `icon-base.svg` 生成所有需要的PNG图标。

## 生成工具推荐
- [PWA Builder](https://www.pwabuilder.com/) - 自动生成各种尺寸
- [Favicon Generator](https://realfavicongenerator.net/) - 生成完整图标集
- [Maskable.app](https://maskable.app/) - 测试maskable图标效果

## 注意事项
- 所有图标应使用相同的视觉设计
- 确保maskable图标的安全区域设计
- 图标应体现应用的核心功能和品牌形象
- 修改图标时请编辑 `icon-base.svg` 然后运行生成命令