// 채널톡 이모지 숏코드(:shortcode:)를 유니코드 이모지로 변환
// 채널톡은 Slack 스타일 숏코드를 사용하지만, 이름이 약간 다름 (하이픈, 접두사 순서 등)

import { emojify, find } from 'node-emoji';

// 채널톡 숏코드 → node-emoji 표준 이름 매핑 (이름이 다른 것만)
const CHANNELTALK_ALIAS: Record<string, string> = {
  // 성별 접두사가 앞에 오는 패턴 → node-emoji는 뒤에
  'woman-tipping-hand': 'tipping_hand_woman',
  'man-tipping-hand': 'tipping_hand_man',
  'woman-bowing': 'bowing_woman',
  'man-bowing': 'bowing_man',
  'woman-raising-hand': 'raising_hand_woman',
  'man-raising-hand': 'raising_hand_man',
  'woman-gesturing-no': 'no_good_woman',
  'man-gesturing-no': 'no_good_man',
  'woman-gesturing-ok': 'ok_woman',
  'man-gesturing-ok': 'ok_man',
  'woman-shrugging': 'woman_shrugging',
  'man-shrugging': 'man_shrugging',
  'woman-facepalming': 'woman_facepalming',
  'man-facepalming': 'man_facepalming',
  'woman-pouting': 'pouting_woman',
  'man-pouting': 'pouting_man',
  'woman-frowning': 'frowning_woman',
  'man-frowning': 'frowning_man',
  // 이름이 완전히 다른 경우
  'heavy_heart_exclamation_mark_ornament': 'heavy_heart_exclamation',
  'heavy-heart-exclamation-mark-ornament': 'heavy_heart_exclamation',
  // 일반적인 채널톡 변형
  'smiling-face-with-three-hearts': 'smiling_face_with_three_hearts',
  'face-with-tears-of-joy': 'joy',
  'folded-hands': 'pray',
  'thumbsup': '+1',
  'thumbsdown': '-1',
  'raised-hands': 'raised_hands',
  'clapping-hands': 'clap',
  'waving-hand': 'wave',
  'sparkles': 'sparkles',
};

// 단일 숏코드를 유니코드로 변환
function resolveShortcode(code: string): string | null {
  // 1. 커스텀 매핑 확인
  const alias = CHANNELTALK_ALIAS[code] || CHANNELTALK_ALIAS[code.replace(/-/g, '_')];
  if (alias) {
    const found = find(alias);
    if (found) return found.emoji;
  }

  // 2. 하이픈→언더스코어 변환 후 시도
  const underscore = code.replace(/-/g, '_');
  const found = find(underscore);
  if (found) return found.emoji;

  // 3. 원본 그대로 시도
  const foundOrig = find(code);
  if (foundOrig) return foundOrig.emoji;

  return null;
}

// :shortcode: 패턴 매칭
const SHORTCODE_REGEX = /:([a-zA-Z0-9_+-]+):/g;

/** 텍스트 내 이모지 숏코드(:xxx:)를 유니코드 이모지로 변환 */
export function emojifyText(text: string): string {
  if (!text) return text;

  // 먼저 node-emoji의 기본 emojify 시도 (직접 매칭되는 것 처리)
  let result = emojify(text);

  // 아직 남은 숏코드가 있으면 커스텀 변환
  result = result.replace(SHORTCODE_REGEX, (match, code) => {
    const emoji = resolveShortcode(code);
    return emoji || match; // 변환 실패시 원본 유지
  });

  return result;
}
