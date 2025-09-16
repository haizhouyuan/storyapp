# 生产环境Docker容器测试报告

## 测试概要
- **测试时间**: 2025-09-11T07:44:04.742Z
- **测试环境**: production-docker
- **通过测试**: 4/7
- **失败测试**: 3/7
- **成功率**: 57%

## 测试配置
- **基础API**: http://localhost:5001/api
- **管理API**: http://localhost:5001/api/admin
- **域名API**: http://storyapp.dandanbaba.xyz/api

## 建议后续操作
⚠️  发现 3 个失败测试，建议：
1. 检查Docker容器日志: docker logs storyapp_prod
2. 检查MongoDB容器日志: docker logs storyapp_mongo
3. 验证网络连接和端口映射
4. 检查环境变量配置

## 有用的命令
```bash
# 查看容器状态
docker-compose ps

# 查看应用日志
docker-compose logs -f app

# 查看资源使用
docker stats storyapp_prod

# 重启应用
docker-compose restart app

# 进入容器调试
docker exec -it storyapp_prod sh
```
