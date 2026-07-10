(function () {
  function createMarketUI(dataSource) {
  const data = dataSource || {};
  const chartText = "#cbd5e1";
  const gridLine = "rgba(51, 65, 85, 0.55)";
  const colors = {
    blue: "#3b82f6",
    teal: "#14b8a6",
    yellow: "#fbbf24",
    pink: "#f472b6",
    purple: "#a855f7",
    red: "#ef4444",
  };

  const number = (value, digits = 1) =>
    Number(value || 0).toLocaleString("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const rawNumber = (value, digits = 2) => Number((value || 0).toFixed(digits));

  const years = () => data.years || [];
  const dates = () => data.dates || [];

  const selectedYear = () => {
    const saved = Number(localStorage.getItem("marketSelectedYear"));
    return years().includes(saved) ? saved : years()[years().length - 1];
  };

  const selectedDate = () => {
    const saved = localStorage.getItem("marketSelectedDate");
    return dates().includes(saved) ? saved : dates()[dates().length - 1];
  };

  const yearData = (year) => data.yearData[String(year || selectedYear())];
  const dailySeries = (date) =>
    data.dailySeries[String(date || selectedDate())] || [];

  const previousYearData = (year) => {
    const list = years();
    const index = list.indexOf(Number(year));
    if (index <= 0) return null;
    return yearData(list[index - 1]);
  };

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  const initYearSelector = (onChange) => {
    const selector = document.getElementById("yearSelector");
    const current = selectedYear();
    if (!selector) return current;

    selector.innerHTML = years()
      .map((year) => `<option value="${year}">${year}年</option>`)
      .join("");
    selector.value = String(current);
    selector.addEventListener("change", () => {
      const year = Number(selector.value);
      localStorage.setItem("marketSelectedYear", String(year));
      onChange(year);
    });
    return current;
  };

  const initDateInput = (selector, onChange) => {
    const current = selectedDate();
    if (!selector) return current;
    selector.min = dates()[0];
    selector.max = dates()[dates().length - 1];
    selector.value = current;
    selector.addEventListener("change", () => {
      const date = dates().includes(selector.value) ? selector.value : current;
      selector.value = date;
      localStorage.setItem("marketSelectedDate", date);
      localStorage.setItem(
        "marketSelectedYear",
        String(Number(date.slice(0, 4))),
      );
      onChange(date);
    });
    return current;
  };

  const trend = (current, previous, digits = 1) => {
    if (!previous) return "基准年";
    const diff = current - previous;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${number(diff, digits)}`;
  };

  const annualRevenueByVpp = (summary) => {
    const avgPrice = summary.avgPrice || 0;
    const solar = ((summary.totalSolarGwh || 0) * 1000 * avgPrice) / 10000;
    const wind = ((summary.totalWindGwh || 0) * 1000 * avgPrice) / 10000;
    const thermal = ((summary.totalThermalGwh || 0) * 1000 * avgPrice) / 10000;
    return [
      {
        id: "VPP1",
        name: "VPP1 光伏储能",
        value: rawNumber(solar, 2),
        color: colors.yellow,
      },
      {
        id: "VPP2",
        name: "VPP2 风电储能",
        value: rawNumber(wind, 2),
        color: colors.teal,
      },
      {
        id: "VPP3",
        name: "VPP3 光伏火电储能",
        value: rawNumber(solar + thermal, 2),
        color: colors.blue,
      },
    ];
  };

  const sourceRows = (summary) => [
    {
      id: "VPP1",
      name: "VPP1 光伏储能",
      source: "光伏 + 储能",
      avgPower: summary.avgSolar,
      annualEnergy: summary.totalSolarGwh,
      revenue: annualRevenueByVpp(summary)[0].value,
      share: summary.renewableShare,
      status: "光伏实测",
      color: colors.yellow,
    },
    {
      id: "VPP2",
      name: "VPP2 风电储能",
      source: "风电 + 储能",
      avgPower: summary.avgWind,
      annualEnergy: summary.totalWindGwh,
      revenue: annualRevenueByVpp(summary)[1].value,
      share: summary.renewableShare,
      status: "风电实测",
      color: colors.teal,
    },
    {
      id: "VPP3",
      name: "VPP3 光伏火电储能",
      source: "光伏 + 火电 + 储能",
      avgPower: rawNumber(
        (summary.avgSolar || 0) + (summary.avgThermal || 0),
        2,
      ),
      annualEnergy: rawNumber(
        (summary.totalSolarGwh || 0) + (summary.totalThermalGwh || 0),
        2,
      ),
      revenue: annualRevenueByVpp(summary)[2].value,
      share: 100,
      status: "实测+模型",
      color: colors.blue,
    },
  ];

  const chartBase = {
    backgroundColor: "transparent",
    textStyle: { color: chartText },
  };

  const axisLine = { lineStyle: { color: "#334155" } };
  const dashedGrid = { lineStyle: { color: gridLine, type: "dashed" } };

    return {
      data,
      colors,
      chartText,
      gridLine,
      chartBase,
      axisLine,
      dashedGrid,
      years,
      dates,
      selectedYear,
      selectedDate,
      yearData,
      dailySeries,
      previousYearData,
      initYearSelector,
      initDateInput,
      setText,
      number,
      rawNumber,
      trend,
      annualRevenueByVpp,
      sourceRows,
    };
  }

  window.createMarketUI = createMarketUI;
  if (window.VPP_MARKET_DATA) {
    window.MarketUI = createMarketUI(window.VPP_MARKET_DATA);
  }
})();
