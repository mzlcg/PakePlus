(function () {
  const STORAGE_KEYS = {
    session: "gridpulse_auth_session",
  };

  const ALLOWED_PAGES = new Set([
    "login.html",
    "index.html",
    "data-management.html",
    "algorithm-config.html",
    "analysis.html",
  ]);

  const USERS = [
    {
      username: "user",
      password: "user123",
      role: "user",
      displayName: "普通用户",
    },
    {
      username: "root",
      password: "root123",
      role: "admin",
      displayName: "管理员 root",
    },
  ];

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const currentPage = () => {
    const pathname = window.location.pathname || "";
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "index.html";
  };

  const normalizePage = (value) => {
    const target = String(value || "").split("?")[0];
    return ALLOWED_PAGES.has(target) ? target : "index.html";
  };

  const loginUrl = (redirectPage) =>
    `login.html?redirect=${encodeURIComponent(normalizePage(redirectPage))}`;

  const getRedirectTarget = () => {
    const params = new URLSearchParams(window.location.search);
    return normalizePage(params.get("redirect") || "index.html");
  };

  const getSession = () => {
    const session = readJson(STORAGE_KEYS.session, null);
    if (!session || !session.username || !session.role) return null;
    return session;
  };

  const isAuthenticated = () => Boolean(getSession());

  const isAdmin = () => getSession()?.role === "admin";

  const login = (username, password) => {
    const account = USERS.find(
      (item) => item.username === String(username || "").trim(),
    );
    if (!account || account.password !== String(password || "")) {
      return {
        ok: false,
        message: "账号或密码错误，请重新输入。",
      };
    }

    const session = {
      username: account.username,
      role: account.role,
      displayName: account.displayName,
      loginAt: new Date().toISOString(),
    };
    writeJson(STORAGE_KEYS.session, session);
    return { ok: true, session };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.session);
    window.location.href = loginUrl("index.html");
  };

  const switchAccount = () => {
    localStorage.removeItem(STORAGE_KEYS.session);
    window.location.href = loginUrl(currentPage());
  };

  const requireAuth = (page) => {
    if (isAuthenticated()) return true;
    window.location.replace(loginUrl(page || currentPage()));
    return false;
  };

  const redirectAuthenticatedUser = () => {
    if (!isAuthenticated()) return false;
    window.location.replace(getRedirectTarget());
    return true;
  };

  const mountUserPanel = (containerId) => {
    const container = document.getElementById(containerId);
    const session = getSession();
    if (!container || !session) return;

    const roleText = session.role === "admin" ? "管理员" : "普通用户";
    container.innerHTML = `
      <div class="flex flex-wrap items-center justify-end gap-3">
        <div class="rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-sky-300">
          ${roleText}
        </div>
        <button
          class="inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          data-action="logout"
          type="button"
        >
          退出登录
        </button>
      </div>
    `;

    const button = container.querySelector('[data-action="logout"]');
    if (button) {
      button.addEventListener("click", logout);
    }
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });

  const loadDataAsset = async ({ jsonPath, scriptPath, globalKey }) => {
    if (window.location.protocol !== "file:") {
      const response = await fetch(jsonPath);
      if (!response.ok) {
        throw new Error(`Failed to load ${jsonPath}: ${response.status}`);
      }
      return response.json();
    }

    if (window[globalKey]) {
      return window[globalKey];
    }

    await loadScript(scriptPath);
    if (!window[globalKey]) {
      throw new Error(`Missing global data after loading ${scriptPath}`);
    }
    return window[globalKey];
  };

  window.SystemAccess = {
    users: USERS.map(({ username, password, role, displayName }) => ({
      username,
      password,
      role,
      displayName,
    })),
    currentPage,
    getRedirectTarget,
    getSession,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    switchAccount,
    requireAuth,
    redirectAuthenticatedUser,
    mountUserPanel,
    loadDataAsset,
  };
})();
