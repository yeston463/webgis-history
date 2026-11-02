// charts.js - ECharts 封装（BlueYard solar atlas：墨色文字、珊瑚/淡紫/赭石数据色）
const _charts = new Set();
const INK = '#090b11', CORAL = '#c63a18', CORAL_BRIGHT = '#e04925', LILAC = '#5f58c7', GOLD = '#9a6a10', TEAL = '#0f6e7c', GREEN = '#2d6b4d', PURPLE = '#6b4fa1';

export const CHART_COLORS = [CORAL_BRIGHT, LILAC, TEAL, GOLD, GREEN, PURPLE, '#b23a5b'];

export function createChart(dom, option) {
  if (!dom || typeof echarts === 'undefined') return null;
  const existing = echarts.getInstanceByDom(dom);
  if (existing) {
    _charts.delete(existing);
    existing.dispose();
  }
  const chart = echarts.init(dom, null, { renderer: 'canvas' });
  chart.setOption(option);
  _charts.add(chart);
  return chart;
}

export function resizeAll() { _charts.forEach((c) => { try { c.resize(); } catch (e) {} }); }
window.addEventListener('resize', resizeAll);

export function baseGrid() { return { left: 52, right: 24, top: 38, bottom: 32 }; }
const CHART_FONT_SANS = '"Source Sans 3", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Atlas Sans SC", "Microsoft YaHei UI", sans-serif';
const CHART_FONT_MONO = '"JetBrains Mono", "Source Sans 3", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Atlas Sans SC", monospace';

export function axisStyle() {
  return {
    axisLine: { lineStyle: { color: 'rgba(9, 11, 17, 0.22)' } },
    axisLabel: { color: 'rgba(9, 11, 17, 0.72)', fontFamily: CHART_FONT_MONO, fontSize: 11, fontWeight: 400 },
    splitLine: { lineStyle: { color: 'rgba(9, 11, 17, 0.08)', type: 'dashed' } },
  };
}

const TOOLTIP_STYLE = {
  backgroundColor: '#fffdfb',
  borderColor: INK,
  borderWidth: 1,
  textStyle: { color: INK, fontSize: 12, fontFamily: CHART_FONT_SANS },
  extraCssText: 'box-shadow: 0 18px 44px -36px rgba(9,11,17,.5); border-radius: 0;',
};

// 通用柱状图
export function barOption(categories, values, { name = '', color = CORAL_BRIGHT, unit = '' } = {}) {
  return {
    grid: baseGrid(),
    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
    xAxis: { type: 'category', data: categories, ...axisStyle() },
    yAxis: { type: 'value', name: unit, nameTextStyle: { color: 'rgba(9, 11, 17, 0.68)', fontWeight: 600 }, ...axisStyle() },
    series: [{ name, type: 'bar', data: values, itemStyle: { color, borderRadius: 0 }, barWidth: '48%' }],
  };
}

// 通用折线/面积图
export function lineOption(xData, series, unitOrOpts = '') {
  const unit = typeof unitOrOpts === 'string' ? unitOrOpts : (unitOrOpts.unit || '');
  return {
    grid: baseGrid(),
    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
    legend: { textStyle: { color: 'rgba(9, 11, 17, 0.68)', fontWeight: 600 }, top: 4 },
    xAxis: { type: 'category', data: xData, ...axisStyle() },
    yAxis: { type: 'value', name: unit, nameTextStyle: { color: 'rgba(9, 11, 17, 0.68)', fontWeight: 600 }, ...axisStyle() },
    series: series.map((s, i) => ({
      name: s.name, type: 'line', smooth: false, data: s.data,
      symbolSize: 7,
      itemStyle: { color: s.color || CHART_COLORS[i % CHART_COLORS.length] },
      areaStyle: s.area ? { opacity: 0.16, color: s.color || CHART_COLORS[i % CHART_COLORS.length] } : undefined,
      lineStyle: { width: 2.8 },
    })),
  };
}

// 城市人口 (柱状) + GDP (折线) 双轴时空联动图
export function dualAxisCityOption(years, popValues, gdpValues) {
  return {
    grid: { left: 46, right: 54, top: 34, bottom: 26 },
    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
    legend: {
      data: ['常住人口 (万人)', '地区 GDP (亿元)'],
      textStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: 11.5, fontWeight: 600 },
      top: 2,
      itemWidth: 14,
      itemHeight: 10,
    },
    xAxis: { type: 'category', data: years, ...axisStyle() },
    yAxis: [
      {
        type: 'value',
        ...axisStyle(),
      },
      {
        type: 'value',
        ...axisStyle(),
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '常住人口 (万人)',
        type: 'bar',
        yAxisIndex: 0,
        data: popValues,
        barWidth: '38%',
        itemStyle: { color: 'rgba(224, 73, 37, 0.62)', borderRadius: 0 },
      },
      {
        name: '地区 GDP (亿元)',
        type: 'line',
        yAxisIndex: 1,
        smooth: false,
        symbolSize: 6,
        data: gdpValues,
        itemStyle: { color: LILAC },
        lineStyle: { width: 2.4, color: LILAC },
      },
    ],
  };
}

