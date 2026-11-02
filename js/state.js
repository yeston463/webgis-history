// state.js - 统一的应用状态管理与轻量发布/订阅
// 不依赖任何框架的响应式系统，仅提供显式的 setState / subscribe。

const state = {
  // 当前城市（四城记忆 / 分析页）
  city: null,
  // 改革开放时间轴年份
  year: null,
  // 图层开关
  layers: {
    heritage: true,
    reform: true,
    provinces: true,
  },
  // 分析实验室状态
  analysis: {
    buffer: { distance: 2000, active: false },
    urban: { city: 'shenzhen', yearA: null, yearB: null },
  },
  // 演示模式
  tour: { active: false, step: 0 },
};

const listeners = new Map(); // key -> Set<fn>

export function getState() {
  return state;
}

// 局部更新并通知订阅者；path 形如 "analysis.buffer.distance"
export function setState(patch, path = '') {
  Object.assign(state, deepMerge(state, patch));
  emit(path || '*');
}

function deepMerge(target, patch) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

function emit(path) {
  const fired = new Set();
  const notify = (k) => {
    if (fired.has(k)) return;
    fired.add(k);
    const set = listeners.get(k);
    if (set) set.forEach((fn) => { try { fn(state, path); } catch (e) { console.error(e); } });
  };
  notify(path);
  notify('*');
}
