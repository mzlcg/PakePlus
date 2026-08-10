(function () {
  "use strict";

  // UTF-8 BOM：保证 Excel 直接双击打开时中文表头不乱码
  const BOM = "﻿";
  const registry = new Map();

  function formatCell(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "";
    }
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(headers, rows) {
    const lines = [];
    if (headers && headers.length) {
      lines.push(headers.map(formatCell).join(","));
    }
    for (let i = 0; i < rows.length; i += 1) {
      lines.push(rows[i].map(formatCell).join(","));
    }
    return BOM + lines.join("\r\n");
  }

  function stamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return (
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    );
  }

  function saveText(filename, text) {
    if (typeof Blob === "undefined" || typeof URL === "undefined") return false;
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  function register(definition) {
    if (
      !definition ||
      !definition.key ||
      typeof definition.build !== "function"
    ) {
      return;
    }
    registry.set(definition.key, definition);
  }

  function keys() {
    return [...registry.keys()];
  }

  function nextFrame() {
    return new Promise((resolve) => setTimeout(resolve, 16));
  }

  async function exportOne(key) {
    const definition = registry.get(key);
    if (!definition) {
      console.warn(`[ChartExport] 未注册的导出项: ${key}`);
      return false;
    }
    // 让按钮的“导出中”状态先绘制出来，再做同步的大数据拼装
    await nextFrame();
    const result = definition.build() || {};
    const rows = result.rows || [];
    if (!rows.length) {
      console.warn(`[ChartExport] ${key} 无可导出数据`);
      return false;
    }
    const base = result.filename || definition.filename || key;
    return saveText(
      `${base}_${stamp()}.csv`,
      toCsv(result.headers || [], rows),
    );
  }

  async function exportAll(targetKeys) {
    const list = (targetKeys && targetKeys.length ? targetKeys : keys()).filter(
      (key) => registry.has(key),
    );
    for (const key of list) {
      await exportOne(key);
      // 浏览器会拦截过快的连续下载，逐个之间留出间隔
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return list.length;
  }

  const BUTTON_CLASS =
    "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-500/40 " +
    "bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-300 transition " +
    "hover:bg-sky-500/20 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50";

  function createButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = label;
    button.addEventListener("click", async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "导出中…";
      try {
        await onClick();
      } catch (error) {
        console.error("[ChartExport] 导出失败", error);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
    return button;
  }

  function mount(root) {
    if (!document || typeof document.createElement !== "function") return;
    const scope = root || document;
    if (typeof scope.querySelectorAll !== "function") return;

    scope.querySelectorAll("[data-chart-export]").forEach((host) => {
      if (host.dataset.chartExportMounted === "1") return;
      const key = host.getAttribute("data-chart-export");
      if (!registry.has(key)) return;
      const definition = registry.get(key);
      host.dataset.chartExportMounted = "1";
      const label =
        host.getAttribute("data-label") || definition.buttonLabel || "导出数据";
      host.appendChild(createButton(label, () => exportOne(key)));
    });

    scope.querySelectorAll("[data-chart-export-all]").forEach((host) => {
      if (host.dataset.chartExportMounted === "1") return;
      const raw = host.getAttribute("data-chart-export-all");
      const targetKeys = raw
        ? raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      host.dataset.chartExportMounted = "1";
      host.appendChild(
        createButton(host.getAttribute("data-label") || "导出数据", () =>
          exportAll(targetKeys),
        ),
      );
    });
  }

  window.ChartExport = {
    register,
    exportOne,
    exportAll,
    mount,
    keys,
    toCsv,
    saveText,
  };
})();
