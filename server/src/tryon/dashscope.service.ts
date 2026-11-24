import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * DashScope AI virtual try-on service
 * Uses the multimodal-generation endpoint: two images + a prompt, returns the result image synchronously
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
   * MOCK mode: without an API key the whole flow can still be exercised (returns the person image as the result)
   * Enable by setting the environment variable DASHSCOPE_MOCK=true
   */
  private get mock() {
    return (process.env.DASHSCOPE_MOCK || '').toLowerCase() === 'true';
  }

  async tryOn(
    personImageUrl: string,
    garmentImageUrl: string,
    _garmentType?: string, // legacy parameter, no longer needed by qwen-image
  ): Promise<string> {
    this.logger.log(`[tryOn] start, model=${this.model}, person=${personImageUrl}, garment=${garmentImageUrl}`);
    if (this.mock || !this.apiKey) {
      this.logger.warn('[tryOn] MOCK mode or API key not configured, returning the person image as-is');
      return personImageUrl;
    }

    // qwen-image-2.0: multimodal chat endpoint, two images + prompt, returns the result image synchronously
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
                // Chinese prompt is intentional: it is sent to the qwen model and tuned for it
                text: '第一张图中是一位人物，第二张图中是一件服装。请把第二张图中的服装穿到第一张图人物的身上，生成试穿效果：保持人物的姿势、脸部、发型和背景完全不变，服装要贴合人物身体，逼真自然，只生成一张图片。',
              },
            ],
          },
        ],
      },
      parameters: { n: 1, watermark: false },
    };
    this.logger.log(`[tryOn] request body: ${JSON.stringify(requestBody)}`);

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
          timeout: 180000, // image generation is slow, use a generous timeout
        },
      );
    } catch (e: any) {
      const detail = e?.response?.data ?? e.message;
      this.logger.error(`[tryOn] call failed: HTTP ${e?.response?.status ?? '-'} ${JSON.stringify(detail)}`);
      throw new Error(`Try-on call failed: ${JSON.stringify(detail)}`);
    }

    this.logger.log(`[tryOn] response: ${JSON.stringify(res.data).slice(0, 2000)}`);

    // Parse the result image URL from the response (the image item in the content array; fall back to a regex scan)
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
      this.logger.error(`[tryOn] failed to parse the result image from the response: ${JSON.stringify(res.data).slice(0, 1000)}`);
      throw new Error('Try-on succeeded but no image URL was returned');
    }
    this.logger.log(`[tryOn] success, result image: ${resultUrl}`);
    return resultUrl;
  }


  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
