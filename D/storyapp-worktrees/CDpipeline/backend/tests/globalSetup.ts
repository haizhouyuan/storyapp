// Jest全局设置 - 用于非CI环境的内存数据库
export default async (): Promise<void> => {
  if (!process.env.CI) {
    console.log('🧪 本地测试环境 - 使用内存数据库');
  } else {
    console.log('🧪 CI测试环境 - 使用真实MongoDB');
  }
};