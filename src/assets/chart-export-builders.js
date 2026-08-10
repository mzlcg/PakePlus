(function () {
  "use strict";

  const QUARTER_HOURS = 0.25;

  function isNum(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function round(value, digits) {
    if (!isNum(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function buildDaySlots() {
    const slots = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
    return slots;
  }

  const DAY_SLOTS = buildDaySlots();

  /**
   * 市场 15 分钟原始曲线：全部日期（不受选中日期影响）
   */
  function marketDailyFull(marketData) {
    const data = marketData || {};
    const dailySeries = data.dailySeries || {};
    const dates = Object.keys(dailySeries).sort();
    const rows = [];

    dates.forEach((date) => {
      (dailySeries[date] || []).forEach((row) => {
        rows.push([
          date,
          row.time,
          row.price,
          row.wind,
          row.solar,
          row.thermal,
        ]);
      });
    });

    return {
      headers: [
        "日期",
        "时间",
        "电价(元/MWh)",
        "风电(MW)",
        "光伏(MW)",
        "火电(MW)",
      ],
      rows,
    };
  }

  /**
   * 月度市场结构：全部年份 × 12 个月（不受选中年份影响）
   */
  function marketMonthlyFull(marketData) {
    const data = marketData || {};
    const yearData = data.yearData || {};
    const years = (data.years || Object.keys(yearData)).map(Number).sort((a, b) => a - b);
    const rows = [];

    years.forEach((year) => {
      const entry = yearData[String(year)];
      if (!entry) return;
      (entry.monthly || []).forEach((item) => {
        rows.push([
          year,
          item.month,
          item.count,
          item.avgPrice,
          item.avgImbalancePrice,
          item.avgWind,
          item.avgSolar,
          item.avgThermal,
          item.avgRenewable,
          item.avgGeneration,
          item.maxPrice,
          item.minPrice,
          item.maxWind,
          item.maxSolar,
          item.revenueWan,
        ]);
      });
    });

    return {
      headers: [
        "年份",
        "月份",
        "样本数",
        "平均电价(元/MWh)",
        "平均不平衡电价(元/MWh)",
        "平均风电(MW)",
        "平均光伏(MW)",
        "平均火电(MW)",
        "平均新能源(MW)",
        "平均总发电(MW)",
        "最高电价(元/MWh)",
        "最低电价(元/MWh)",
        "风电最大(MW)",
        "光伏最大(MW)",
        "收益(万元)",
      ],
      rows,
    };
  }

  /**
   * 训练曲线：全部回合 × 全部 VPP × 全部指标
   */
  function trainingCurvesFull(curveSource) {
    const source = curveSource || {};
    const metricLabels = {
      reward: "Reward test ($)",
      mae: "MAE test (%)",
      mbe: "MBE test (%)",
    };
    const vppLabels = {
      vpp1: "VPP1 风储",
      vpp2: "VPP2 光储",
      vpp3: "VPP3 光火储",
    };
    const rows = [];

    Object.keys(source).forEach((metricKey) => {
      const block = source[metricKey] || {};
      const series = block.series || block;
      Object.keys(series).forEach((vppKey) => {
        const values = series[vppKey] || [];
        values.forEach((value, index) => {
          rows.push([
            index * 10,
            vppLabels[vppKey] || vppKey,
            metricLabels[metricKey] || metricKey,
            value,
          ]);
        });
      });
    });

    return {
      headers: ["回合数", "VPP", "指标", "数值"],
      rows,
    };
  }

  /**
   * VPP 运行明细：全部 VPP × 全部日期 × 全部 15 分钟刻度。
   * 覆盖投标 / 储能 / 收益三个视图用到的所有派生量，按 VPP 逐条输出（长表），
   * 不做跨 VPP 聚合，便于甲方自行透视。
   */
  function vppOperationFull(visualData) {
    const datasets = (visualData || {}).datasets || {};
    const datasetIds = Object.keys(datasets);
    const rows = [];

    datasetIds.forEach((datasetId) => {
      const dataset = datasets[datasetId] || {};
      const seriesByDate = dataset.seriesByDate || {};
      const dates = [...(dataset.dates || Object.keys(seriesByDate))].sort();

      let maxSoc = 0;
      dates.forEach((date) => {
        (seriesByDate[date] || []).forEach((row) => {
          if (isNum(row.soc_eg)) maxSoc = Math.max(maxSoc, row.soc_eg);
        });
      });

      // 按连续时间轴推进，保持与页面图表相同的 SOC 差分口径
      let previousSoc = null;
      dates.forEach((date) => {
        const byTime = Object.fromEntries(
          (seriesByDate[date] || []).map((row) => [row.time, row]),
        );

        DAY_SLOTS.forEach((time) => {
          const row = byTime[time];
          if (!row) {
            previousSoc = null;
            return;
          }

          const socDelta = isNum(previousSoc) ? -(row.soc_eg - previousSoc) : 0;
          const gen = isNum(row.gen_eg) ? row.gen_eg : null;
          const price = isNum(row.imb_eg) ? row.imb_eg : null;
          const dispatch = isNum(gen) ? gen + socDelta : null;
          const batteryPower = socDelta / QUARTER_HOURS;
          const socPct = maxSoc > 0 && isNum(row.soc_eg) ? (row.soc_eg / maxSoc) * 100 : null;
          const bid = isNum(row.bid_eg) ? row.bid_eg : null;

          rows.push([
            datasetId,
            dataset.name || datasetId,
            date,
            time,
            round(gen, 6),
            round(bid, 6),
            round(isNum(row.soc_eg) ? row.soc_eg : null, 6),
            round(dispatch, 6),
            round(batteryPower, 6),
            round(batteryPower > 0 ? batteryPower : 0, 6),
            round(batteryPower < 0 ? batteryPower : 0, 6),
            round(socPct, 4),
            round(price, 6),
            round(isNum(dispatch) && isNum(price) ? dispatch * price : null, 6),
            round(isNum(bid) && isNum(dispatch) ? Math.abs(bid - dispatch) : null, 6),
            round(isNum(row.solar_eg) ? row.solar_eg : null, 6),
            round(isNum(row.thermal_eg) ? row.thermal_eg : null, 6),
          ]);

          previousSoc = isNum(row.soc_eg) ? row.soc_eg : null;
        });
      });
    });

    return {
      headers: [
        "VPP编号",
        "VPP名称",
        "日期",
        "时间",
        "发电量(MWh)",
        "投标量(MWh)",
        "SOC(MWh)",
        "调度量(MWh)",
        "储能功率(MW)",
        "放电功率(MW)",
        "充电功率(MW)",
        "SOC占比(%)",
        "电价(元/MWh)",
        "区间收益(元)",
        "投标偏差(MWh)",
        "光伏出力(MWh)",
        "火电出力(MWh)",
      ],
      rows,
    };
  }

  window.ChartExportBuilders = {
    marketDailyFull,
    marketMonthlyFull,
    trainingCurvesFull,
    vppOperationFull,
  };
})();
