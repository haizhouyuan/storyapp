#!/usr/bin/env node
/**
 * DeepSeek 调用与侦探故事工作流通用工具。
 * 所有 Stage 脚本复用此模块。
 */

import fs from 'fs';

export const DEFAULT_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
export const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  console.error('缺少 DEEPSEEK_API_KEY，无法调用 DeepSeek API');
  process.exit(1);
}

export const config = {
  apiUrl: DEFAULT_API_URL,
  planningModel: process.env.DETECTIVE_PLANNING_MODEL || 'deepseek-reasoner',
  writingModel: process.env.DETECTIVE_WRITING_MODEL || 'deepseek-chat',
  reviewModel: process.env.DETECTIVE_REVIEW_MODEL || 'deepseek-reasoner',
  maxTokens: Number.parseInt(process.env.DETECTIVE_MAX_TOKENS ?? '6000', 10),
  temperaturePlanning: Number.parseFloat(process.env.DETECTIVE_PLANNING_TEMPERATURE ?? '0.3'),
  temperatureWriting: Number.parseFloat(process.env.DETECTIVE_WRITING_TEMPERATURE ?? '0.6'),
  temperatureReview: Number.parseFloat(process.env.DETECTIVE_REVIEW_TEMPERATURE ?? '0.2'),
};

export function printStageHeader(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`>>> ${title}`);
  console.log('='.repeat(80) + '\n');
}

export async function callDeepseek({ model, temperature, maxTokens, messages }) {
  console.log('[DeepSeek] 调用参数:', { model, temperature, maxTokens, messagesCount: messages.length });
  const response = await fetch(`${config.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg =
      data?.error?.message || data?.message || `DeepSeek API 调用失败，状态码 ${response.status}`;
    console.error('[DeepSeek] 响应错误详情:', JSON.stringify(data, null, 2));
    throw new Error(errorMsg);
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (!messageContent) {
    console.error('[DeepSeek] 响应缺少 message.content:', JSON.stringify(data, null, 2));
    throw new Error('DeepSeek 响应缺少内容');
  }

  console.log('[DeepSeek] 调用成功，token 用量:', data?.usage);
  return {
    content: messageContent,
    usage: data?.usage,
    raw: data,
  };
}

export function extractJson(content) {
  const cleaned = String(content || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (error) {
        console.error('[JSON] 二次解析失败，candidate:', candidate);
        throw error;
      }
    }
  }

  console.error('[JSON] 无法解析，原始内容:\n', content);
  throw new Error('无法解析模型返回的 JSON');
}

export function readJsonFile(filePath, label) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    console.log(`[File] 成功读取 ${label}: ${filePath}`);
    return parsed;
  } catch (error) {
    console.error(`[File] 读取或解析 ${label} 失败 (${filePath}):`, error);
    process.exit(1);
  }
}

export function writeJsonFile(filePath, data, label) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[File] 已保存 ${label} 至 ${filePath}`);
  } catch (error) {
    console.error(`[File] 写入 ${label} 失败 (${filePath}):`, error);
  }
}
