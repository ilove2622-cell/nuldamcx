import sharp from 'sharp';

/**
 * 원본 base64 이미지를 작은 JPEG 썸네일로 리사이즈
 * - 최대 변 256px (cover 방식 — 비율 유지하며 채움)
 * - JPEG 품질 70 → 통상 8~20KB 수준
 *
 * 실패 시 null 반환 (썸네일이 없어도 원본은 저장 가능하도록)
 */
export async function makeThumbnail(
  imageBase64: string | undefined | null,
  maxSize = 256
): Promise<string | null> {
  if (!imageBase64) return null;
  try {
    // data URL 프리픽스 제거
    const pure = imageBase64.replace(/^data:image\/[a-z]+;base64,/i, '');
    const buf = Buffer.from(pure, 'base64');
    const out = await sharp(buf)
      .rotate() // EXIF 회전 정보 반영
      .resize(maxSize, maxSize, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    return out.toString('base64');
  } catch (err) {
    console.warn('[makeThumbnail] 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}
