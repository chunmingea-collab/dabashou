/**
 * 安全 JSON 解析工具
 * 统一处理 JSON 字段的反序列化，避免重复 try-catch
 */

/**
 * 安全解析 JSON 字符串
 * @param {string|null} str - JSON 字符串
 * @param {*} fallback - 解析失败时的默认值
 * @returns {*}
 */
function safeJson(str, fallback) {
  if (str == null) return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch { return fallback; }
}

module.exports = { safeJson };
