/**
 * 输入清洗工具
 * 防止 XSS 与异常输入导致的数据问题
 * 所有用户可控字符串在入库前统一经过 sanitizeString()
 */

/**
 * 清洗单个字符串
 * - 剥除所有 HTML 标签（防止存储型 XSS）
 * - 移除常见的 XSS 注入模式（javascript:, 内联事件处理器）
 * - 压缩连续空白为单个空格
 * - 去除首尾空白
 * - 按长度截断（maxLen 传递时生效；默认不截断）
 * @param {string}  s
 * @param {number}  [maxLen] 最大长度，超长则截断；不传或传 0/负数时不截断
 * @returns {string}
 */
function sanitizeString(s, maxLen = 0) {
  if (typeof s !== 'string') return '';
  let result = s
    .replace(/<[^>]*>/g, '')           // 去 HTML 标签
    .replace(/javascript\s*:/gi, '')    // 去 javascript: 伪协议
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // 去内联事件处理器
    .replace(/\s+/g, ' ')               // 压缩空白
    .trim();
  if (maxLen > 0 && result.length > maxLen) {
    result = result.slice(0, maxLen);
  }
  return result;
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
