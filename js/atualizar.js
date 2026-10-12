(function () {
  const LIMITE = 72;
  const url = new URL(window.location.href);
  if (url.searchParams.has("atualizacao") || url.searchParams.has("sw")) {
    url.searchParams.delete("atualizacao");
    url.searchParams.delete("sw");
    const limpa = url.pathname + url.search + url.hash;
    history.replaceState(null, "", limpa);
  }

  function appInstalado() {
    return navigator.standalone === true
      || window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || window.matchMedia("(display-mode: minimal-ui)").matches;
  }

  function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    let jaControlava = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!jaControlava) {
        jaControlava = true;
        return;
      }
      if (sessionStorage.getItem("proftech.sw") === "1") return;
      sessionStorage.setItem("proftech.sw", "1");
      window.location.reload();
    });
    window.setTimeout(() => sessionStorage.removeItem("proftech.sw"), 5000);

    const registrar = () => {
      navigator.serviceWorker.register("./sw.js").then((registro) => registro.update()).catch(() => {});
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker.getRegistration().then((registro) => {
        if (registro) registro.update();
      }).catch(() => {});
    });
  }

  async function recarregar() {
    try {
      if ("serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map(async (registro) => {
          await registro.update();
          if (registro.waiting) registro.waiting.postMessage("pular-espera");
        }));
      }
    } catch (e) {
      /* segue o recarregamento mesmo se a checagem falhar */
    }
    const destino = new URL(window.location.href);
    destino.searchParams.set("atualizacao", String(Date.now()));
    window.location.replace(destino.href);
  }

  function prepararPuxar() {
    const aviso = document.createElement("p");
    aviso.className = "puxar";
    aviso.hidden = true;
    aviso.setAttribute("aria-live", "polite");
    aviso.textContent = "Puxe para atualizar";
    document.body.append(aviso);

    let puxando = false;
    let inicioY = 0;
    let distancia = 0;

    function podePuxar(event) {
      if (!appInstalado()) return false;
      if (window.scrollY > 2) return false;
      if (document.querySelector("dialog[open]")) return false;
      const alvo = event.target;
      if (alvo && alvo.closest && alvo.closest("input, textarea, select, button, a")) return false;
      return true;
    }

    function mostrar(texto, pronto) {
      aviso.hidden = false;
      aviso.textContent = texto;
      aviso.classList.toggle("pronto", pronto);
    }

    function esconder() {
      aviso.hidden = true;
      aviso.classList.remove("pronto");
      aviso.textContent = "Puxe para atualizar";
    }

    window.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1 || !podePuxar(event)) {
        puxando = false;
        return;
      }
      puxando = true;
      inicioY = event.touches[0].clientY;
      distancia = 0;
    }, { passive: true });

    window.addEventListener("touchmove", (event) => {
      if (!puxando || !event.touches.length) return;
      if (!appInstalado() || window.scrollY > 2) {
        puxando = false;
        esconder();
        return;
      }
      distancia = event.touches[0].clientY - inicioY;
      if (distancia <= 0) {
        esconder();
        return;
      }
      event.preventDefault();
      mostrar(distancia >= LIMITE ? "Solte para atualizar" : "Puxe para atualizar", distancia >= LIMITE);
    }, { passive: false });

    window.addEventListener("touchend", () => {
      if (!puxando) return;
      const atualizar = distancia >= LIMITE;
      puxando = false;
      distancia = 0;
      if (!atualizar) {
        esconder();
        return;
      }
      mostrar("Atualizando…", true);
      recarregar();
    });

    window.addEventListener("touchcancel", () => {
      puxando = false;
      distancia = 0;
      esconder();
    });
  }

  registrarServiceWorker();
  prepararPuxar();
})();
