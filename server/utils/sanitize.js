/**
 * 输入清洗工具
 * 防止 XSS 与异常输入导致的数据问题
 * 所有用户可控字符串在入库前统一经过 sanitizeString()
 */

/**
 * 清洗单个字符串
 * - 剥除所有 HTML 标签（防止存储型 XSS）
 * - 压缩连续空白为单个空格
 * - 去除首尾空白
 * - 不做长度截断，由调用方根据业务需要自行校验长度
 * @param {string}  s
 * @param {number}  [maxLen] 仅用于文档说明，函数不再截断
 * @returns {string}
 */
function sanitizeString(s, maxLen = 500) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<[^>]*>/g, '')   // 去 HTML 标签
    .replace(/\s+/g, ' ')       // 压缩空白
    .trim();
}

/**
 * 清洗字符串数组（每个元素单独清洗）
 * @param {string[]} arr
 * @param {number}   [maxLen=100]
 * @param {number}   [maxItems=20]
 * @returns {string[]}
 */
function sanitizeStringArray(arr, maxLen = 100, maxItems = 20) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(v => typeof v === 'string')
    .map(v => sanitizeString(v, maxLen))
    .filter(v => v.length > 0)
    .slice(0, maxItems);
}

module.exports = { sanitizeString, sanitizeStringArray };
