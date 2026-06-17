let allItems = [];
let currentItem = null;

document.addEventListener('DOMContentLoaded', async () => {
  allItems = await getAllItems();
  populateSelect();

  document.getElementById('item-select').addEventListener('change', onItemSelect);
  document.getElementById('btn-simulate').addEventListener('click', simulatePriceUpdate);
});

function populateSelect() {
  const select = document.getElementById('item-select');
  select.innerHTML = '<option value="">选择商品查看价格记录</option>' +
    allItems.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

async function onItemSelect() {
  const id = document.getElementById('item-select').value;
  if (!id) {
    document.getElementById('chart-section').classList.add('hidden');
    document.getElementById('stats-section').classList.add('hidden');
    document.getElementById('records-section').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    currentItem = null;
    return;
  }

  allItems = await getAllItems();
  currentItem = allItems.find(i => i.id === id);
  if (!currentItem) return;

  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('chart-section').classList.remove('hidden');
  document.getElementById('stats-section').classList.remove('hidden');
  document.getElementById('analysis-section').classList.remove('hidden');
  document.getElementById('records-section').classList.remove('hidden');

  renderChart();
  renderStats();
  renderAnalysis();
  renderRecords();
}

function renderChart() {
  if (!currentItem || !currentItem.priceHistory || currentItem.priceHistory.length === 0) return;

  const history = currentItem.priceHistory;
  document.getElementById('chart-title').textContent = currentItem.name;

  const prices = history.map(h => h.price);
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const range = maxP - minP || 1;
  const padding = range * 0.1;
  const chartMin = Math.max(0, minP - padding);
  const chartMax = maxP + padding;
  const chartRange = chartMax - chartMin;

  const yAxis = document.getElementById('chart-y-axis');
  const steps = 5;
  let yLabels = '';
  for (let i = steps; i >= 0; i--) {
    const val = chartMin + (chartRange * i / steps);
    yLabels += `<span>¥${val.toFixed(0)}</span>`;
  }
  yAxis.innerHTML = yLabels;

  const svg = document.getElementById('price-svg');
  const chartArea = svg.parentElement;
  const w = chartArea.clientWidth;
  const h = chartArea.clientHeight;

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  let svgContent = '';

  for (let i = 0; i <= steps; i++) {
    const y = h - (h * i / steps);
    svgContent += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="4"/>`;
  }

  if (currentItem.targetPrice > 0) {
    const targetY = h - ((currentItem.targetPrice - chartMin) / chartRange) * h;
    if (targetY >= 0 && targetY <= h) {
      svgContent += `<line x1="0" y1="${targetY}" x2="${w}" y2="${targetY}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="6"/>`;
    }
  }

  const displayHistory = history.length > 30 ? history.slice(-30) : history;
  const pointCount = displayHistory.length;

  if (pointCount >= 2) {
    let pathD = '';
    let areaD = '';
    displayHistory.forEach((record, idx) => {
      const x = (idx / (pointCount - 1)) * w;
      const y = h - ((record.price - chartMin) / chartRange) * h;
      if (idx === 0) {
        pathD += `M${x},${y}`;
        areaD += `M${x},${h} L${x},${y}`;
      } else {
        pathD += ` L${x},${y}`;
        areaD += ` L${x},${y}`;
      }
    });
    areaD += ` L${w},${h} Z`;

    svgContent += `<path d="${areaD}" fill="url(#areaGradient)" opacity="0.3"/>`;
    svgContent += `<defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4f6ef7" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#4f6ef7" stop-opacity="0.05"/>
    </linearGradient></defs>`;
    svgContent += `<path d="${pathD}" fill="none" stroke="#4f6ef7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

    displayHistory.forEach((record, idx) => {
      const x = (idx / (pointCount - 1)) * w;
      const y = h - ((record.price - chartMin) / chartRange) * h;
      const isLowest = record.price === Math.min(...prices);
      const fill = isLowest ? '#22c55e' : '#4f6ef7';
      const r = isLowest ? 4 : 3;
      svgContent += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>`;
    });
  }

  svg.innerHTML = svgContent;

  const xAxis = document.getElementById('chart-x-axis');
  if (displayHistory.length > 0) {
    const step = Math.max(1, Math.floor(displayHistory.length / 6));
    let xLabels = '';
    for (let i = 0; i < displayHistory.length; i += step) {
      xLabels += `<span>${formatDateShort(displayHistory[i].date)}</span>`;
    }
    if ((displayHistory.length - 1) % step !== 0) {
      xLabels += `<span>${formatDateShort(displayHistory[displayHistory.length - 1].date)}</span>`;
    }
    xAxis.innerHTML = xLabels;
  }
}

