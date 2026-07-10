      // Neural Network Visualization — SVG (精确还原 PDF 图1 LSTM记忆单元)
      let nnGraph = null;

      const renderNeuralNetwork = () => {
        const algorithm = selectedAlgorithm();
        const container = document.getElementById("networkVisualization");
        if (!container) return;

        if (nnGraph) { nnGraph.destroy(); nnGraph = null; }

        const inputSize = parseInt(paramValue(algorithm, "输入维度", "3")) || 3;
        const hiddenSize = parseInt(paramValue(algorithm, "隐藏层维度", "64")) || 64;
        const nLayers = parseInt(paramValue(algorithm, "LSTM层数", "2")) || 2;
        const outputSize = parseInt(paramValue(algorithm, "输出维度", "2")) || 2;
        const actFn = paramValue(algorithm, ["激活函数", "输出激活"], "ReLU");

        const gMul = (x, y, lbl) => `
    <circle cx="${x}" cy="${y}" r="14" fill="#f97316" stroke="#c2410c" stroke-width="2"/>
    <line x1="${x-8}" y1="${y-8}" x2="${x+8}" y2="${y+8}" stroke="#fff" stroke-width="2.5"/>
    <line x1="${x+8}" y1="${y-8}" x2="${x-8}" y2="${y+8}" stroke="#fff" stroke-width="2.5"/>
    ${lbl ? `<text x="${x}" y="${y-19}" text-anchor="middle" fill="#bae6fd" font-size="11" font-weight="700">${lbl}</text>` : ''}`;

        const gAdd = (x, y, lbl) => `
    <circle cx="${x}" cy="${y}" r="14" fill="#f97316" stroke="#c2410c" stroke-width="2"/>
    <line x1="${x-8}" y1="${y}" x2="${x+8}" y2="${y}" stroke="#fff" stroke-width="2.5"/>
    <line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="#fff" stroke-width="2.5"/>
    ${lbl ? `<text x="${x}" y="${y-19}" text-anchor="middle" fill="#bae6fd" font-size="11" font-weight="700">${lbl}</text>` : ''}`;

        const aBox = (x, y, t) => `
    <rect x="${x-26}" y="${y-14}" width="52" height="28" rx="5" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"/>
    <text x="${x}" y="${y+5}" text-anchor="middle" fill="#1c1917" font-size="13" font-weight="700">${t}</text>`;

        const ioBox = (x, y, t, fg, bg) => `
    <rect x="${x-28}" y="${y-14}" width="56" height="28" rx="5" fill="${bg}" stroke="${fg}" stroke-width="2"/>
    <text x="${x}" y="${y+5}" text-anchor="middle" fill="${fg === '#22c55e' ? '#14532d' : '#374151'}" font-size="12" font-weight="700">${t}</text>`;

        const L = (x1, y1, x2, y2) =>
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="1.8" marker-end="url(#arrHead)"/>`;

        const SL = (x1, y1, x2, y2, c = '#64748b') =>
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.8"/>`;

        container.innerHTML = `
  <svg width="100%" viewBox="0 0 900 355" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrHead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
        <polygon points="0,0 7,3.5 0,7" fill="#64748b"/>
      </marker>
    </defs>

    <!-- Zone backgrounds -->
    <rect x="148" y="28" width="168" height="255" rx="6" fill="rgba(219,234,254,0.18)" stroke="rgba(147,197,253,0.45)" stroke-width="1.5"/>
    <rect x="316" y="28" width="232" height="255" fill="rgba(220,252,231,0.15)" stroke="rgba(134,239,172,0.4)" stroke-width="1.5"/>
    <rect x="548" y="28" width="200" height="255" rx="6" fill="rgba(243,232,255,0.18)" stroke="rgba(216,180,254,0.5)" stroke-width="1.5"/>

    <!-- LSTM cell border -->
    <rect x="145" y="24" width="606" height="263" rx="10" fill="none" stroke="#64748b" stroke-width="2.2" stroke-dasharray="9,5"/>
    <text x="448" y="16" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="700">LSTM 记忆单元</text>

    <!-- Zone labels -->
    <text x="232" y="46" text-anchor="middle" fill="#93c5fd" font-size="11" font-weight="600">遗忘门</text>
    <text x="432" y="46" text-anchor="middle" fill="#86efac" font-size="11" font-weight="600">输入门</text>
    <text x="648" y="46" text-anchor="middle" fill="#c084fc" font-size="11" font-weight="600">输出门</text>

    <!-- C state line (green) -->
    ${SL(30, 82, 222, 82, '#4ade80')}
    ${SL(250, 82, 389, 82, '#4ade80')}
    ${SL(417, 82, 618, 82, '#4ade80')}
    ${SL(638, 82, 870, 82, '#4ade80')}

    <!-- h state line -->
    ${SL(30, 248, 148, 248, '#94a3b8')}
    ${SL(751, 248, 840, 248, '#94a3b8')}
    ${SL(751, 212, 840, 212, '#94a3b8')}

    <!-- I/O Boxes -->
    ${ioBox(30, 82, 'C(t-1)', '#22c55e', '#86efac')}
    ${ioBox(870, 82, 'C(t)', '#22c55e', '#86efac')}
    ${ioBox(30, 248, 'h(t-1)', '#9ca3af', '#e5e7eb')}
    ${ioBox(870, 212, 'h(t)', '#9ca3af', '#e5e7eb')}
    ${ioBox(870, 248, 'h(t)', '#9ca3af', '#e5e7eb')}

    <!-- x_t input -->
    <circle cx="148" cy="308" r="17" fill="#60a5fa" stroke="#2563eb" stroke-width="2.5"/>
    <text x="148" y="313" text-anchor="middle" fill="white" font-size="13" font-weight="700">x(t)</text>

    <!-- FORGET GATE -->
    ${aBox(236, 208, 'σ')}
    ${gMul(236, 82, 'f(t)')}
    ${L(236, 194, 236, 100)}
    ${L(90, 248, 212, 216)}
    ${L(156, 296, 220, 222)}

    <!-- INPUT GATE -->
    ${aBox(370, 208, 'σ')}
    ${aBox(456, 208, 'tanh')}
    ${gMul(420, 155, 'C̃(t)')}
    ${gAdd(403, 82, 'i(t)')}
    ${L(370, 194, 408, 169)}
    ${L(456, 194, 432, 169)}
    ${L(420, 141, 410, 100)}
    ${L(90, 248, 344, 216)}
    ${L(156, 299, 438, 218)}

    <!-- OUTPUT GATE -->
    ${aBox(618, 208, 'σ')}
    ${aBox(658, 126, 'tanh')}
    ${gMul(660, 176, 'o(t)')}
    ${L(568, 82, 645, 113)}
    ${L(658, 140, 658, 162)}
    ${L(618, 194, 648, 183)}
    ${L(90, 248, 592, 216)}
    ${L(156, 302, 598, 220)}
    ${L(674, 174, 838, 210)}
    ${L(674, 178, 838, 246)}

    <!-- Parameter panel -->
    <rect x="8" y="298" width="884" height="50" rx="7" fill="rgba(15,23,42,0.88)" stroke="rgba(59,130,246,0.35)" stroke-width="1.2"/>
    <text x="18" y="318" fill="#7dd3fc" font-size="12" font-weight="700">📊 算法配置</text>
    <text x="18" y="337" fill="#94a3b8" font-size="11">输入: ${inputSize}维  |  隐藏层: ${hiddenSize}  |  LSTM层数: ${nLayers}  |  输出: ${outputSize}维  |  激活: ${actFn}</text>
  </svg>`;
      };
