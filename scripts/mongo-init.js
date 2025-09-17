// MongoDB初始化脚本
// 创建应用用户和初始数据

print('🚀 开始初始化MongoDB数据库...');

// 切换到应用数据库
db = db.getSiblingDB('storyapp');

// 创建集合（可选，MongoDB会自动创建）
db.createCollection('stories');

// 创建索引以提高查询性能
db.stories.createIndex({ "title": "text", "content": "text" });
db.stories.createIndex({ "created_at": -1 });
db.stories.createIndex({ "updated_at": -1 });

print('📚 创建stories集合并建立索引');

// 插入示例数据（可选）
db.stories.insertOne({
    title: "欢迎使用故事应用",
    content: JSON.stringify({
        story: [
            {
                content: "欢迎来到神奇的故事世界！这是一个专为儿童设计的互动故事应用。",
                choices: [
                    { text: "开始探索", next: 1 },
                    { text: "了解更多", next: 2 }
                ]
            },
            {
                content: "让我们一起创造属于你的独特故事吧！",
                choices: []
            },
            {
                content: "这个应用使用AI技术为每个孩子生成个性化的睡前故事。",
                choices: []
            }
        ]
    }),
    created_at: new Date(),
    updated_at: new Date()
});

print('✨ 插入示例故事数据');

// 显示数据库状态
print('📊 数据库初始化完成！');
print('集合数量：' + db.getCollectionNames().length);
print('stories文档数量：' + db.stories.countDocuments());