function renderStats() {
  if (!currentItem) return;

  const history = currentItem.priceHistory;
  const prices = history.map(h => h.price);
  const low = getLowestPrice(history);
  const high = getHighestPrice(history);
  const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const fluctuation = getRecentFluctuation(history, 7);

  document.getElementById('stat-current').textContent = formatPrice(currentItem.currentPrice);
  document.getElementById('stat-lowest').textContent = low !== null ? formatPrice(low) : '--';
  document.getElementById('stat-highest').textContent = high !== null ? formatPrice(high) : '--';
  document.getElementById('stat-avg').textContent = formatPrice(avg);
  document.getElementById('stat-count').textContent = history.length;

  const flucEl = document.getElementById('stat-fluctuation');
  flucEl.textContent = `${fluctuation.trend === 'down' ? '↓' : fluctuation.trend === 'up' ? '↑' : '→'} ${fluctuation.percent.toFixed(1)}%`;
  flucEl.className = `stat-box-value ${fluctuation.trend === 'down' ? 'price-down' : fluctuation.trend === 'up' ? 'price-up' : ''}`;
}

function renderRecords() {
  if (!currentItem) return;

  const history = [...currentItem.priceHistory].reverse();
  document.getElementById('record-count').textContent = `共 ${history.length} 条`;

  const table = document.getElementById('records-table');
  if (history.length === 0) {
    table.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div class="title">暂无记录</div></div>';
    return;
  }

  table.innerHTML = history.map((record, idx) => {
    const prevPrice = idx < history.length - 1 ? history[idx + 1].price : null;
    let changeHtml = '';
    if (prevPrice !== null) {
      const diff = record.price - prevPrice;
      if (diff < 0) {
        changeHtml = `<span class="price-down">↓ ${Math.abs(diff).toFixed(2)}</span>`;
      } else if (diff > 0) {
        changeHtml = `<span class="price-up">↑ ${diff.toFixed(2)}</span>`;
      } else {
        changeHtml = '<span class="price-same">→ 0</span>';
      }
    } else {
      changeHtml = '<span class="price-same">--</span>';
    }

    return `
      <div class="record-row">
        <span class="record-price">${formatPrice(record.price)}</span>
        <span class="record-change">${changeHtml}</span>
        <span class="record-source">${escapeHtml(record.source || '')}</span>
        <span class="record-date">${formatDate(record.date)}</span>
      </div>`;
  }).join('');
}

