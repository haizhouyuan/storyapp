// Jest全局清理 - 用于非CI环境的内存数据库
export default async (): Promise<void> => {
  console.log('🧹 测试环境清理完成');
};