// 通用饼图
export function pieOption(items, { title = '' } = {}) {
  return {
    tooltip: { trigger: 'item', ...TOOLTIP_STYLE },
    legend: { textStyle: { color: 'rgba(9, 11, 17, 0.68)' }, bottom: 0, type: 'scroll' },
    series: [{
      name: title, type: 'pie', radius: ['40%', '66%'], center: ['50%', '45%'],
      data: items.map((it, i) => ({ name: it.name, value: it.value, itemStyle: { color: it.color || CHART_COLORS[i % CHART_COLORS.length] } })),
      label: { color: 'rgba(9, 11, 17, 0.68)', fontSize: 12 }, labelLine: { lineStyle: { color: 'rgba(9, 11, 17, 0.36)' } },
    }],
  };
}

// ---------------------------------------------------------------------------
// 建成区扩张：指标计算
// 唯一数据来源：页面已加载的建成区 GeoJSON 经 Turf 测地计算的面积（与统计卡片一致），
// 不在代码中保存任何城市的固定数值或定性结论。
// ---------------------------------------------------------------------------
const MINUS = '\u2212';
const signed = (n, digits = 1) => `${n < 0 ? MINUS : '+'}${Math.abs(n).toFixed(digits)}`;
const fmtKm2 = (n) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const PERIOD_COLORS = [LILAC, CORAL];

export function computeBuiltupMetrics({ key, label, years, areasKm2 }) {
  const periods = [];
  for (let i = 1; i < years.length; i++) {
    const from = years[i - 1];
    const to = years[i];
    const a0 = areasKm2[i - 1];
    const a1 = areasKm2[i];
    const span = Math.max(1, to - from);
    const delta = a1 - a0;
    periods.push({
      from, to, span, a0, a1, delta,
      rate: delta / span,
      cagr: a0 > 0 ? (Math.pow(a1 / a0, 1 / span) - 1) * 100 : null,
    });
  }
  const first = areasKm2[0];
  const last = areasKm2[areasKm2.length - 1];
  return { key, label, years, areas: areasKm2, periods, mult: first > 0 ? last / first : null };
}

// 仅依据数值生成的描述：年均新增面积的变化 + 年均复合增速的变化（以百分点计）
export function describeBuiltupTrend(m) {
  if (!m || m.periods.length < 2) return '';
  const p1 = m.periods[0];
  const p2 = m.periods[m.periods.length - 1];
  const parts = [];
  const r = p1.rate !== 0 ? p2.rate / p1.rate : null;
  const rates = `${p1.rate.toFixed(1)} → ${p2.rate.toFixed(1)} km²/年`;
  if (r != null && r >= 1.15) parts.push(`${p2.from}—${p2.to} 年均新增面积为前一阶段的 ${r.toFixed(1)} 倍（${rates}）`);
  else if (r != null && r <= 0.85) parts.push(`${p2.from}—${p2.to} 年均新增面积比前一阶段下降 ${((1 - r) * 100).toFixed(0)}%（${rates}）`);
  else parts.push(`两阶段年均新增面积基本持平（${rates}）`);
  if (p1.cagr != null && p2.cagr != null) {
    parts.push(`年均复合增速由 ${p1.cagr.toFixed(1)}% 变为 ${p2.cagr.toFixed(1)}%（${signed(p2.cagr - p1.cagr)} 个百分点）`);
  }
  if (m.mult != null) parts.push(`${m.years[0]}—${m.years[m.years.length - 1]} 总面积为初期的 ${m.mult.toFixed(1)} 倍`);
  return parts.join('；');
}

function periodTooltip(label, p) {
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:18px;"><span style="color:rgba(9,11,17,.62);">${k}</span><strong>${v}</strong></div>`;
  return `<div style="font-weight:700;margin-bottom:6px;">${label} · ${p.from}—${p.to}（${p.span} 年）</div>` +
    row('面积', `${fmtKm2(p.a0)} → ${fmtKm2(p.a1)} km²`) +
    row('净增', `${signed(p.delta, 2)} km²`) +
    row('年均新增', `${signed(p.rate)} km²/年`) +
    (p.cagr == null ? '' : row('年均复合增速', `${signed(p.cagr)}%/年`));
}