function renderAnalysis() {
  if (!currentItem || !currentItem.priceHistory || currentItem.priceHistory.length === 0) return;

  const history = currentItem.priceHistory;
  const low = getLowestPrice(history);
  const high = getHighestPrice(history);

  const f7 = getRecentFluctuation(history, 7);
  const f30 = getRecentFluctuation(history, 30);

  const trendLabel = (f) => f.trend === 'down' ? '下降' : f.trend === 'up' ? '上升' : '平稳';
  const trendIcon = (f) => f.trend === 'down' ? '📉' : f.trend === 'up' ? '📈' : '➡️';
  const trendCls = (f) => f.trend === 'down' ? 'price-down' : f.trend === 'up' ? 'price-up' : 'price-same';

  document.getElementById('analysis-7d').innerHTML = `
    <div class="analysis-trend ${trendCls(f7)}">
      <span class="analysis-icon">${trendIcon(f7)}</span>
      <span class="analysis-direction">${trendLabel(f7)}</span>
      <span class="analysis-pct">${f7.percent.toFixed(1)}%</span>
    </div>
    <div class="analysis-detail">变化金额: ${f7.trend === 'stable' ? '--' : formatPrice(f7.change)}</div>
  `;

  document.getElementById('analysis-30d').innerHTML = `
    <div class="analysis-trend ${trendCls(f30)}">
      <span class="analysis-icon">${trendIcon(f30)}</span>
      <span class="analysis-direction">${trendLabel(f30)}</span>
      <span class="analysis-pct">${f30.percent.toFixed(1)}%</span>
    </div>
    <div class="analysis-detail">变化金额: ${f30.trend === 'stable' ? '--' : formatPrice(f30.change)}</div>
  `;

  if (low !== null) {
    const lowestRecord = history.reduce((min, r) => r.price < min.price ? r : min, history[0]);
    const daysSinceLow = Math.floor((Date.now() - new Date(lowestRecord.date).getTime()) / 86400000);
    document.getElementById('analysis-lowest-time').innerHTML = `
      <div class="analysis-big-val price-down">${formatPrice(low)}</div>
      <div class="analysis-detail">出现于 ${formatDate(lowestRecord.date)}</div>
      <div class="analysis-detail">${daysSinceLow === 0 ? '今天' : daysSinceLow + ' 天前'}</div>
    `;
  } else {
    document.getElementById('analysis-lowest-time').innerHTML = '<div class="analysis-detail">暂无数据</div>';
  }

  if (currentItem.targetPrice > 0) {
    const gap = currentItem.currentPrice - currentItem.targetPrice;
    const gapPct = ((gap / currentItem.targetPrice) * 100).toFixed(1);
    const reached = isTargetReached(currentItem);
    document.getElementById('analysis-target-gap').innerHTML = reached
      ? `<div class="analysis-big-val price-down">✅ 已达标</div>
         <div class="analysis-detail">当前价低于目标价 ${formatPrice(Math.abs(gap))}</div>`
      : `<div class="analysis-big-val price-up">还差 ${formatPrice(gap)}</div>
         <div class="analysis-detail">距目标价 ${gapPct}%</div>
         <div class="gap-bar-wrapper">
           <div class="gap-bar-bg">
             <div class="gap-bar-fill" style="width:${Math.max(5, 100 - parseFloat(gapPct))}%"></div>
           </div>
           <span class="gap-bar-label">${(100 - parseFloat(gapPct)).toFixed(0)}%</span>
         </div>`;
  } else {
    document.getElementById('analysis-target-gap').innerHTML = '<div class="analysis-detail">未设定目标价</div>';
  }

  const advice = generateBuyAdvice(currentItem, history, low, high, f7, f30);
  const buyCard = document.getElementById('analysis-buy-card');
  buyCard.className = `analysis-card analysis-card-buy advice-${advice.level}`;
  document.getElementById('analysis-buy-advice').innerHTML = `
    <div class="advice-level">${advice.icon} ${advice.label}</div>
    <div class="advice-reason">${advice.reason}</div>
  `;
}

function generateBuyAdvice(item, history, low, high, f7, f30) {
  if (isTargetReached(item)) {
    return {
      level: 'strong',
      icon: '🟢',
      label: '强烈建议买入',
      reason: `当前价 ${formatPrice(item.currentPrice)} 已达到目标价 ${formatPrice(item.targetPrice)}，符合您的预期价格。`
    };
  }

  if (low !== null && item.currentPrice <= low * 1.05) {
    return {
      level: 'good',
      icon: '🟢',
      label: '建议买入',
      reason: `当前价接近历史最低 ${formatPrice(low)}，处于低价区间，性价比较高。`
    };
  }

  if (f7.trend === 'down' && f7.percent > 5) {
    return {
      level: 'wait',
      icon: '🟡',
      label: '可再观望',
      reason: `近期价格呈下降趋势（7日↓${f7.percent.toFixed(1)}%），可能继续走低，建议持续观察。`
    };
  }

  if (f7.trend === 'up' && f7.percent > 3) {
    return {
      level: 'consider',
      icon: '🟠',
      label: '考虑入手',
      reason: `近期价格呈上升趋势（7日↑${f7.percent.toFixed(1)}%），如需购买可考虑尽早入手避免涨价。`
    };
  }

  if (item.targetPrice > 0 && item.currentPrice <= item.targetPrice * 1.1) {
    return {
      level: 'close',
      icon: '🟡',
      label: '接近目标',
      reason: `当前价距目标价仅差 ${formatPrice(item.currentPrice - item.targetPrice)}，可以关注是否有优惠活动。`
    };
  }

  return {
    level: 'wait',
    icon: '⚪',
    label: '继续观察',
    reason: '价格波动较小，暂无明显买入信号，建议继续观察等待更好时机。'
  };
}

async function simulatePriceUpdate() {
  if (!currentItem) {
    alert('请先选择一个商品');
    return;
  }

  const volatility = 0.05;
  const change = (Math.random() - 0.5) * 2 * volatility;
  let newPrice = currentItem.currentPrice * (1 + change);
  newPrice = Math.round(Math.max(1, newPrice) * 100) / 100;

  await addPriceRecord(currentItem.id, newPrice, '模拟更新');

  allItems = await getAllItems();
  currentItem = allItems.find(i => i.id === currentItem.id);

  renderChart();
  renderStats();
  renderAnalysis();
  renderRecords();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
