(function () {
  const $ = (seletor) => document.querySelector(seletor);
  const form = $("#form-login");
  const cpfInput = $("#login-cpf");
  const senhaInput = $("#login-senha");
  const erro = $("#login-erro");
  const enviar = $("#login-enviar");
  let ocupado = false;

  function mascaraCpf(valor) {
    const digitos = String(valor).replace(/\D/g, "").slice(0, 11);
    return digitos
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function mostrarErro(texto) {
    erro.textContent = texto;
    erro.hidden = !texto;
  }

  async function lerJson(resposta) {
    try {
      return await resposta.json();
    } catch (e) {
      return null;
    }
  }

  cpfInput.addEventListener("input", () => {
    cpfInput.value = mascaraCpf(cpfInput.value);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ocupado) return;
    mostrarErro("");

    const senha = senhaInput.value;
    if (senha.length < 6) {
      mostrarErro("A senha precisa ter pelo menos 6 caracteres.");
      senhaInput.focus();
      return;
    }

    ocupado = true;
    enviar.disabled = true;

    try {
      const resposta = await buscarComTempo(new URL("api/sessao.php", window.location.href), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: cpfInput.value,
          senha
        })
      }, 12000);
      const dados = await lerJson(resposta);
      if (!resposta.ok) {
        mostrarErro((dados && dados.erro) || "Não foi possível entrar.");
        return;
      }
      window.location.replace("index.html");
    } catch (e) {
      mostrarErro("Não foi possível conectar ao banco.");
    } finally {
      ocupado = false;
      enviar.disabled = false;
    }
  });

  function buscarComTempo(url, opcoes, ms) {
    const controle = new AbortController();
    const timer = window.setTimeout(() => controle.abort(), ms);
    return fetch(url, Object.assign({
      cache: "no-store",
      credentials: "same-origin",
      signal: controle.signal
    }, opcoes)).finally(() => window.clearTimeout(timer));
  }

  buscarComTempo(new URL("api/sessao.php", window.location.href), {}, 12000)
    .then(async (resposta) => {
      const dados = await lerJson(resposta);
      if (!resposta.ok) {
        mostrarErro((dados && dados.erro) || "Não foi possível verificar o acesso.");
        return;
      }
      if (dados && dados.autenticado) {
        window.location.replace("index.html");
        return;
      }
      cpfInput.focus();
    })
    .catch(() => {
      mostrarErro("Não foi possível conectar ao banco.");
    });
})();