function niceLinearScale(raw, factor = 1.2, maxSplits = 4) {
  const target = raw * factor;
  if (!(target > 0)) return { max: 10, interval: 5 };
  const exp = Math.pow(10, Math.floor(Math.log10(target)) - 1);
  let best = null;
  for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50, 100]) {
    const tick = m * exp;
    for (let k = 3; k <= maxSplits; k++) {
      const top = tick * k;
      if (top >= target && (!best || top < best.max)) {
        best = { max: +top.toPrecision(6), interval: +tick.toPrecision(6) };
      }
    }
  }
  return best || { max: +target.toPrecision(6), interval: undefined };
}

// 单城：上图为面积（横轴按真实年份间隔），下图为各阶段年均新增面积（柱宽 = 阶段时长）
export function builtupExpansionOption(m, { logScale = false, compact = false } = {}) {
  const years = m.years;
  const xMin = years[0];
  const xMax = years[years.length - 1];
  const pad = Math.max(1, Math.round((xMax - xMin) * 0.04));
  const left = compact ? 46 : 70;
  const right = compact ? 14 : 24;
  const areaScale = niceLinearScale(Math.max(...m.areas, 1), 1.18, 5);
  const rateScale = niceLinearScale(Math.max(...m.periods.map((p) => p.rate), 1), 1.32, 4);
  const periodSeriesNames = m.periods.map((p) => `${p.from}—${p.to} 年均新增`);
  const xAxis = (gridIndex, showLabel) => ({
    type: 'value',
    gridIndex,
    min: xMin - pad,
    max: xMax + pad,
    ...axisStyle(),
    splitLine: { show: false },
    axisTick: { customValues: years },
    axisLabel: { ...axisStyle().axisLabel, show: showLabel, customValues: years, formatter: (v) => String(v) },
  });

  return {
    animationDuration: 300,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    legend: {
      left: 0,
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: compact ? 10 : 16,
      textStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: compact ? 9.5 : 11.5 },
      data: ['建成区面积', ...periodSeriesNames],
    },
    tooltip: {
      trigger: 'item',
      ...TOOLTIP_STYLE,
      formatter: (p) => {
        if (p.seriesIndex === 0) {
          const [yr, area] = p.value;
          return `<div style="font-weight:700;margin-bottom:4px;">${m.label} · ${yr}</div>建成区面积 <strong>${fmtKm2(area)} km²</strong>`;
        }
        const per = m.periods[p.seriesIndex - 1];
        return per ? periodTooltip(m.label, per) : '';
      },
    },
    grid: [
      { left, right, top: compact ? 42 : 48, height: '39%' },
      { left, right, top: compact ? '63%' : '62%', bottom: 26 },
    ],
    xAxis: [xAxis(0, false), xAxis(1, true)],
    yAxis: [
      {
        type: logScale ? 'log' : 'value',
        gridIndex: 0,
        min: logScale ? undefined : 0,
        max: logScale ? undefined : areaScale.max,
        interval: logScale ? undefined : areaScale.interval,
        name: compact ? '' : (logScale ? '面积 km²（对数）' : '面积 km²'),
        nameTextStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: 10.5, align: 'left' },
        ...axisStyle(),
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        max: rateScale.max,
        interval: rateScale.interval,
        name: compact ? '' : '年均新增 km²/年',
        nameTextStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: 10.5, align: 'left' },
        ...axisStyle(),
      },
    ],
    series: [
      {
        name: '建成区面积',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        clip: false,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: INK, borderColor: '#fffdfb', borderWidth: 2 },
        lineStyle: { color: INK, width: 2 },
        label: {
          show: !compact,
          position: 'top',
          distance: 7,
          color: INK,
          fontSize: 11,
          fontFamily: CHART_FONT_MONO,
          formatter: (p) => `${fmtKm2(p.value[1])}`,
        },
        data: years.map((y, i) => ({
          value: [y, m.areas[i]],
          label: { offset: [i === 0 ? 14 : i === years.length - 1 ? -14 : 0, 0] },
        })),
      },
      ...m.periods.map((per, idx) => {
        const color = PERIOD_COLORS[idx % PERIOD_COLORS.length];
        return {
          name: periodSeriesNames[idx],
          type: 'custom',
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: { color },
          encode: { x: [0, 1], y: 2 },
          renderItem: (_params, api) => {
            const topLeft = api.coord([api.value(0), api.value(2)]);
            const bottomRight = api.coord([api.value(1), 0]);
            const gap = 2;
            const x = topLeft[0] + gap;
            const width = Math.max(1, bottomRight[0] - topLeft[0] - gap * 2);
            const y = topLeft[1];
            const height = Math.max(0, bottomRight[1] - topLeft[1]);
            const text = compact
              ? `${per.rate.toFixed(1)}\n${per.cagr == null ? '' : signed(per.cagr) + '%'}`
              : `${per.rate.toFixed(1)} km²/年${per.cagr == null ? '' : `\n年均增速 ${signed(per.cagr)}%`}`;
            return {
              type: 'group',
              children: [
                { type: 'rect', shape: { x, y, width, height }, style: { fill: color, opacity: 0.85 } },
                {
                  type: 'text',
                  style: {
                    text,
                    x: x + width / 2,
                    y: y - 4,
                    align: 'center',
                    verticalAlign: 'bottom',
                    fill: INK,
                    font: `500 ${compact ? 10.5 : 11.5}px ${CHART_FONT_SANS}`,
                    lineHeight: compact ? 13 : 15,
                  },
                },
              ],
            };
          },
          data: [[per.from, per.to, per.rate]],
        };
      }),
    ],
  };
}

