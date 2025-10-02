(function () {
  const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
  const replicaSetName = env.MONGO_REPLICA_SET || 'storyapp-rs';
  const primaryHost = env.MONGO_PRIMARY_HOST || 'mongo-primary:27017';
  const secondaryHost = env.MONGO_SECONDARY_HOST || 'mongo-secondary:27017';
  const arbiterHost = env.MONGO_ARBITER_HOST || 'mongo-arbiter:27017';
  const appUser = env.MONGO_APP_USER || 'storyapp_app';
  const appPass = env.MONGO_APP_PASS || 'storyappPass!';
  const backupUser = env.MONGO_BACKUP_USER || 'storyapp_backup';
  const backupPass = env.MONGO_BACKUP_PASS || 'storyappBackup!';
  const databaseName = env.MONGO_DB || 'storyapp';
  const maintenanceDatabase = env.MONGO_MAINTENANCE_DB || 'admin';

  function log(message) {
    print(`[mongo-init] ${message}`);
  }

  function safeStatus() {
    try {
      return rs.status();
    } catch (err) {
      return null;
    }
  }

  function initiateReplicaSet() {
    const status = safeStatus();
    if (status && status.ok === 1) {
      log(`副本集 ${replicaSetName} 已初始化，跳过初始化步骤`);
      return;
    }

    log(`初始化副本集 ${replicaSetName} ...`);
    const config = {
      _id: replicaSetName,
      members: [
        { _id: 0, host: primaryHost, priority: 2 },
        { _id: 1, host: secondaryHost, priority: 1 },
        { _id: 2, host: arbiterHost, arbiterOnly: true }
      ]
    };

    const result = rs.initiate(config);
    log(`副本集初始化结果: ${JSON.stringify(result)}`);
  }

  function waitForPrimary(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = safeStatus();
      if (status && status.ok === 1) {
        const primary = (status.members || []).find(member => member.stateStr === 'PRIMARY');
        if (primary) {
          log(`主节点已就绪: ${primary.name}`);
          return true;
        }
      }
      log('等待主节点选举完成...');
      sleep(2000);
    }
    throw new Error('副本集主节点在预期时间内未就绪');
  }

  function ensureAppUser() {
    const adminDb = db.getSiblingDB(maintenanceDatabase);

    if (!adminDb.getUser(appUser)) {
      log(`创建应用用户 ${appUser}`);
      adminDb.createUser({
        user: appUser,
        pwd: appPass,
        roles: [
          { role: 'readWrite', db: databaseName }
        ]
      });
    } else {
      log(`应用用户 ${appUser} 已存在`);
    }
  }

  function ensureBackupUser() {
    const adminDb = db.getSiblingDB(maintenanceDatabase);

    if (!adminDb.getUser(backupUser)) {
      log(`创建备份用户 ${backupUser}`);
      adminDb.createUser({
        user: backupUser,
        pwd: backupPass,
        roles: [
          { role: 'backup', db: maintenanceDatabase },
          { role: 'read', db: databaseName }
        ]
      });
    } else {
      log(`备份用户 ${backupUser} 已存在`);
    }
  }

  function ensureDatabases() {
    const storyDb = db.getSiblingDB(databaseName);

    function ensureCollection(name) {
      const exists = storyDb.getCollectionInfos({ name: name }).length > 0;
      if (!exists) {
        log(`预创建 ${name} 集合`);
        storyDb.createCollection(name);
      }
    }

    ensureCollection('stories');
    ensureCollection('story_logs');
  }

  initiateReplicaSet();
  waitForPrimary(120000);
  ensureAppUser();
  ensureBackupUser();
  ensureDatabases();

  log('副本集与用户初始化完成');
})();
