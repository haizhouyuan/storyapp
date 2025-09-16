import { ObjectId } from 'mongodb';

export interface StoryDocument {
  _id?: ObjectId;
  title: string;
  content: string;  // JSON字符串，包含完整故事内容
  created_at: Date;
  updated_at?: Date;
}

/**
 * 创建新的故事文档
 */
export function createStoryDocument(title: string, content: string): StoryDocument {
  const now = new Date();
  
  return {
    title: title.trim(),
    content: content,
    created_at: now,
    updated_at: now
  };
}

/**
 * 验证故事文档
 */
export function validateStoryDocument(story: Partial<StoryDocument>): string[] {
  const errors: string[] = [];
  
  if (!story.title || story.title.trim().length === 0) {
    errors.push('故事标题不能为空');
  } else if (story.title.length > 200) {
    errors.push('故事标题不能超过200个字符');
  }
  
  if (!story.content || story.content.trim().length === 0) {
    errors.push('故事内容不能为空');
  }
  
  return errors;
}

/**
 * 转换数据库文档到API响应格式
 */
export function storyDocumentToResponse(doc: StoryDocument): any {
  return {
    id: doc._id?.toString(),
    title: doc.title,
    content: doc.content,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at?.toISOString()
  };
}

/**
 * 转换API请求到数据库文档格式
 */
export function requestToStoryDocument(data: {
  title: string;
  content: string;
  created_at?: string;
}): StoryDocument {
  return {
    title: data.title,
    content: data.content,
    created_at: data.created_at ? new Date(data.created_at) : new Date(),
    updated_at: new Date()
  };
}