(function () {
  if (!window.echarts) {
    return;
  }

  const epochs = Array.from({ length: 51 }, (_, index) => index * 10);

  const palette = {
    vpp1: "#38bdf8",
    vpp2: "#f59e0b",
    vpp3: "#22c55e",
    axis: "#94a3b8",
    text: "#cbd5e1",
    grid: "rgba(51, 65, 85, 0.48)",
    tooltipBg: "rgba(15, 23, 42, 0.96)",
    tooltipBorder: "rgba(148, 163, 184, 0.22)",
  };

  const curveData = {
    reward: {
      elementId: "trainingRewardChart",
      title: "奖励收敛对比",
      yName: "Reward test ($)",
      min: -170,
      max: 220,
      series: {
        vpp1: [-155.87, 149.65, 172.49, 197.1, 200.69, 203.01, 202.84, 202.35, 202.55, 203, 204.31, 205.56, 205.41, 204.64, 203.81, 203.44, 203.78, 204.06, 205.12, 205.58, 205.49, 205.81, 205.64, 205.46, 204.29, 204.82, 206.21, 205.86, 205.39, 205.21, 205.55, 205.19, 204.67, 205.63, 206.02, 205.49, 204.97, 204.45, 203.91, 203.51, 203.17, 203.31, 203.76, 203.92, 203.39, 203.51, 203.24, 203.63, 204.02, 204.42, 204.81],
        vpp2: [2.72, 55.69, 92.19, 132.98, 139.35, 141.98, 141.29, 142.51, 146.79, 149.43, 150.07, 150.46, 150.35, 150.87, 150.88, 149.67, 151.72, 156.89, 158.83, 150.71, 149.32, 155.76, 157.33, 156.13, 154.29, 155.76, 156.11, 155.8, 155.77, 156.4, 156.5, 157.14, 153.96, 150.85, 155.25, 156.31, 155.18, 157.21, 158.38, 158.26, 162.86, 168.26, 165.93, 162.75, 160.55, 157.99, 158.44, 159.29, 159.4, 162.06, 161.7],
        vpp3: [-101.32, 93.29, 108.31, 124.72, 126.14, 125.94, 127.49, 130.12, 131.62, 134.12, 135.22, 135.71, 137.92, 139.19, 138.97, 139.18, 139.61, 139.53, 140.32, 141.61, 140.66, 139.99, 139.99, 139.54, 139.86, 141.58, 142.65, 142.46, 141.18, 140.05, 139.56, 140.41, 141.17, 141.1, 141.43, 142.41, 142.64, 142.36, 142.18, 142.5, 142.8, 142.62, 142.9, 142.97, 142.45, 142.48, 142.72, 142, 141.55, 141.49, 141.51],
      },
    },
    mae: {
      elementId: "trainingMaeChart",
      title: "MAE 收敛对比",
      yName: "MAE test (%)",
      min: 0,
      max: 35,
      series: {
        vpp1: [33.74, 6.53, 4.84, 3.22, 3.42, 3.64, 3.76, 3.92, 4.02, 4.04, 4.05, 4.07, 4.1, 4.18, 4.21, 4.09, 4.1, 4.25, 4.32, 4.26, 4.24, 4.28, 4.32, 4.28, 4.3, 4.36, 4.37, 4.38, 4.44, 4.59, 4.5, 4.34, 4.44, 4.47, 4.35, 4.41, 4.43, 4.33, 4.38, 4.39, 4.43, 4.53, 4.49, 4.53, 4.55, 4.53, 4.51, 4.43, 4.43, 4.42, 4.48],
        vpp2: [27.59, 18.68, 11.3, 3.39, 2.58, 2.25, 2.43, 2.48, 2.11, 2.12, 2.47, 2.75, 2.93, 2.99, 2.9, 3.03, 3.08, 3.28, 3.41, 3.92, 3.82, 3.18, 3.26, 2.81, 2.66, 2.96, 3.01, 2.92, 3.37, 3.28, 2.76, 2.94, 3.19, 2.99, 3.29, 3.25, 2.77, 2.99, 3.15, 3.43, 4.73, 4.33, 2.68, 2.43, 2.37, 2.58, 2.98, 3.04, 2.95, 3.25, 3.42],
        vpp3: [20.2, 4.84, 3.77, 2.69, 2.8, 2.86, 2.75, 2.84, 2.98, 2.85, 2.71, 2.67, 2.54, 2.48, 2.54, 2.54, 2.55, 2.65, 2.62, 2.57, 2.63, 2.55, 2.52, 2.58, 2.56, 2.51, 2.56, 2.65, 2.63, 2.71, 2.75, 2.68, 2.67, 2.55, 2.45, 2.48, 2.57, 2.61, 2.75, 2.84, 2.76, 2.73, 2.69, 2.73, 2.73, 2.68, 2.63, 2.59, 2.56, 2.56, 2.65],
      },
    },
    mbe: {
      elementId: "trainingMbeChart",
      title: "MBE 收敛对比",
      yName: "MBE test (%)",
      min: 0,
      max: 35,
      series: {
        vpp1: [33.39, 4.52, 2.56, 0.52, 0.52, 0.61, 0.75, 0.91, 0.93, 0.75, 0.68, 0.77, 0.8, 0.86, 0.95, 1.05, 0.99, 0.92, 0.98, 1.03, 0.97, 0.97, 1.04, 1.12, 1.27, 1.32, 1.28, 1.24, 1.35, 1.5, 1.4, 1.29, 1.35, 1.37, 1.31, 1.28, 1.32, 1.33, 1.32, 1.34, 1.27, 1.29, 1.3, 1.39, 1.44, 1.39, 1.48, 1.35, 1.15, 1.2, 1.31],
        vpp2: [27.59, 18.47, 11.06, 2.99, 2.01, 1.63, 1.74, 1.44, 0.71, 0.55, 0.7, 0.64, 0.65, 0.68, 0.67, 0.93, 0.89, 0.9, 1.08, 1.85, 1.74, 1.03, 0.98, 0.61, 0.48, 0.54, 0.75, 0.74, 1.06, 0.98, 0.47, 0.5, 0.85, 0.88, 1.07, 0.97, 0.5, 0.59, 0.68, 0.98, 2.28, 2.16, 0.78, 0.54, 0.48, 0.39, 0.49, 0.56, 0.74, 1.07, 1.22],
        vpp3: [19.68, 3.75, 2.5, 1.18, 1.24, 1.32, 1.17, 1.18, 1.23, 0.96, 0.85, 0.83, 0.6, 0.48, 0.56, 0.59, 0.57, 0.75, 0.68, 0.54, 0.62, 0.61, 0.66, 0.72, 0.61, 0.56, 0.52, 0.54, 0.56, 0.69, 0.78, 0.68, 0.65, 0.52, 0.42, 0.43, 0.46, 0.51, 0.68, 0.72, 0.65, 0.58, 0.48, 0.45, 0.51, 0.52, 0.46, 0.48, 0.46, 0.36, 0.46],
      },
    },
  };

  function buildSeries(name, color, values) {
    return {
      name,
      type: "line",
      smooth: true,
      showSymbol: false,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: {
        width: 2.4,
        color,
      },
      itemStyle: {
        color,
      },
      areaStyle: {
        opacity: 0.06,
        color,
      },
      data: values,
    };
  }

  function buildOption(config) {
    return {
      animation: false,
      backgroundColor: "transparent",
      textStyle: {
        color: palette.text,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: palette.tooltipBg,
        borderColor: palette.tooltipBorder,
        textStyle: {
          color: "#e2e8f0",
        },
        valueFormatter(value) {
          return typeof value === "number" ? value.toFixed(2) : value;
        },
      },
      legend: {
        top: 8,
        right: 0,
        textStyle: {
          color: palette.text,
        },
        itemGap: 18,
        data: ["VPP1 风储", "VPP2 光储", "VPP3 光火储"],
      },
      grid: {
        left: 52,
        right: 20,
        top: 56,
        bottom: 44,
      },
      xAxis: {
        type: "category",
        name: "回合数",
        nameGap: 22,
        nameTextStyle: {
          color: palette.axis,
          fontWeight: 600,
        },
        data: epochs,
        axisLine: {
          lineStyle: {
            color: palette.grid,
          },
        },
        axisLabel: {
          color: palette.axis,
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        name: config.yName,
        min: config.min,
        max: config.max,
        nameTextStyle: {
          color: palette.axis,
          fontWeight: 600,
          padding: [0, 0, 6, 0],
        },
        axisLabel: {
          color: palette.axis,
        },
        axisLine: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: palette.grid,
            type: "dashed",
          },
        },
      },
      series: [
        buildSeries("VPP1 风储", palette.vpp1, config.series.vpp1),
        buildSeries("VPP2 光储", palette.vpp2, config.series.vpp2),
        buildSeries("VPP3 光火储", palette.vpp3, config.series.vpp3),
      ],
    };
  }

  const charts = [];

  Object.values(curveData).forEach((config) => {
    const host = document.getElementById(config.elementId);
    if (!host) {
      return;
    }
    const chart = echarts.init(host);
    chart.setOption(buildOption(config), true);
    charts.push(chart);
  });

  if (charts.length) {
    window.addEventListener("resize", () => {
      charts.forEach((chart) => chart.resize());
    });
  }

  window.AnalysisTrainingCurves = { curveData, epochs };

  // 训练曲线本身不受页面筛选影响，导出即全量：51 个回合 × 3 个 VPP
  const ChartExport = window.ChartExport;
  const Builders = window.ChartExportBuilders;
  if (ChartExport && Builders) {
    ChartExport.register({
      key: "trainingCurves",
      filename: "训练曲线_奖励MAE_MBE_全部回合",
      build: () => Builders.trainingCurvesFull(curveData),
    });
    [
      ["trainingReward", "reward", "奖励训练曲线_全部回合"],
      ["trainingMae", "mae", "MAE训练曲线_全部回合"],
      ["trainingMbe", "mbe", "MBE训练曲线_全部回合"],
    ].forEach(([key, metric, filename]) => {
      ChartExport.register({
        key,
        filename,
        build: () =>
          Builders.trainingCurvesFull({ [metric]: curveData[metric] }),
      });
    });
    ChartExport.mount();
  }
})();
