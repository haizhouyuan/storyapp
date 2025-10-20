const envLoader = require('../../config/env-loader.js');
if (envLoader?.loadEnvConfig) {
  envLoader.loadEnvConfig();
}

import crypto from 'crypto';

const host = 'api-dx.xf-yun.com';
const createPath = '/v1/private/dts_create';
const queryPath = '/v1/private/dts_query';

const APP_ID = process.env.IFLYTEK_TTS_APP_ID!;
const API_KEY = process.env.IFLYTEK_TTS_API_KEY!;
const API_SECRET = process.env.IFLYTEK_TTS_API_SECRET!;

const vcn = process.env.IFLYTEK_TTS_VCN || 'x4_doudou';
const sampleText = '你好，这是一段科大讯飞长文本语音合成的测试。';

function buildAuth(path: string) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nPOST ${path} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', API_SECRET).update(signatureOrigin).digest('base64');
  const authorizationOrigin = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  return { date, authorization, authorizationOrigin };
}

async function postWithAuth(path: string, body: unknown) {
  const { date, authorization, authorizationOrigin } = buildAuth(path);
  console.log(`[IFLYTEK] request:${path} date=${date}`);
  console.log(`[IFLYTEK] authorizationOrigin=${authorizationOrigin}`);
  const params = new URLSearchParams({ host, date, authorization });
  const response = await fetch(`https://${host}${path}?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`[IFLYTEK] response(${response.status}) ${text}`);
  return { status: response.status, body: text };
}

async function main() {
  // 创建任务
  const createPayload = {
    header: { app_id: APP_ID },
    parameter: {
      dts: {
        vcn,
        language: 'zh',
        speed: 50,
        volume: 50,
        pitch: 50,
        rhy: 0,
        audio: { encoding: 'lame', sample_rate: 16000 },
        pybuf: { encoding: 'utf8', compress: 'raw', format: 'plain' },
      },
    },
    payload: {
      text: {
        encoding: 'utf8',
        compress: 'raw',
        format: 'plain',
        text: Buffer.from(sampleText).toString('base64'),
      },
    },
  };

  const createRes = await postWithAuth(createPath, createPayload);
  const createJson = JSON.parse(createRes.body);
  if (createJson?.header?.code !== 0) {
    console.error('[IFLYTEK] 创建任务失败');
    process.exit(1);
  }
  const taskId = createJson.header.task_id as string;
  console.log('[IFLYTEK] taskId:', taskId, 'sid:', createJson.header.sid);

  // 轮询查询
  let attempt = 0;
  while (attempt < 10) {
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const queryPayload = { header: { app_id: APP_ID, task_id: taskId } };
    const queryRes = await postWithAuth(queryPath, queryPayload);
    const queryJson = JSON.parse(queryRes.body);
    if (queryJson?.header?.code !== 0) {
      console.error('[IFLYTEK] 查询失败');
      break;
    }
    const status = queryJson.header.task_status;
    console.log(`[IFLYTEK] query attempt ${attempt}, status=${status}`);
    if (status === '5') {
      const audioUrlBase64 = queryJson.payload?.audio?.audio;
      if (audioUrlBase64) {
        const audioUrl = Buffer.from(audioUrlBase64, 'base64').toString('utf8');
        console.log('[IFLYTEK] 音频下载地址:', audioUrl);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
