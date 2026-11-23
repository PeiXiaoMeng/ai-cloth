import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * 阿里百炼（DashScope）AI 试穿服务
 * 使用异步任务接口：提交任务 -> 轮询任务状态 -> 拿到结果图 URL
 */
@Injectable()
export class DashscopeService {
  private readonly logger = new Logger(DashscopeService.name);

  private get apiKey() {
    return process.env.DASHSCOPE_API_KEY || '';
  }

  private get model() {
    return process.env.DASHSCOPE_TRYON_MODEL || 'aitryon';
  }

  /**
   * MOCK 模式：未配置 API Key 时可直接联调整个流程（直接返回原图作为结果）
   * 设置环境变量 DASHSCOPE_MOCK=true 开启
   */
  private get mock() {
    return (process.env.DASHSCOPE_MOCK || '').toLowerCase() === 'true';
  }

  async tryOn(
    personImageUrl: string,
    garmentImageUrl: string,
    _garmentType?: string, // 兼容旧参数，qwen-image 不再需要
  ): Promise<string> {
    this.logger.log(`[tryOn] 开始, model=${this.model}, person=${personImageUrl}, garment=${garmentImageUrl}`);
    if (this.mock || !this.apiKey) {
      this.logger.warn('[tryOn] MOCK 模式或未配置 API Key，直接返回原图');
      return personImageUrl;
    }

    // qwen-image-2.0：多模态对话接口，两张图 + 提示词，同步返回结果图
    const requestBody = {
      model: this.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: personImageUrl },
              { image: garmentImageUrl },
              {
                text: '第一张图中是一位人物，第二张图中是一件服装。请把第二张图中的服装穿到第一张图人物的身上，生成试穿效果：保持人物的姿势、脸部、发型和背景完全不变，服装要贴合人物身体，逼真自然，只生成一张图片。',
              },
            ],
          },
        ],
      },
      parameters: { n: 1, watermark: false },
    };
    this.logger.log(`[tryOn] 请求体: ${JSON.stringify(requestBody)}`);

    let res;
    try {
      res = await axios.post(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 180000, // 图像生成较慢，放宽超时
        },
      );
    } catch (e: any) {
      const detail = e?.response?.data ?? e.message;
      this.logger.error(`[tryOn] 调用失败: HTTP ${e?.response?.status ?? '-'} ${JSON.stringify(detail)}`);
      throw new Error(`试穿调用失败: ${JSON.stringify(detail)}`);
    }

    this.logger.log(`[tryOn] 响应: ${JSON.stringify(res.data).slice(0, 2000)}`);

    // 从响应中解析结果图 URL（content 数组里的 image 项；兜底用正则找结果图 URL）
    const content = res?.data?.output?.choices?.[0]?.message?.content;
    let resultUrl = Array.isArray(content)
      ? content.find((c: any) => c.image || c.image_url)?.image || content.find((c: any) => c.image || c.image_url)?.image_url
      : null;
    if (!resultUrl) {
      const raw = JSON.stringify(res.data);
      const m = raw.match(/https?:\\?\/\\?\/[^"']+\.(?:png|jpe?g|webp|bmp)/i);
      resultUrl = m ? m[0].replace(/\\\//g, '/') : null;
    }
    if (!resultUrl) {
      this.logger.error(`[tryOn] 未能从响应中解析出结果图: ${JSON.stringify(res.data).slice(0, 1000)}`);
      throw new Error('试穿成功但未返回图片地址');
    }
    this.logger.log(`[tryOn] 成功, 结果图: ${resultUrl}`);
    return resultUrl;
  }



  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
