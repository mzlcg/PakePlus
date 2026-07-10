(function () {
  const visualData = window.VPP_VISUAL_DATA;
  const root = document.getElementById("analysisApp");

  if (!root || !visualData || !visualData.datasets || !window.echarts) {
    return;
  }

  const QUARTER_HOURS = 0.25;
  const DEFAULT_DATE = "2019-01-15";
  const ALL_VPPS = "ALL";
  const TAB_IDS = ["bid", "storage", "revenue"];
  const HORIZONS = [1, 3];
  const STORAGE_KEYS = {
    vpp: "analysisSelectedVpp",
    date: "analysisSelectedDate",
    horizon: "analysisSelectedHorizon",
    tab: "analysisSelectedTab",
  };

  const COLORS = {
    slate: "#64748b",
    grid: "rgba(51, 65, 85, 0.55)",
    axis: "#94a3b8",
    text: "#cbd5e1",
    title: "#f8fafc",
    bid: "#f59e0b",
    generation: "#5af191",
    dispatch: "#60a5fa",
    price: "#10b981",
    priceLine: "#fbbf24",
    charge: "#f97316",
    discharge: "#22c55e",
    soc: "#818cf8",
    revenue: "#10b981",
    cumulative: "#7c3aed",
  };

  const META = {
    VPP1: {
      title: "VPP1 风储",
      longTitle: "VPP1 风电 + 储能",
      source: "风电 + 储能",
      shortSource: "风储",
      note: "保留发电、报量、SOC 与电价字段。",
    },
    VPP2: {
      title: "VPP2 光储",
      longTitle: "VPP2 光伏 + 储能",
      source: "光伏 + 储能",
      shortSource: "光储",
      note: "VPP2 原始 Excel 为日间有效数据，夜间缺失时段保持空值，不做补点。",
    },
    VPP3: {
      title: "VPP3 光火储",
      longTitle: "VPP3 光伏 + 火电 + 储能",
      source: "光伏 + 火电 + 储能",
      shortSource: "光火储",
      note: "VPP3 额外保留光伏与火电分项字段，可解释总发电构成。",
    },
  };

  const TAB_META = {
    bid: {
      title: "投标情况",
      subtitle: "基于 Python 日切片逻辑，叠加发电、报量、调度与电价。",
      chartTitle: "发电 - 投标 - 调度对比",
      chartMeta: "调度量 = 发电量 + 储能电量变化；电价沿用 Excel 中 imb_eg。",
    },
    storage: {
      title: "储能运行",
      subtitle: "基于 SOC 差分换算储能功率，展示充放电节奏与 SOC 区间。",
      chartTitle: "储能功率与 SOC",
      chartMeta: "储能功率 = -ΔSOC / 0.25h；正值表示放电，负值表示充电。",
    },
    revenue: {
      title: "收益辅助",
      subtitle: "按区间调度量与电价估算收益，给出累计收益曲线。",
      chartTitle: "电价与收益辅助",
      chartMeta: "区间收益 = 调度量 × 电价；累计收益按当前选择区间顺序累加。",
    },
  };

  const elementIds = [
    "analysisGeneratedAt",
    "analysisRangeSummary",
    "analysisPointSummary",
    "analysisSourceSummary",
    "kpiRevenue",
    "kpiRevenueNote",
    "kpiDeviation",
    "kpiDeviationNote",
    "kpiPower",
    "kpiPowerNote",
    "kpiSoc",
    "kpiSocNote",
    "chartSectionTitle",
    "chartSectionSubtitle",
    "primaryChartTitle",
    "primaryChartMeta",
    "chartDataSource",
    "analysisPrimaryChart",
    "vppTypeValue",
    "vppSourceValue",
    "vppRangeValue",
    "vppGranularityValue",
    "vppCoverageValue",
    "vppColumnsValue",
    "vppFilesValue",
    "fetchPoints",
  ];

  const elements = Object.fromEntries(
    elementIds.map((id) => [id, document.getElementById(id)]),
  );

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function setHtml(element, value) {
    if (element) {
      element.innerHTML = value;
    }
  }

  const datasetIds = Object.keys(visualData.datasets);
  const datasets = Object.fromEntries(
    datasetIds.map((id) => {
      const dataset = visualData.datasets[id];
      dataset.id = id;
      dataset.meta = META[id] || {
        title: id,
        longTitle: id,
        source: dataset.name || id,
        shortSource: id,
        note: "",
      };
      dataset._rowCache = {};
      dataset._maxSoc = computeDatasetMaxSoc(dataset);
      return [id, dataset];
    }),
  );

  const chart = echarts.init(elements.analysisPrimaryChart);

  const state = hydrateState();

  render(state);
  window.addEventListener("resize", () => chart.resize());

  function render(nextState = state) {
    Object.assign(state, normalizeState(nextState));
    persistState();

    const availableDates = getAvailableDates(state.selectedVpp);
    const rangeDates = buildDateRange(
      state.date,
      state.horizon,
      availableDates,
    );
    const selectedIds =
      state.selectedVpp === ALL_VPPS ? datasetIds : [state.selectedVpp];
    const model = buildViewModel(rangeDates, selectedIds);

    renderSummary(model);
    renderKpis(model);
    renderSidebar(model);
    renderChartMeta(model);
    chart.setOption(buildChartOption(model), true);

    return {
      ...state,
      availableDates,
      selectableDates: getSelectableDates(state.selectedVpp, state.horizon),
      vppOptions: getVppOptions(),
    };
  }

  function renderSummary(model) {
    const rangeText =
      model.rangeDates.length === 1
        ? model.rangeDates[0]
        : `${model.rangeDates[0]} 至 ${model.rangeDates[model.rangeDates.length - 1]}`;
    const pointText = `${model.filledPoints}/${model.slots.length} 个刻度有有效数据`;
    const sourceText =
      state.selectedVpp === ALL_VPPS
        ? `聚合 ${model.datasetIds.length} 个 VPP`
        : `${datasets[state.selectedVpp].meta.longTitle}`;

    setText(
      elements.analysisGeneratedAt,
      `Excel 数据生成于 ${visualData.generatedAt}`,
    );
    setText(elements.analysisRangeSummary, `区间 ${rangeText}`);
    setText(
      elements.analysisPointSummary,
      `${model.slots.length} 个 15 分钟刻度`,
    );
    setText(elements.analysisSourceSummary, `${sourceText} · ${pointText}`);
  }

  function renderKpis(model) {
    setText(elements.kpiRevenue, formatRevenueValue(model.totalRevenue));
    setText(
      elements.kpiRevenueNote,
      `有效收益点 ${model.revenuePoints} 个，基于调度量 × 电价估算`,
    );

    setText(
      elements.kpiDeviation,
      formatValueWithUnit(model.avgDeviation, "MWh"),
    );
    setText(
      elements.kpiDeviationNote,
      `平均 |投标 - 调度|，共 ${model.deviationPoints} 个有效刻度`,
    );

    setText(
      elements.kpiPower,
      formatValueWithUnit(model.maxBatteryPower, "MW"),
    );
    setText(
      elements.kpiPowerNote,
      `由 SOC 差分换算，峰值出现在 ${model.maxPowerAt || "--"}`,
    );

    setText(
      elements.kpiSoc,
      model.socMinPct === null || model.socMaxPct === null
        ? "--"
        : `${formatPercent(model.socMinPct)} - ${formatPercent(model.socMaxPct)}`,
    );
    setText(
      elements.kpiSocNote,
      model.totalSocCapacity > 0
        ? `按观测到的 SOC 上限 ${formatNumber(model.totalSocCapacity, 2)} MWh 归一化`
        : "未检测到可归一化的 SOC 容量",
    );
  }

  function renderSidebar(model) {
    const typeText =
      state.selectedVpp === ALL_VPPS
        ? "全部 VPP 聚合视图"
        : datasets[state.selectedVpp].meta.longTitle;
    const sourceText =
      state.selectedVpp === ALL_VPPS
        ? model.datasetIds
            .map((id) => datasets[id].meta.shortSource)
            .join(" + ")
        : datasets[state.selectedVpp].meta.source;
    const rangeText =
      model.rangeDates.length === 1
        ? model.rangeDates[0]
        : `${model.rangeDates[0]} ~ ${model.rangeDates[model.rangeDates.length - 1]}`;
    const coverageText = `${model.filledPoints}/${model.slots.length} (${formatPercent(model.coveragePct, 0)})`;
    const columnsText = model.columns.join(", ");
    const filesText = model.datasetIds
      .map((id) => fileNameOnly(datasets[id].sourceFile))
      .join(" / ");

    setText(elements.vppTypeValue, typeText);
    setText(elements.vppSourceValue, sourceText);
    setText(elements.vppRangeValue, rangeText);
    setText(elements.vppGranularityValue, "15 分钟");
    setText(elements.vppCoverageValue, coverageText);
    setText(elements.vppColumnsValue, columnsText);
    setText(elements.vppFilesValue, filesText);

    setHtml(
      elements.fetchPoints,
      buildFetchNotes(model)
        .map(
          (note) => `
          <li class="flex items-start gap-3">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500"></span>
            <span>${note}</span>
          </li>`,
        )
        .join(""),
    );
  }

  function renderChartMeta(model) {
    const tabMeta = TAB_META[state.tab];
    const sourceText =
      state.selectedVpp === ALL_VPPS
        ? model.datasetIds.join(" + ")
        : state.selectedVpp;
    const rangeText =
      model.rangeDates.length === 1
        ? model.rangeDates[0]
        : `${model.rangeDates[0]} 至 ${model.rangeDates[model.rangeDates.length - 1]}`;
    const detailText =
      state.tab === "bid"
        ? "调度量 = 发电量 + 储能电量变化（储能电量变化 = -(当前 soc_eg - 上一时刻 soc_eg)）；电价沿用 Excel 中 imb_eg。"
        : state.tab === "storage"
          ? "储能功率 = -(当前 soc_eg - 上一时刻 soc_eg) / 0.25h；SOC 下降表示放电，SOC 上升表示充电。"
          : tabMeta.chartMeta;

    setText(elements.chartSectionTitle, tabMeta.title);
    setText(elements.chartSectionSubtitle, tabMeta.subtitle);
    setText(elements.primaryChartTitle, tabMeta.chartTitle);
    setText(
      elements.primaryChartMeta,
      `${rangeText} · ${sourceText} · ${detailText}`,
    );
    setText(elements.chartDataSource, visualData.source);
  }

  function buildChartOption(model) {
    if (state.tab === "storage") {
      return buildStorageOption(model);
    }
    if (state.tab === "revenue") {
      return buildRevenueOption(model);
    }
    return buildBidOption(model);
  }

  function buildBidOption(model) {
    return {
      animation: false,
      backgroundColor: "transparent",
      legend: {
        top: 10,
        left: 10,
        itemGap: 18,
        textStyle: { color: COLORS.text },
        data: ["电价", "发电", "投标", "调度"],
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderColor: "rgba(148, 163, 184, 0.28)",
        textStyle: { color: "#e2e8f0" },
        formatter(params) {
          const slot = model.slots[params[0].dataIndex];
          const lines = [`${slot.date} ${slot.time}`];
          params.forEach((item) => {
            if (
              item.value === null ||
              item.value === undefined ||
              Number.isNaN(item.value)
            ) {
              return;
            }
            const unit = item.seriesName === "电价" ? "" : " MWh";
            lines.push(
              `${item.marker}${item.seriesName}: ${formatNumber(item.value, 2)}${unit}`,
            );
          });
          return lines.join("<br/>");
        },
      },
      grid: { top: 68, right: 56, bottom: 52, left: 58 },
      xAxis: {
        type: "category",
        data: model.axisLabels,
        axisLabel: {
          color: COLORS.axis,
          interval: axisLabelInterval(model.slots.length, state.horizon),
          formatter(value, index) {
            return formatAxisLabel(model.slots[index], state.horizon);
          },
        },
        axisLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: [
        {
          type: "value",
          name: "电量 (MWh)",
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { lineStyle: { color: COLORS.grid, type: "dashed" } },
        },
        {
          type: "value",
          name: "电价",
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "电价",
          type: "bar",
          yAxisIndex: 1,
          data: model.priceSeries,
          barMaxWidth: state.horizon === 1 ? 10 : 7,
          itemStyle: {
            color: COLORS.price,
            borderRadius: [3, 3, 0, 0],
          },
        },
        {
          name: "发电",
          type: "line",
          data: model.genSeries,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2.6, color: COLORS.generation },
          itemStyle: { color: COLORS.generation },
        },
        {
          name: "投标",
          type: "line",
          data: model.bidSeries,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2.4, type: "dashed", color: COLORS.bid },
          itemStyle: { color: COLORS.bid },
        },
        {
          name: "调度",
          type: "line",
          data: model.dispatchSeries,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 3, color: COLORS.dispatch },
          itemStyle: { color: COLORS.dispatch },
        },
      ],
    };
  }

  function buildStorageOption(model) {
    return {
      animation: false,
      backgroundColor: "transparent",
      legend: {
        top: 10,
        left: 10,
        itemGap: 18,
        textStyle: { color: COLORS.text },
        data: ["放电功率", "充电功率", "SOC"],
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderColor: "rgba(148, 163, 184, 0.28)",
        textStyle: { color: "#e2e8f0" },
        formatter(params) {
          const slot = model.slots[params[0].dataIndex];
          const lines = [`${slot.date} ${slot.time}`];
          params.forEach((item) => {
            if (
              item.value === null ||
              item.value === undefined ||
              Number.isNaN(item.value)
            ) {
              return;
            }
            const unit = item.seriesName === "SOC" ? "%" : " MW";
            lines.push(
              `${item.marker}${item.seriesName}: ${formatNumber(item.value, 2)}${unit}`,
            );
          });
          return lines.join("<br/>");
        },
      },
      grid: { top: 68, right: 56, bottom: 52, left: 58 },
      xAxis: {
        type: "category",
        data: model.axisLabels,
        axisLabel: {
          color: COLORS.axis,
          interval: axisLabelInterval(model.slots.length, state.horizon),
          formatter(value, index) {
            return formatAxisLabel(model.slots[index], state.horizon);
          },
        },
        axisLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: [
        {
          type: "value",
          name: "功率 (MW)",
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { lineStyle: { color: COLORS.grid, type: "dashed" } },
        },
        {
          type: "value",
          name: "SOC (%)",
          min: 0,
          max: 100,
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "放电功率",
          type: "bar",
          data: model.dischargePowerSeries,
          barMaxWidth: state.horizon === 1 ? 10 : 7,
          itemStyle: { color: COLORS.discharge },
        },
        {
          name: "充电功率",
          type: "bar",
          data: model.chargePowerSeries,
          barMaxWidth: state.horizon === 1 ? 10 : 7,
          itemStyle: { color: COLORS.charge },
        },
        {
          name: "SOC",
          type: "line",
          yAxisIndex: 1,
          data: model.socPctSeries,
          showSymbol: false,
          connectNulls: false,
          smooth: true,
          lineStyle: { width: 2.8, color: COLORS.soc },
          itemStyle: { color: COLORS.soc },
          areaStyle: { color: "rgba(99, 102, 241, 0.18)" },
        },
      ],
    };
  }

  function buildRevenueOption(model) {
    return {
      animation: false,
      backgroundColor: "transparent",
      legend: {
        top: 10,
        left: 10,
        itemGap: 18,
        textStyle: { color: COLORS.text },
        data: ["区间收益", "累计收益", "电价"],
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderColor: "rgba(148, 163, 184, 0.28)",
        textStyle: { color: "#e2e8f0" },
        formatter(params) {
          const slot = model.slots[params[0].dataIndex];
          const lines = [`${slot.date} ${slot.time}`];
          params.forEach((item) => {
            if (
              item.value === null ||
              item.value === undefined ||
              Number.isNaN(item.value)
            ) {
              return;
            }
            lines.push(
              `${item.marker}${item.seriesName}: ${formatNumber(item.value, 2)}`,
            );
          });
          return lines.join("<br/>");
        },
      },
      grid: { top: 68, right: 56, bottom: 52, left: 58 },
      xAxis: {
        type: "category",
        data: model.axisLabels,
        axisLabel: {
          color: COLORS.axis,
          interval: axisLabelInterval(model.slots.length, state.horizon),
          formatter(value, index) {
            return formatAxisLabel(model.slots[index], state.horizon);
          },
        },
        axisLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: [
        {
          type: "value",
          name: "收益",
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { lineStyle: { color: COLORS.grid, type: "dashed" } },
        },
        {
          type: "value",
          name: "电价",
          nameTextStyle: { color: COLORS.axis, fontWeight: 600 },
          axisLabel: { color: COLORS.axis },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "区间收益",
          type: "bar",
          data: model.intervalRevenueSeries,
          barMaxWidth: state.horizon === 1 ? 10 : 7,
          itemStyle: { color: "rgba(16, 185, 129, 0.72)" },
        },
        {
          name: "累计收益",
          type: "line",
          data: model.cumulativeRevenueSeries,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2.8, color: COLORS.cumulative },
          itemStyle: { color: COLORS.cumulative },
        },
        {
          name: "电价",
          type: "line",
          yAxisIndex: 1,
          data: model.priceSeries,
          showSymbol: false,
          lineStyle: { width: 2, type: "dashed", color: COLORS.priceLine },
          itemStyle: { color: COLORS.priceLine },
        },
      ],
    };
  }

  function buildViewModel(rangeDates, selectedIds) {
    const slots = buildSlots(rangeDates);
    const datasetSlices = selectedIds.map((id) =>
      buildDatasetSlice(datasets[id], slots),
    );
    const totalSocCapacity = selectedIds.reduce(
      (sum, id) => sum + (datasets[id]._maxSoc || 0),
      0,
    );
    const columns = Array.from(
      new Set(selectedIds.flatMap((id) => datasets[id].columns || [])),
    );

    const points = slots.map((slot, index) => {
      const items = datasetSlices.map((slice) => slice.points[index]);
      const gen = sumDefined(items.map((item) => item.gen));
      const bid = sumDefined(items.map((item) => item.bid));
      const soc = sumDefined(items.map((item) => item.soc));
      const dispatch = sumDefined(items.map((item) => item.dispatch));
      const batteryPower = sumDefined(items.map((item) => item.batteryPower));
      const price = averageDefined(items.map((item) => item.price));
      const intervalRevenue =
        isNumber(dispatch) && isNumber(price) ? dispatch * price : null;
      const deviation =
        isNumber(bid) && isNumber(dispatch) ? Math.abs(bid - dispatch) : null;

      return {
        slot,
        gen,
        bid,
        soc,
        dispatch,
        batteryPower,
        price,
        intervalRevenue,
        deviation,
      };
    });

    let cumulativeRevenue = 0;
    let totalRevenue = 0;
    let revenuePoints = 0;
    let deviationSum = 0;
    let deviationPoints = 0;
    let maxBatteryPower = 0;
    let maxPowerAt = "";
    let socMinPct = null;
    let socMaxPct = null;
    let filledPoints = 0;

    const cumulativeRevenueSeries = points.map((point) => {
      if (isNumber(point.intervalRevenue)) {
        totalRevenue += point.intervalRevenue;
        cumulativeRevenue += point.intervalRevenue;
        revenuePoints += 1;
      }
      if (isNumber(point.deviation)) {
        deviationSum += point.deviation;
        deviationPoints += 1;
      }
      if (
        isNumber(point.batteryPower) &&
        Math.abs(point.batteryPower) >= maxBatteryPower
      ) {
        maxBatteryPower = Math.abs(point.batteryPower);
        maxPowerAt = `${point.slot.date} ${point.slot.time}`;
      }
      if (isNumber(point.soc) && totalSocCapacity > 0) {
        const pct = (point.soc / totalSocCapacity) * 100;
        socMinPct = socMinPct === null ? pct : Math.min(socMinPct, pct);
        socMaxPct = socMaxPct === null ? pct : Math.max(socMaxPct, pct);
      }
      if (
        isNumber(point.gen) ||
        isNumber(point.bid) ||
        isNumber(point.soc) ||
        isNumber(point.price)
      ) {
        filledPoints += 1;
      }
      return round(cumulativeRevenue, 2);
    });

    return {
      datasetIds: selectedIds,
      rangeDates,
      slots,
      axisLabels: slots.map((slot) => slot.time),
      columns,
      totalSocCapacity,
      totalRevenue: round(totalRevenue, 2),
      revenuePoints,
      avgDeviation:
        deviationPoints > 0 ? round(deviationSum / deviationPoints, 4) : null,
      deviationPoints,
      maxBatteryPower: round(maxBatteryPower, 4),
      maxPowerAt,
      socMinPct: socMinPct === null ? null : round(socMinPct, 2),
      socMaxPct: socMaxPct === null ? null : round(socMaxPct, 2),
      filledPoints,
      coveragePct: slots.length ? (filledPoints / slots.length) * 100 : 0,
      genSeries: points.map((point) => point.gen),
      bidSeries: points.map((point) => point.bid),
      dispatchSeries: points.map((point) => point.dispatch),
      priceSeries: points.map((point) => point.price),
      intervalRevenueSeries: points.map((point) => point.intervalRevenue),
      cumulativeRevenueSeries,
      dischargePowerSeries: points.map((point) =>
        !isNumber(point.batteryPower)
          ? null
          : Math.max(round(point.batteryPower, 2), 0),
      ),
      chargePowerSeries: points.map((point) =>
        !isNumber(point.batteryPower)
          ? null
          : Math.min(round(point.batteryPower, 2), 0),
      ),
      socPctSeries: points.map((point) =>
        !isNumber(point.soc) || totalSocCapacity <= 0
          ? null
          : round((point.soc / totalSocCapacity) * 100, 2),
      ),
    };
  }

  function buildDatasetSlice(dataset, slots) {
    return {
      id: dataset.id,
      points: slots.map((slot, index) => {
        const row = getRow(dataset, slot.date, slot.time);
        const previousSlot = index > 0 ? slots[index - 1] : null;
        const previousRow =
          previousSlot === null
            ? null
            : getRow(dataset, previousSlot.date, previousSlot.time);

        if (!row) {
          return {
            gen: null,
            bid: null,
            soc: null,
            dispatch: null,
            batteryPower: null,
            price: null,
          };
        }

        const storageDelta =
          previousRow && isNumber(previousRow.soc_eg)
            ? -(row.soc_eg - previousRow.soc_eg)
            : 0;

        return {
          gen: numberOrNull(row.gen_eg),
          bid: numberOrNull(row.bid_eg),
          soc: numberOrNull(row.soc_eg),
          dispatch:
            isNumber(row.gen_eg) && isNumber(storageDelta)
              ? round(row.gen_eg + storageDelta, 6)
              : null,
          batteryPower: isNumber(storageDelta)
            ? round(storageDelta / QUARTER_HOURS, 6)
            : null,
          price: numberOrNull(row.imb_eg),
        };
      }),
    };
  }

  function getRow(dataset, date, time) {
    if (!dataset._rowCache[date]) {
      const rows = dataset.seriesByDate[date] || [];
      dataset._rowCache[date] = Object.fromEntries(
        rows.map((row) => [row.time, row]),
      );
    }
    return dataset._rowCache[date][time] || null;
  }

  function buildFetchNotes(model) {
    const selectedMeta =
      state.selectedVpp === ALL_VPPS ? null : datasets[state.selectedVpp].meta;
    const notes = [
      `${model.rangeDates.length} 天区间共 ${model.slots.length} 个 15 分钟刻度，前端直接按日期切片 Excel 结果。`,
      "调度量按发电量 + 储能电量变化计算，保持与原 Python 日切片展示同一数据口径。",
      "最大储能功率由 SOC 差分换算，首个有效点与缺口后的重启点默认视为 0 功率切换。",
      "收益辅助页使用调度量 × 电价估算区间收益，并给出累计收益曲线。",
    ];

    if (model.datasetIds.includes("VPP2")) {
      notes.splice(
        1,
        0,
        "VPP2 为白天有效记录，夜间缺失时段保留为空值，图表不做插值补齐。",
      );
    }

    if (state.selectedVpp === ALL_VPPS) {
      notes.push(
        "全部 VPP 模式下，发电、投标、SOC 与调度量按选中 VPP 求和，电价按有效记录取均值。",
      );
    } else if (selectedMeta && selectedMeta.note) {
      notes.push(selectedMeta.note);
    }

    return notes;
  }

  function hydrateState() {
    return normalizeState({
      selectedVpp: localStorage.getItem(STORAGE_KEYS.vpp),
      date: localStorage.getItem(STORAGE_KEYS.date) || DEFAULT_DATE,
      tab: localStorage.getItem(STORAGE_KEYS.tab),
      horizon: Number(localStorage.getItem(STORAGE_KEYS.horizon)),
    });
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEYS.vpp, state.selectedVpp);
    localStorage.setItem(STORAGE_KEYS.date, state.date);
    localStorage.setItem(STORAGE_KEYS.tab, state.tab);
    localStorage.setItem(STORAGE_KEYS.horizon, String(state.horizon));
  }

  function getAvailableDates(selectedVpp) {
    if (selectedVpp !== ALL_VPPS) {
      return [...(datasets[selectedVpp].dates || [])];
    }

    return datasetIds.reduce((sharedDates, id, index) => {
      const dates = datasets[id].dates || [];
      if (index === 0) return [...dates];
      const dateSet = new Set(dates);
      return sharedDates.filter((date) => dateSet.has(date));
    }, []);
  }

  function getSelectableDates(selectedVpp, horizon) {
    const dates = getAvailableDates(selectedVpp);
    if (!dates.length) return [];
    const lastStartIndex = Math.max(
      0,
      dates.length - Math.max(Number(horizon) || 1, 1),
    );
    return dates.slice(0, lastStartIndex + 1);
  }

  function getVppOptions() {
    return [
      { value: ALL_VPPS, label: "全部 VPP" },
      ...datasetIds.map((id) => ({
        value: id,
        label: datasets[id].meta.title,
      })),
    ];
  }

  function normalizeState(input) {
    const selectedVpp =
      input?.selectedVpp === ALL_VPPS || datasetIds.includes(input?.selectedVpp)
        ? input.selectedVpp
        : ALL_VPPS;
    const horizon = HORIZONS.includes(Number(input?.horizon))
      ? Number(input.horizon)
      : 1;
    const tab = TAB_IDS.includes(input?.tab) ? input.tab : "bid";
    const availableDates = getAvailableDates(selectedVpp);
    const date = clampDate(
      input?.date || DEFAULT_DATE,
      horizon,
      availableDates,
    );

    return {
      selectedVpp,
      date,
      tab,
      horizon,
    };
  }

  function buildDateRange(startDate, horizon, availableDates) {
    if (!availableDates.length) return [];
    const index = availableDates.indexOf(startDate);
    const safeIndex = index < 0 ? 0 : index;
    return availableDates.slice(safeIndex, safeIndex + horizon);
  }

  function clampDate(date, horizon, availableDates) {
    if (!availableDates.length) return "";
    const lastStartIndex = Math.max(0, availableDates.length - horizon);
    let targetIndex = availableDates.indexOf(date);

    if (targetIndex < 0 && availableDates.includes(DEFAULT_DATE)) {
      targetIndex = availableDates.indexOf(DEFAULT_DATE);
    }
    if (targetIndex < 0) {
      targetIndex = lastStartIndex;
    }

    return availableDates[Math.min(targetIndex, lastStartIndex)];
  }

  function buildSlots(rangeDates) {
    const slots = [];
    rangeDates.forEach((date) => {
      for (let hour = 0; hour < 24; hour += 1) {
        for (let minute = 0; minute < 60; minute += 15) {
          const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          slots.push({ date, time });
        }
      }
    });
    return slots;
  }

  function computeDatasetMaxSoc(dataset) {
    let maxSoc = 0;
    (dataset.dates || []).forEach((date) => {
      (dataset.seriesByDate[date] || []).forEach((row) => {
        if (isNumber(row.soc_eg)) {
          maxSoc = Math.max(maxSoc, row.soc_eg);
        }
      });
    });
    return maxSoc;
  }

  function axisLabelInterval(length, horizon) {
    if (horizon === 1) return 7;
    if (length <= 192) return 15;
    return 23;
  }

  function formatAxisLabel(slot, horizon) {
    if (!slot) return "";
    if (horizon === 1) return slot.time;
    return slot.time === "00:00"
      ? `${slot.date.slice(5)}\n${slot.time}`
      : slot.time;
  }

  function sumDefined(values) {
    const filtered = values.filter(isNumber);
    if (!filtered.length) return null;
    return round(
      filtered.reduce((sum, value) => sum + value, 0),
      6,
    );
  }

  function averageDefined(values) {
    const filtered = values.filter(isNumber);
    if (!filtered.length) return null;
    return round(
      filtered.reduce((sum, value) => sum + value, 0) / filtered.length,
      6,
    );
  }

  function numberOrNull(value) {
    return isNumber(value) ? Number(value) : null;
  }

  function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function formatNumber(value, digits = 2) {
    if (!isNumber(value)) return "--";
    return Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function formatPercent(value, digits = 1) {
    if (!isNumber(value)) return "--";
    return `${formatNumber(value, digits)}%`;
  }

  function formatRevenueValue(value) {
    if (!isNumber(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 10000) {
      return `${formatNumber(value / 10000, 2)} 万`;
    }
    return formatNumber(value, 0);
  }

  function formatValueWithUnit(value, unit) {
    if (!isNumber(value)) return "--";
    return `${formatNumber(value, 2)} ${unit}`;
  }

  function fileNameOnly(path) {
    return String(path || "")
      .split("/")
      .pop();
  }

  window.AnalysisVisualization = {
    allVpps: ALL_VPPS,
    tabs: TAB_IDS,
    horizons: HORIZONS,
    getInitialState: () => ({ ...state }),
    getAvailableDates,
    getSelectableDates,
    getVppOptions,
    normalizeState,
    render,
  };
})();