// 九城：两阶段对比（指标可选：年均新增面积 km²/年 或 年均复合增速 %/年）
export function builtupCompareOption(list, { activeKey, metric = 'rate', compact = false, flaggedKeys = [] } = {}) {
  const valid = list.filter((m) => m.periods.length >= 2);
  const ref = valid[0];
  if (!ref) return {};
  const periodNames = ref.periods.map((p) => `${p.from}—${p.to}`);
  const unit = metric === 'cagr' ? '%/年' : 'km²/年';
  const pick = (p) => (metric === 'cagr' ? p.cagr : p.rate);
  const flagged = new Set(flaggedKeys);

  return {
    animationDuration: 300,
    grid: { left: compact ? 40 : 60, right: compact ? 8 : 20, top: compact ? 40 : 52, bottom: 30 },
    legend: {
      left: 0,
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: compact ? 10 : 11.5 },
      data: periodNames,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...TOOLTIP_STYLE,
      formatter: (params) => {
        const m = valid[params[0]?.dataIndex ?? 0];
        if (!m) return '';
        const rows = m.periods.map((p) => periodTooltip(m.label, p)).join('<div style="height:6px"></div>');
        const mult = m.mult == null ? '' : `<div style="margin-top:6px;color:rgba(9,11,17,.62);">${m.years[0]}—${m.years[m.years.length - 1]} 总面积为初期的 ${m.mult.toFixed(1)} 倍</div>`;
        const flag = flagged.has(m.key) ? '<div style="margin-top:4px;color:rgba(9,11,17,.62);">* 数据口径与其他城市不同，见图下说明</div>' : '';
        return rows + mult + flag;
      },
    },
    xAxis: {
      type: 'category',
      data: valid.map((m) => m.key),
      ...axisStyle(),
      axisLabel: {
        ...axisStyle().axisLabel,
        fontFamily: CHART_FONT_SANS,
        fontSize: compact ? 11 : 12.5,
        interval: 0,
        formatter: (key, idx) => {
          const m = valid[idx];
          const text = m.label + (flagged.has(key) ? '*' : '');
          return key === activeKey ? `{active|${text}}` : text;
        },
        rich: { active: { color: INK, fontWeight: 'bold', fontFamily: CHART_FONT_SANS, backgroundColor: '#fff0df', padding: [2, 4] } },
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      name: compact ? '' : unit,
      nameTextStyle: { color: 'rgba(9, 11, 17, 0.68)', fontSize: 10.5, align: 'left' },
      ...axisStyle(),
    },
    series: periodNames.map((name, pi) => ({
      name,
      type: 'bar',
      barWidth: compact ? '30%' : '28%',
      barGap: '12%',
      itemStyle: { color: PERIOD_COLORS[pi % PERIOD_COLORS.length], borderRadius: 0 },
      data: valid.map((m) => {
        const p = m.periods[pi];
        const v = p ? pick(p) : null;
        const active = m.key === activeKey;
        return {
          value: v == null ? null : +v.toFixed(2),
          itemStyle: { opacity: active ? 1 : 0.42 },
          label: {
            show: active && !compact && v != null,
            position: 'top',
            color: INK,
            fontSize: 10.5,
            fontFamily: CHART_FONT_MONO,
            formatter: () => (metric === 'cagr' ? `${v.toFixed(1)}%` : v.toFixed(1)),
          },
        };
      }),
    })),
  };
}
